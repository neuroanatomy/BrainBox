/**
 * NeuroWebLab's shared project-management suite, slices 1 (access matrix),
 * 2 (create, save, delete, validation, versions), 3 (listings and search) and
 * 4 (annotations by project), against the server test/runner.js started
 * (test/integration/*.js runs it with the rest) (neuroweblab/conformance/README.md).
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const WebSocket = require('ws');
const { accessMatrix, projectAnnotations, projectLifecycle, projectListings } = require('neuroweblab/conformance');
const U = require('../utils.js');

const db = () => U.getNativeDB();

/*
 * Slice 4: a volume annotation is a layer of the project on the test brain
 * (one per project), painted and read over the WebSocket, as the viewer does,
 * with the user's session cookie on the upgrade request. The value is the
 * label of one voxel. The server answers every write: `writeRefused`, or
 * `Atlas saved` after the save; and every read: the layer, or `readRefused`.
 */
const NII_TAG_LENGTH = 8;
const PEN = { x: 5, y: 5, slice: 10 };
const layerFile = (shortname) => `conformance-${shortname}.nii.gz`;
const testBrain = () => db().collection('mri')
  .findOne({ source: U.localBertURL, backup: { $exists: false } });

/* The screen-to-voxel transform the viewer computes from the header: here the identity */
const identity = (dim) => ({ x: 0, y: 1, z: 2, X: 0, Y: 0, Z: 0, dx: 1, dy: 1, dz: 1, sdim: dim });
// the voxel the pen paints, in the axial view (atlasmakerServer.js paintVoxel)
const penVoxel = (dim) => PEN.x + (dim[1] - 1 - PEN.y) * dim[0] + PEN.slice * dim[0] * dim[1];

/**
 * Open the project's layer on the test brain as the user, and wait for the
 * layer or its refusal
 * @param {object} user A user of the suite (username null when logged out)
 * @param {string} shortname The project
 * @param {number} penValue The label to paint with
 * @returns {Promise<object>} {socket, mri, atlas (the gzipped voxels, or null if refused), until(condition)}
 */
const openLayer = async (user, shortname, penValue) => {
  const mri = await testBrain();
  const sid = user.username && user.client.cookies['connect.sid'];
  const socket = new WebSocket(U.wsURL, sid ? { headers: { Cookie: `connect.sid=${sid}` } } : {});
  const messages = [];
  let waiter = null;
  const opened = { socket, mri, atlas: null, messages };
  opened.until = (condition) => new Promise((resolve, reject) => {
    waiter = () => {
      const found = condition();
      if (found) {
        waiter = null;
        resolve(found);
      }
    };
    socket.on('error', reject);
    waiter();
  });
  socket.on('message', (data) => {
    if (typeof data === 'string') {
      messages.push(JSON.parse(data));
    } else if (opened.atlas === null) {
      // the voxels, gzipped, then a tag
      opened.atlas = data.slice(0, data.length - NII_TAG_LENGTH);
    }
    if (waiter) {
      waiter();
    }
  });
  await new Promise((resolve, reject) => {
    socket.on('open', resolve);
    socket.on('error', reject);
  });
  socket.send(JSON.stringify({
    type: 'userData',
    description: 'allUserData',
    user: {
      username: user.username || 'anonymous',
      dirname: mri.url,
      atlasFilename: layerFile(shortname),
      mri: mri.filename,
      source: U.localBertURL,
      specimenName: 'bert',
      dim: mri.dim,
      s2v: identity(mri.dim),
      view: 'axi',
      slice: PEN.slice,
      x0: -1,
      y0: -1,
      penSize: 1,
      penValue,
      isMRILoaded: false
    }
  }));
  socket.send(JSON.stringify({ type: 'userData', description: 'sendAtlas' }));
  await opened.until(() => opened.atlas !== null || messages.some((m) => m.type === 'readRefused'));

  return opened;
};

const annotations = {
  // the test brain is the file of every slice 4 project
  file: { source: U.localBertURL, name: 'bert_brain' },
  read: async (user, shortname) => {
    const opened = await openLayer(user, shortname, 0);
    opened.socket.close();
    if (opened.atlas === null) {
      return { refused: true };
    }
    const value = (await promisify(zlib.gunzip)(opened.atlas))[penVoxel(opened.mri.dim)];

    return { value: value === 0 ? null : value };
  },
  write: async (user, shortname, file, value) => {
    // the layer of the project on the test brain, as a project page creates it
    await db().collection('mri')
      .updateOne(
        { source: U.localBertURL, backup: { $exists: false }, 'mri.atlas.filename': { $ne: layerFile(shortname) } },
        { $push: { 'mri.atlas': { filename: layerFile(shortname), project: shortname, name: 'Layer', type: 'volume', labels: 'foreground.json' } } }
      );
    const opened = await openLayer(user, shortname, value);
    const from = opened.messages.length;
    opened.socket.send(JSON.stringify({ type: 'paint', data: { c: 'mf', ...PEN } }));
    opened.socket.send(JSON.stringify({ type: 'paint', data: { c: 'lf', ...PEN } }));
    opened.socket.send(JSON.stringify({ type: 'save' }));
    // answered after the paint and the save are decided (a connection's messages are handled in order):
    // a refusal comes before it, and an `Atlas saved` from another connection can't be taken for ours
    opened.socket.send(JSON.stringify({ type: 'projectNameQuery', metadata: { name: shortname } }));
    const since = () => opened.messages.slice(from);
    await opened.until(() => since().some((m) => m.type === 'projectNameQuery'));
    const refused = since().some((m) => m.type === 'writeRefused');
    if (!refused) {
      await opened.until(() => since().some((m) => m.type === 'serverMessage' && (/^Atlas saved/).test(m.msg)));
    }
    opened.socket.close();

    return !refused;
  },
  // slice 2 (2.24): an atlas of the project in the MRI document of the file; read by GET /mri/json
  add: (owner, shortname, file) => db().collection('mri')
    .updateOne({ source: file.source, backup: { $exists: false } }, {
      $push: {
        'mri.atlas': {
          project: shortname,
          name: 'Layer',
          type: 'volume',
          filename: 'conformance.nii.gz',
          labels: 'foreground.json',
          owner: owner.username,
          access: 'edit'
        }
      }
    }),
  readable: async (user, shortname, file) => {
    const res = await user.client.get(`/mri/json?url=${encodeURIComponent(file.source)}`);
    const body = res.status === 200 ? JSON.parse(res.text) : {};

    return ((body.mri && body.mri.atlas) || []).some((a) => a.project === shortname);
  }
};

const adapter = {
  baseURL: U.serverURL,
  layer: { type: 'volume', values: 'foreground.json' },
  // a project without an `anyone` row can't be saved over HTTP (validation)
  insertProject: (doc) => db().collection('project')
    .insertOne({ ...doc, files: { list: doc.files.list.map((f) => f.source) } }),
  // every version, the MRI documents its files created (projectDocument's sources), and its layers on the test brain
  removeProject: async (owner, shortname) => {
    await db().collection('project')
      .deleteMany({ shortname });
    await db().collection('mri')
      .deleteMany({ source: { $regex: `^https://example\\.org/conformance/${shortname}/` } });
    const brain = await testBrain();
    if (brain && (brain.mri.atlas || []).some((a) => a.filename === layerFile(shortname))) {
      await db().collection('mri')
        .updateMany({ source: U.localBertURL }, { $pull: { 'mri.atlas': { filename: layerFile(shortname) } } });
      await fs.promises.rm(path.join(__dirname, '../../public', brain.url, layerFile(shortname)), { force: true });
    }
  },
  removeUser: async (username) => {
    await db().collection('user')
      .deleteMany({ nickname: username });
    await db().collection('log')
      .deleteMany({ username });
  },
  versions: (shortname) => db().collection('project')
    .find({ shortname }, { sort: { _id: 1 } })
    .toArray(),
  annotations,
  // slice 3 (3.7): a name and an email for a user
  setUserFields: (username, fields) => db().collection('user')
    .updateOne({ nickname: username }, { $set: fields }),
  // no project search since the hotfix (approved 3.6): projectNameQuery answers taken / free only
  routes: { searchProjects: null },
  // the approved rules BrainBox does not follow (coordination tasks/proposed-shared-pm-tests.md, "Slice 2/3/4:
  // rules for the differing rows", 2026-11-11): none for slice 2 since part C, none for slice 3 but the absent search
  expectedDifferences: {
    'route:searchProjects': 'approved 3.6: no project search (similarProjectNamesQuery removed; projectNameQuery answers taken / free over the WebSocket)',
    '4.4': 'approved 4.4: a logged-out visitor paints and saves where anyone may edit the annotations (atlas-write-access.js atlasAccessLevel, username || \'anonymous\')'
  }
};

accessMatrix(adapter);
projectLifecycle(adapter);
projectListings(adapter);

describe('conformance slice 4 on the test brain', function () {
  before(async function () {
    // as the WebSocket tests: the test brain may have been removed by an earlier test (client.js)
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    await U.waitForTestBrain(U.longTimeout);
  });

  // eslint-disable-next-line mocha/no-setup-in-describe -- the slice defines its blocks here, after the hook
  projectAnnotations(adapter);
});
