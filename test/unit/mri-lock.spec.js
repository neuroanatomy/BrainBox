/* eslint-disable max-lines */
// The writers of MRI documents (the WebSocket's saveMetadata and vectorial
// atlas save, POST /mri/json's download, the uploads, the admin removal) read
// the current version and insert a new one. Each module had its own AsyncLock
// on the key 'mri', and a lock only excludes users of the same instance: two
// writers could read the same version, and the second write lost the first
// one's change. They now share NeuroWebLab's lock table (withLock('mri')),
// which the project saves and admin tools also take (['project', 'mri']).

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const { Writable } = require('stream');
const { expect } = require('chai');
const sinon = require('sinon');
const { isLocked, withLock } = require('neuroweblab');
const atlasmakerServer = require('../../controller/atlasmakerServer/atlasmakerServer.js');
const annotations = require('../../controller/admin/admin.annotations.js');
const amri = require('../../controller/atlasmakerServer/atlasmaker-mri.js');
const MriController = require('../../controller/mri/mri.controller.js');
const uploadController = require('../../controller/mri/upload.controller.js');
const U = require('../utils.js');

const source = 'https://example.org/mri-lock-spec.nii.gz';
const dirname = `/data/${crypto.createHash('md5').update(source)
  .digest('hex')}/`;
const shortname = 'mrilockspec';
const uploadToken = 'mrilockspectoken';

const project = {
  name: 'MRI lock spec',
  shortname,
  owner: 'foo',
  collaborators: { list: [{ userID: 'anyone', nickname: 'anyone', access: { collaborators: 'view', annotations: 'view', files: 'view' } }] },
  files: { list: [{ source }] },
  annotations: { list: [{ type: 'volume', name: 'Layer', values: 'foreground.json' }] }
};

const mri = {
  source,
  url: dirname,
  filename: 'brain.nii.gz',
  name: 'Brain',
  owner: 'mowner',
  mri: {
    atlas: [
      { filename: 'Atlas.nii.gz', name: 'Default', access: 'edit' },
      { filename: 'project.nii.gz', project: shortname, name: 'Layer', access: 'view' }
    ],
    annotations: { [shortname]: { Note: { type: 'text', data: 'note' } } }
  }
};

const fakeSessionParser = (sessions) => (req, res, next) => {
  const user = sessions[req.headers.cookie];
  req.session = user ? { passport: { user } } : {};
  setImmediate(next);
};

/**
 * A response that resolves once the controller answers
 * @returns {object} { res, answered }: answered resolves with { status, body }
 */
const mockResponse = () => {
  let done;
  const answered = new Promise((resolve) => { done = resolve; });
  const res = { statusCode: 200 };
  const answer = (body) => {
    done({ status: res.statusCode, body });

    return res;
  };
  Object.assign(res, {
    status: (code) => {
      res.statusCode = code;

      return res;
    },
    json: answer,
    send: answer,
    end: () => res
  });

  return { res, answered };
};

const mockSocket = () => ({ send: sinon.spy(), close: sinon.spy(), readyState: 1, on: sinon.spy() });

const delay = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * A database whose reads of the current MRI document are held: each findOne
 * on 'mri' reads at once, but answers only once the gate opens
 * @param {object} db Native MongoDB database
 * @returns {object} { db, read, open }: read resolves once a read was made,
 *   open lets the reads answer
 */
const heldReads = (db) => {
  let open;
  let read;
  const gate = new Promise((resolve) => { open = resolve; });
  const readMade = new Promise((resolve) => { read = resolve; });
  const held = {
    collection: (name) => {
      const collection = db.collection(name);
      if (name !== 'mri') {
        return collection;
      }

      return new Proxy(collection, {
        get: (target, prop) => {
          if (prop === 'findOne') {
            return async (...args) => {
              const doc = await target.findOne(...args);
              read();
              await gate;

              return doc;
            };
          }
          const value = target[prop];

          return (typeof value === 'function') ? value.bind(target) : value;
        }
      });
    }
  };

  return { db: held, read: readMade, open };
};

// eslint-disable-next-line max-statements
describe('UNIT TESTING THE MRI DOCUMENTS LOCK', function () {
  let AMS;
  // what a test holds, let go after it even if it fails
  let toRelease = [];
  const sessions = { 'connect.sid=mowner': { username: 'mowner' } };

  const db = () => U.getNativeDB();
  const storedDoc = (src = source) => db().collection('mri')
    .findOne({ source: src, backup: { $exists: false } }, { projection: { _id: 0 } });

  /**
   * The MRI's owner's connection, as a page opens it
   * @param {string} [src] The MRI's source
   * @returns {object} The connection
   */
  const connectOwner = (src = source) => {
    const ws = mockSocket();
    AMS._connectNewUser({ ws, req: { url: '/', headers: { cookie: 'connect.sid=mowner' } } });
    const sourceUS = AMS.getUserFromSocket(ws);
    const dir = `/data/${crypto.createHash('md5').update(src)
      .digest('hex')}/`;
    sourceUS.User = { username: 'mowner', source: src, dirname: dir, atlasFilename: 'Atlas.nii.gz' };

    return sourceUS;
  };

  /**
   * The owner renames the MRI over the WebSocket, from a copy read now
   * @param {string} name The new name
   * @param {string} [src] The MRI's source
   * @returns {Promise<void>} Once saved
   */
  const rename = async (name, src = source) => {
    const copy = await storedDoc(src);
    copy.name = name;
    await AMS.receiveSaveMetadataMessage({ uid: connectOwner(src).uid, metadata: copy, method: 'append' });
  };

  const removeNote = (nativeDb = db()) => annotations.removeAnnotations(nativeDb, { source, text: [shortname], username: 'admin' });

  before(function () {
    AMS = atlasmakerServer(U.getNativeDB());
  });

  beforeEach(async function () {
    await db().collection('mri')
      .deleteMany({ source });
    await db().collection('project')
      .deleteMany({ shortname });
    await db().collection('mri')
      .insertOne(JSON.parse(JSON.stringify(mri)));
    await db().collection('project')
      .insertOne(JSON.parse(JSON.stringify(project)));
    AMS.US = [];
    AMS.Atlases = {};
    AMS.sessionParser = fakeSessionParser(sessions);
    AMS.writeAccessMode = 'enforce';
    sinon.stub(AMS, '_handleBroadcastWebSocketMessage');
  });

  afterEach(function () {
    toRelease.forEach((release) => release());
    toRelease = [];
    sinon.restore();
    AMS.US = [];
  });

  after(async function () {
    await db().collection('mri')
      .deleteMany({ source });
    await db().collection('project')
      .deleteMany({ shortname });
    await db().collection('log')
      .deleteMany({ source });
    await db().collection('log')
      .deleteMany({ token: uploadToken });
  });

  it('an admin removal and a WebSocket save of the same MRI at the same time: both changes are kept', async function () {
    const held = heldReads(db());
    toRelease.push(held.open);
    const removal = removeNote(held.db);
    await held.read; // the removal has read the current version
    const save = rename('Renamed');
    // the save would be over by now if it did not wait for the removal
    await Promise.race([save, delay(200)]);
    held.open();
    await Promise.all([removal, save]);
    const doc = await storedDoc();
    expect(doc.name).to.equal('Renamed');
    expect(doc.mri.annotations).to.not.have.property(shortname);
  });

  it('a writer holds the \'mri\' key of NeuroWebLab\'s lock table', async function () {
    const held = heldReads(db());
    toRelease.push(held.open);
    const removal = removeNote(held.db);
    await held.read;
    expect(isLocked('mri')).to.equal(true);
    held.open();
    await removal;
    expect(isLocked('mri')).to.equal(false);
  });

  it('a WebSocket save waits for a project save, which holds [\'project\', \'mri\']', async function () {
    let release;
    const projectSave = withLock(['project', 'mri'], () => new Promise((resolve) => {
      release = resolve;
      toRelease.push(resolve);
    }));
    let saved = false;
    const save = rename('Renamed').then(() => { saved = true; });
    await delay(100);
    expect(saved).to.equal(false);
    release();
    await Promise.all([projectSave, save]);
    expect((await storedDoc()).name).to.equal('Renamed');
  });

  // The uploads read the MRI (to check it exists and who may change it), then
  // move and load the file, then write: they insert the version they read,
  // changed. A save made meanwhile was lost; they now re-read the current
  // version inside the lock and change that one.
  describe('an upload and a WebSocket save of the same MRI at the same time: both changes are kept', function () {
    // the uploads' files are neither moved nor read: their image is this one
    const image = { dim: [2, 2, 2], pixdim: [1, 1, 1], v2w: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], wori: [0, 0, 0] };

    beforeEach(async function () {
      sinon.stub(amri, 'loadMRI').resolves(image);
      sinon.stub(fs.promises, 'mkdir').resolves();
      sinon.stub(fs.promises, 'rename').resolves();
      sinon.stub(fs, 'mkdirSync');
      sinon.stub(fs, 'renameSync');
      await db().collection('log')
        .deleteMany({ token: uploadToken });
      await db().collection('log')
        .insertOne({ token: uploadToken, username: 'foo', expiryDate: new Date(Date.now() + 3600 * 1000) });
    });

    /**
     * Runs a request whose read of the MRI is held, renames the MRI over the
     * WebSocket meanwhile, then lets the read answer
     * @param {Function} request held db => Promise of the answer
     * @returns {Promise<object>} The request's answer
     */
    const saveDuringRequest = async (request) => {
      const held = heldReads(db());
      toRelease.push(held.open);
      const answer = request(held.db);
      await held.read; // the request has read the current version
      const save = rename('Renamed');
      await Promise.race([save, delay(200)]);
      held.open();
      await save;

      return answer;
    };

    it('POST /mri/upload (a volume layer)', async function () {
      const answer = await saveDuringRequest((nativeDb) => {
        const { res, answered } = mockResponse();
        const req = {
          body: { url: source, token: uploadToken, atlasName: 'Uploaded', atlasProject: shortname, atlasLabelSet: 'foreground.json' },
          files: [{ originalname: 'layer.nii.gz', path: 'uploads/layer' }],
          dirname: '/nonexistent-mri-lock-spec',
          nativeDb
        };
        uploadController.otherValidations(req, res, () => uploadController.upload(req, res));

        return answered;
      });
      expect(answer.status).to.equal(200);
      const doc = await storedDoc();
      expect(doc.name).to.equal('Renamed');
      expect(doc.mri.atlas.map((a) => a.name)).to.include('Uploaded');
    });

    it('POST /mri/upload-from-url (the MRI\'s image)', async function () {
      const controller = new MriController(db());
      const answer = await saveDuringRequest((nativeDb) => {
        const { res, answered } = mockResponse();
        const req = {
          body: { url: source },
          file: { path: 'uploads/brain' },
          dirname: '/nonexistent-mri-lock-spec',
          headers: {},
          ip: '127.0.0.1',
          nativeDb
        };
        controller.apiMriUploadFromURL(req, res);

        return answered;
      });
      expect(answer.status).to.equal(200);
      const doc = await storedDoc();
      expect(doc.name).to.equal('Renamed');
      expect(doc.dim).to.deep.equal(image.dim);
    });
  });

  // POST /mri/json reads the MRI, downloads its file (seconds to minutes) and
  // loads it, then writes. It inserted the version read before the download,
  // with the file's fields: a save made meanwhile was lost. It now re-reads the
  // current version inside the lock and changes that one.
  describe('POST /mri/json\'s download', function () {
    const image = { dim: [2, 2, 2], pixdim: [1, 1, 1], v2w: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], wori: [0, 0, 0] };
    let base, server;
    // the downloads' sources, one per test: the loaded brains are kept by path
    const sources = [];
    const sourceFor = (name) => {
      const src = `${base}/${name}.nii.gz`;
      sources.push(src);

      return src;
    };

    before(function (done) {
      // the remote server the MRI is downloaded from
      server = http.createServer((req, res) => {
        res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': 4 });
        res.end(Buffer.from([1, 2, 3, 4]));
      });
      server.listen(0, '127.0.0.1', () => {
        base = `http://127.0.0.1:${server.address().port}`;
        done();
      });
    });

    after(async function () {
      server.close();
      await db().collection('mri')
        .deleteMany({ source: { $in: sources } });
    });

    let letLoad, loaded;

    beforeEach(function () {
      // the file is neither written nor read: its image is this one, given
      // once letLoad is called
      const gate = new Promise((resolve) => { letLoad = resolve; });
      toRelease.push(letLoad);
      loaded = new Promise((resolve) => {
        sinon.stub(amri, 'loadMRI').callsFake(async () => {
          resolve();
          await gate;

          return image;
        });
      });
      sinon.stub(fs.promises, 'mkdir').resolves();
      sinon.stub(fs.promises, 'rename').resolves();
      sinon.stub(fs.promises, 'rm').resolves();
      sinon.stub(fs, 'createWriteStream').callsFake(() => new Writable({ write: (chunk, enc, cb) => cb() }));
    });

    const post = (src) => {
      const { res, answered } = mockResponse();
      new MriController(db()).apiMriPost({
        body: { url: src },
        query: {},
        dirname: '/nonexistent-mri-lock-spec',
        headers: {},
        ip: '127.0.0.1',
        nativeDb: db()
      }, res);

      return answered;
    };

    // the download is over once a version has the image
    const downloaded = async (src, tries = 100) => {
      const doc = await storedDoc(src);
      if (doc?.dim) { return doc; }
      if (tries === 0) { throw new Error('the download did not write the MRI'); }
      await delay(10);

      return downloaded(src, tries - 1);
    };

    it('a save made during the download is kept', async function () {
      const src = sourceFor('download-save');
      // a document without image, as a project's names import makes it
      await db().collection('mri')
        .insertOne({ source: src, url: '/data/x/', name: 'Brain', owner: 'mowner', mri: { atlas: [{ filename: 'Atlas.nii.gz', name: 'Default', access: 'edit' }] } });
      const answer = await post(src);
      expect(answer.body).to.include({ success: 'downloading' });
      await loaded; // downloaded, being loaded
      await rename('Renamed', src);
      letLoad();
      const doc = await downloaded(src);
      expect(doc.name).to.equal('Renamed');
      expect(doc).to.include({ success: true, filename: 'download-save.nii.gz', modifiedBy: 'ip:127.0.0.1' });
      expect(doc.dim).to.deep.equal(image.dim);
      expect(doc.voxel2world).to.deep.equal(image.v2w);
      expect(doc.worldOrigin).to.deep.equal(image.wori);
    });

    it('a source without document gets one, with the default layer', async function () {
      const src = sourceFor('download-new');
      letLoad();
      expect((await post(src)).body).to.include({ success: 'downloading' });
      const doc = await downloaded(src);
      const hash = crypto.createHash('md5').update(src)
        .digest('hex');
      expect(doc).to.include({ source: src, name: '', url: `/data/${hash}/`, owner: 'ip:127.0.0.1', success: true, filename: 'download-new.nii.gz' });
      expect(doc.mri.atlas).to.have.length(1);
      expect(doc.mri.atlas[0]).to.include({ name: 'Default', type: 'volume', access: 'edit', filename: 'Atlas.nii.gz', labels: 'foreground.json' });
      expect(doc.dim).to.deep.equal(image.dim);
      expect(await db().collection('mri')
        .countDocuments({ source: src })).to.equal(1);
    });
  });

  describe('each writer finishes, alone and in parallel with itself', function () {
    it('saveMetadata', async function () {
      await rename('First');
      expect((await storedDoc()).name).to.equal('First');
      await Promise.all([rename('Second'), rename('Second')]);
      expect((await storedDoc()).name).to.equal('Second');
    });

    it('the admin removal', async function () {
      expect(await removeNote()).to.deep.equal({ volume: [], text: [shortname] });
      await db().collection('mri')
        .updateOne({ source, backup: { $exists: false } }, { $set: { [`mri.annotations.${shortname}`]: mri.mri.annotations[shortname] } });
      const results = await Promise.all([removeNote(), removeNote()]);
      expect(results).to.deep.equal([{ volume: [], text: [shortname] }, { volume: [], text: [] }]);
    });

    it('the vectorial atlas save', async function () {
      const save = (vectorial) => AMS._saveAtlasVectorialData({ source, filename: 'Atlas.nii.gz', vectorial });
      await save({ lines: [1] });
      await Promise.all([save({ lines: [2] }), save({ lines: [2] })]);
      const doc = await storedDoc();
      expect(doc.mri.atlas[0].vectorial).to.deep.equal({ lines: [2] });
      expect(await db().collection('mri')
        .countDocuments({ source })).to.equal(3); // the first version and the two saves; the last one changed nothing
    });

    it('the lock is free once they are over', function () {
      expect(isLocked('mri')).to.equal(false);
    });
  });
});
