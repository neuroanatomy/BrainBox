'use strict';

// The files under /data/<md5>/ are served by express.static, behind an access
// check (controller/mri/data-access.js): the MRI's image and every other file
// of its folder only to users who may see the MRI's files; a layer file, and
// its earlier versions, only to users who may see the layer. A refused file
// gets the same 404 as a file that does not exist; Range and conditional
// requests are still express.static's. With DATA_ACCESS_CHECK=log, refusals
// are only logged.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');
const F = require('../mri-access-fixtures.js');

const md5 = (source) => crypto.createHash('md5').update(source)
  .digest('hex');
const publicURL = `${U.testDataURL}/test_data/data-access-public.nii.gz`;
const privateURL = `${U.testDataURL}/test_data/data-access-private.nii.gz`;
const unlistedURL = `${U.testDataURL}/test_data/data-access-unlisted.nii.gz`;
const allURLs = [publicURL, privateURL, unlistedURL];
const publicShortname = 'dataaccesspublic';
const privateShortname = 'dataaccessprivate';
const publicLayer = 'dataaccesspub1.nii.gz';
const privateLayer = 'dataaccesspriv1.nii.gz';
const privateLayerBackup = `1776065741470_${privateLayer}`;
const privateMriLayer = 'dataaccesspriv2.nii.gz';
const image = 'brain.nii.gz';
const dataDir = (source) => path.join(__dirname, '..', '..', 'public', 'data', md5(source));
const fileURL = (source, filename) => `/data/${md5(source)}/${filename}`;
const diskFiles /* on disk, 1000 bytes each */ = {
  [publicURL]: [image, 'Atlas.nii.gz', publicLayer, privateLayer, privateLayerBackup],
  [privateURL]: [image, privateMriLayer],
  [unlistedURL]: [image]
};

const mriDocument = (source, owner, atlas) => ({
  source,
  url: `/data/${md5(source)}/`,
  filename: image,
  name: 'Data access test brain',
  success: true,
  dim: [10, 10, 10],
  owner,
  mri: { atlas: [{ name: 'Default', filename: 'Atlas.nii.gz', access: 'edit', type: 'volume', labels: 'foreground.json' }, ...atlas] }
});
const layer = (filename, project) => ({ name: filename, filename, project, access: 'edit', type: 'volume', labels: 'foreground.json' });
const collaborator = (username, annotations, files) => ({
  userID: username,
  nickname: username,
  username,
  name: username,
  access: { collaborators: 'view', annotations, files }
});
const anyone = (annotations, files) => ({ userID: 'anyone', nickname: 'anyone', username: 'anyone', name: 'Any User', access: { collaborators: 'none', annotations, files } });
// lists the public MRI: anyone sees its files and annotations
const publicProject = {
  name: publicShortname,
  shortname: publicShortname,
  owner: 'foo',
  collaborators: { list: [anyone('view', 'view')] },
  files: { list: [publicURL] },
  annotations: { list: [] }
};
// lists the private MRI: only the viewer and the editor see its files and annotations
const privateProject = {
  name: privateShortname,
  shortname: privateShortname,
  owner: 'foo',
  collaborators: { list: [anyone('none', 'none'), collaborator(F.users.viewer, 'view', 'view'), collaborator(F.users.editor, 'edit', 'edit')] },
  files: { list: [privateURL] },
  annotations: { list: [] }
};

const get = (url, { cookie, token, range, etag, method = 'get' } = {}) => {
  const req = chai.request(U.serverURL)[method](url);
  if (token) {
    req.query({ token });
  }
  if (cookie) {
    req.set('Cookie', cookie);
  }
  if (range) {
    req.set('Range', range);
  }
  if (etag) {
    req.set('If-None-Match', etag);
  }

  return req.buffer(true);
};
const anonymous = {};
const as = (user) => ({ cookie: F.cookie(F.users[user]) });
const byToken = (user) => ({ token: F.token(F.users[user]) });

describe('Access check on the files under /data', function () {
  // eslint-disable-next-line no-invalid-this
  this.timeout(U.longTimeout);
  let savedMode;

  before(async function () {
    savedMode = process.env.DATA_ACCESS_CHECK;
    process.env.DATA_ACCESS_CHECK = 'enforce';
    await F.setUp();
    const db = U.getNativeDB();
    await db.collection('mri').deleteMany({ source: { $in: allURLs } });
    await db.collection('mri').insertMany([
      mriDocument(publicURL, F.users.mriowner, [layer(publicLayer, publicShortname), layer(privateLayer, privateShortname)]),
      mriDocument(privateURL, F.users.mriowner, [layer(privateMriLayer, privateShortname)]),
      mriDocument(unlistedURL, F.users.mriowner, [])
    ]);
    await db.collection('project').deleteMany({ shortname: { $in: [publicShortname, privateShortname] } });
    await db.collection('project').insertMany([{ ...publicProject }, { ...privateProject }]);
    for (const [source, names] of Object.entries(diskFiles)) {
      /* eslint-disable no-await-in-loop */
      await fs.promises.mkdir(dataDir(source), { recursive: true });
      for (const name of names) {
        await fs.promises.writeFile(path.join(dataDir(source), name), Buffer.alloc(1000, name));
      }
      /* eslint-enable no-await-in-loop */
    }
  });

  after(async function () {
    if (typeof savedMode === 'undefined') {
      delete process.env.DATA_ACCESS_CHECK;
    } else {
      process.env.DATA_ACCESS_CHECK = savedMode;
    }
    const db = U.getNativeDB();
    await db.collection('mri').deleteMany({ source: { $in: allURLs } });
    await db.collection('project').deleteMany({ shortname: { $in: [publicShortname, privateShortname] } });
    for (const source of allURLs) {
      // eslint-disable-next-line no-await-in-loop
      await fs.promises.rm(dataDir(source), { recursive: true, force: true });
    }
    await F.tearDown();
  });

  const expectStatus = async (url, cases) => {
    for (const [name, options, status] of cases) {
      // eslint-disable-next-line no-await-in-loop
      const res = await get(url, options);
      assert.equal(res.statusCode, status, `${url} ${name}`);
    }
  };

  it('serves the image of an MRI that no project lists to anyone', async function () {
    await expectStatus(fileURL(unlistedURL, image), [['anonymous', anonymous, 200], ['nonmember', as('nonmember'), 200]]);
  });

  it('serves the image of an MRI a private project lists only to those who may see its files, and to its owner', async function () {
    await expectStatus(fileURL(privateURL, image), [
      ['anonymous', anonymous, 404],
      ['nonmember', as('nonmember'), 404],
      ['nonmember token', byToken('nonmember'), 404],
      ['viewer', as('viewer'), 200],
      ['editor', as('editor'), 200],
      ['owner', as('mriowner'), 200],
      ['viewer token', byToken('viewer'), 200]
    ]);
  });

  it('serves the layers of a private MRI only to those who may see them', async function () {
    await expectStatus(fileURL(privateURL, privateMriLayer), [
      ['anonymous', anonymous, 404],
      ['nonmember', as('nonmember'), 404],
      ['viewer', as('viewer'), 200],
      ['editor token', byToken('editor'), 200]
    ]);
    // a layer without a project, of an MRI the user may not see
    await expectStatus(fileURL(privateURL, 'Atlas.nii.gz'), [['anonymous', anonymous, 404]]);
  });

  it('serves a public project\'s layers to anyone', async function () {
    await expectStatus(fileURL(publicURL, publicLayer), [['anonymous', anonymous, 200], ['nonmember', as('nonmember'), 200]]);
    await expectStatus(fileURL(publicURL, 'Atlas.nii.gz'), [['anonymous', anonymous, 200]]);
  });

  it('serves a private project\'s layer, and its earlier versions, only to those who may see its annotations', async function () {
    for (const name of [privateLayer, privateLayerBackup]) {
      // eslint-disable-next-line no-await-in-loop
      await expectStatus(fileURL(publicURL, name), [
        ['anonymous', anonymous, 404],
        ['nonmember', as('nonmember'), 404],
        // the owner of the MRI sees a project's layers as the project decides
        ['owner', as('mriowner'), 404],
        ['nonmember token', byToken('nonmember'), 404],
        ['viewer', as('viewer'), 200],
        ['editor', as('editor'), 200],
        ['viewer token', byToken('viewer'), 200]
      ]);
    }
  });

  it('answers a refused file as a file that does not exist', async function () {
    const refused = await get(fileURL(publicURL, privateLayer));
    const missing = await get(fileURL(publicURL, 'no-such-layer.nii.gz'));
    assert.equal(refused.statusCode, 404);
    assert.equal(missing.statusCode, 404);
    assert.equal(refused.headers['content-type'], missing.headers['content-type']);
    assert.equal(refused.text.replace(privateLayer, ''), missing.text.replace('no-such-layer.nii.gz', ''));
    // nonexistent files and folders, as before
    await expectStatus(fileURL(publicURL, 'no-such-layer.nii.gz'), [['viewer', as('viewer'), 404]]);
    await expectStatus(`/data/${md5('no such brain')}/${image}`, [['anonymous', anonymous, 404]]);
  });

  it('cannot be got around by encoding or rewriting the path', async function () {
    const hash = md5(publicURL);
    for (const url of [
      `/data/${hash}/${privateLayer.replace('.', '%2E')}`,
      `/%64ata/${hash}/${privateLayer}`,
      `/lib/../data/${hash}/${privateLayer}`,
      `/data/${hash.toUpperCase()}/${privateLayer.toUpperCase()}`
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await get(url);
      assert.equal(res.statusCode, 404, url);
    }
  });

  it('keeps express.static\'s Range and conditional requests, and refuses them as well', async function () {
    const url = fileURL(privateURL, image);
    const range = await get(url, { ...as('viewer'), range: 'bytes=0-99' });
    assert.equal(range.statusCode, 206);
    assert.equal(range.headers['content-range'], 'bytes 0-99/1000');
    assert.equal(range.body.length, 100);
    const full = await get(url, as('viewer'));
    assert.equal(full.headers['accept-ranges'], 'bytes');
    const { etag } = full.headers;
    assert.isString(etag);
    assert.equal((await get(url, { ...as('viewer'), etag })).statusCode, 304);
    assert.equal((await get(url, { range: 'bytes=0-99' })).statusCode, 404);
    assert.equal((await get(url, { etag })).statusCode, 404);
    assert.equal((await get(url, { method: 'head' })).statusCode, 404);
  });

  it('lets the 3D rendering of the embed load the layer it was rendered for', async function () {
    // /mri/render3d (the embed's 3D view) fetches its layer over HTTP with the same cookie as the page
    const render = async (atlas, options) => {
      const req = chai.request(U.serverURL).get('/mri/render3d')
        .query({ url: publicURL, atlas });
      if (options.cookie) {
        req.set('Cookie', options.cookie);
      }
      const res = await req;
      assert.equal(res.statusCode, 200);

      return JSON.parse(res.text.match(/var path = (".*?");/)[1]);
    };
    const anonymousPath = await render(publicLayer, anonymous);
    assert.equal(anonymousPath, fileURL(publicURL, publicLayer));
    assert.equal((await get(anonymousPath)).statusCode, 200);
    const viewerPath = await render(privateLayer, as('viewer'));
    assert.equal(viewerPath, fileURL(publicURL, privateLayer));
    assert.equal((await get(viewerPath, as('viewer'))).statusCode, 200);
    // without the cookie (a third-party page that blocks it) the page would not have offered it
    assert.notEqual(await render(privateLayer, anonymous), fileURL(publicURL, privateLayer));
  });

  describe('with DATA_ACCESS_CHECK=log', function () {
    let logged;
    let originalLog;

    beforeEach(function () {
      process.env.DATA_ACCESS_CHECK = 'log';
      logged = [];
      originalLog = console.log;
      console.log = (...args) => {
        logged.push(args.join(' '));
        originalLog(...args);
      };
    });

    afterEach(function () {
      console.log = originalLog;
      process.env.DATA_ACCESS_CHECK = 'enforce';
    });

    it('serves a file it would refuse, and logs it', async function () {
      const res = await get(fileURL(publicURL, privateLayer));
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.length, 1000);
      assert.include(logged, `DATA_ACCESS WOULD REFUSE GET ${fileURL(publicURL, privateLayer)} (user: anonymous, reason: hidden layer of project ${privateShortname})`);
      const privateImage = await get(fileURL(privateURL, image), as('nonmember'));
      assert.equal(privateImage.statusCode, 200);
      assert.include(logged, `DATA_ACCESS WOULD REFUSE GET ${fileURL(privateURL, image)} (user: ${F.users.nonmember}, reason: private MRI)`);
    });

    it('logs nothing for a file it would serve', async function () {
      assert.equal((await get(fileURL(publicURL, publicLayer))).statusCode, 200);
      assert.isFalse(logged.some((line) => line.startsWith('DATA_ACCESS')));
    });
  });
});
