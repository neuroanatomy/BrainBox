'use strict';

// The owner of an MRI document (its `owner` field: the user who added it)
// always sees the MRI, even when the only projects that list it do not let
// them see its files: over GET and POST /mri/json and in the embed. The owner
// is the server-verified user (session cookie or token); an MRI added by an
// anonymous visitor (owned by an IP address) grants nothing to anyone. Within
// the MRI, the owner sees a project's layers as that project decides.

const crypto = require('crypto');
const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');
const F = require('../mri-access-fixtures.js');

const privateURL = `${U.testDataURL}/test_data/mri-owner-private.nii.gz`;
const ipOwnedURL = `${U.testDataURL}/test_data/mri-owner-ip-owned.nii.gz`;
const anonymousOwnedURL = `${U.testDataURL}/test_data/mri-owner-anonymous-owned.nii.gz`;
const unlistedURL = `${U.testDataURL}/test_data/mri-owner-in-no-project.nii.gz`;
const allURLs = [privateURL, ipOwnedURL, anonymousOwnedURL, unlistedURL];
const shortname = 'mriownerprivatefiles';
const hiddenLayer = 'mri-owner-hidden-layer.nii.gz';
const hash = (source) => crypto.createHash('md5').update(source)
  .digest('hex');
const mriDocument = (source, owner) => ({
  source,
  url: `/data/${hash(source)}/`,
  filename: 'brain.nii.gz',
  name: 'Owner test brain',
  success: true,
  dim: [10, 10, 10],
  owner,
  mri: {
    atlas: [
      { name: 'Default', filename: 'Atlas.nii.gz', access: 'edit', type: 'volume', labels: 'foreground.json' },
      { name: 'Hidden', filename: hiddenLayer, project: shortname, access: 'edit', type: 'volume', labels: 'foreground.json' }
    ]
  }
});
const collaborator = (username, files) => ({
  userID: username,
  nickname: username,
  username,
  name: username,
  access: { collaborators: 'view', annotations: 'view', files }
});
// a project nobody but its collaborators may see, which lists the MRIs
const privateProject = {
  name: shortname,
  shortname,
  owner: 'foo',
  collaborators: {
    list: [
      { userID: 'anyone', nickname: 'anyone', username: 'anyone', name: 'Any User', access: { collaborators: 'none', annotations: 'none', files: 'none' } },
      collaborator(F.users.viewer, 'view')
    ]
  },
  files: { list: [privateURL, ipOwnedURL, anonymousOwnedURL] },
  annotations: { list: [] }
};

const getJson = ({ url, cookie, token }) => {
  const req = chai.request(U.serverURL).get('/mri/json')
    .query(token ? { url, token } : { url });
  if (cookie) {
    req.set('Cookie', cookie);
  }

  return req;
};
const postJson = ({ url, cookie, variable }) => {
  const req = chai.request(U.serverURL).post('/mri/json');
  if (cookie) {
    req.set('Cookie', cookie);
  }

  return req.type('form').send(variable ? { url, var: variable } : { url });
};
const getPage = (path, { url, cookie }) => {
  const req = chai.request(U.serverURL).get(path)
    .query({ url });
  if (cookie) {
    req.set('Cookie', cookie);
  }

  return req;
};

describe('The owner of an MRI always sees it', function () {
  // eslint-disable-next-line no-invalid-this
  this.timeout(U.longTimeout);

  before(async function () {
    await F.setUp();
    const db = U.getNativeDB();
    await db.collection('mri').deleteMany({ source: { $in: allURLs } });
    await db.collection('mri').insertMany([
      mriDocument(privateURL, F.users.mriowner),
      // added by an anonymous visitor: the server stores their IP address
      mriDocument(ipOwnedURL, '::ffff:127.0.0.1'),
      mriDocument(anonymousOwnedURL, 'anonymous'),
      mriDocument(unlistedURL, F.users.mriowner)
    ]);
    await db.collection('project').deleteMany({ shortname });
    await db.collection('project').insertOne(privateProject);
  });

  after(async function () {
    const db = U.getNativeDB();
    await db.collection('mri').deleteMany({ source: { $in: allURLs } });
    await db.collection('project').deleteMany({ shortname });
    await db.collection('embedWsTicket').deleteMany({ mriSource: { $in: allURLs } });
    await F.tearDown();
  });

  describe('/mri/json', function () {
    it('gives it to its owner over GET, logged in with a cookie or a token', async function () {
      const byCookie = await getJson({ url: privateURL, cookie: F.cookie(F.users.mriowner) });
      assert.equal(byCookie.statusCode, 200);
      assert.equal(byCookie.body.source, privateURL);
      const byToken = await getJson({ url: privateURL, token: F.token(F.users.mriowner) });
      assert.equal(byToken.statusCode, 200);
      assert.equal(byToken.body.source, privateURL);
    });

    // (one variable: the whole document would make the server download the image, which the test brain does not have)
    it('gives it to its owner over POST', async function () {
      const dim = await postJson({ url: privateURL, cookie: F.cookie(F.users.mriowner), variable: 'dim' });
      assert.equal(dim.statusCode, 200);
      assert.deepEqual(dim.body, [10, 10, 10]);
    });

    it('gives the owner the layers without a project, but not those the project hides from them', async function () {
      const res = await getJson({ url: privateURL, cookie: F.cookie(F.users.mriowner) });
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body.mri.atlas.map((a) => a.filename), ['Atlas.nii.gz']);
      const post = await postJson({ url: privateURL, cookie: F.cookie(F.users.mriowner), variable: 'mri/atlas' });
      assert.deepEqual(post.body.map((a) => a.filename), ['Atlas.nii.gz']);
    });

    it('still refuses it to an anonymous visitor and to a logged-in user who is not its owner', async function () {
      const anonymous = await getJson({ url: privateURL });
      assert.equal(anonymous.statusCode, 403);
      const other = await postJson({ url: privateURL, cookie: F.cookie(F.users.nonmember) });
      assert.equal(other.statusCode, 403);
      assert.equal(other.body.error, 'This brain is private');
    });

    it('still gives it to a collaborator who may see the project\'s files, with its layers', async function () {
      const res = await getJson({ url: privateURL, cookie: F.cookie(F.users.viewer) });
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body.mri.atlas.map((a) => a.filename), ['Atlas.nii.gz', hiddenLayer]);
    });

    it('grants nothing to anonymous visitors for an MRI an anonymous visitor added', async function () {
      for (const url of [ipOwnedURL, anonymousOwnedURL]) {
        /* eslint-disable no-await-in-loop */
        const get = await getJson({ url });
        assert.equal(get.statusCode, 403, url);
        const post = await postJson({ url, variable: 'dim' });
        assert.equal(post.statusCode, 403, url);
        /* eslint-enable no-await-in-loop */
      }
    });
  });

  describe('the embed', function () {
    it('renders it for its owner, with a WebSocket ticket in the owner\'s name', async function () {
      const res = await getPage('/mri/embed', { url: privateURL, cookie: F.cookie(F.users.mriowner) });
      assert.equal(res.statusCode, 200);
      const [, ticket] = res.text.match(/var embedWsTicket = "([^"]+)"/);
      const stored = await U.getNativeDB().collection('embedWsTicket')
        .findOne({ token: ticket });
      assert.equal(stored.username, F.users.mriowner);
      assert.equal(stored.mriSource, privateURL);
    });

    it('gives its owner the 3D rendering and the list of layers they may see', async function () {
      const render = await getPage('/mri/render3d', { url: privateURL, cookie: F.cookie(F.users.mriowner) });
      assert.equal(render.statusCode, 200);
      const layers = await getPage('/mri/layers', { url: privateURL, cookie: F.cookie(F.users.mriowner) });
      assert.equal(layers.statusCode, 200);
      assert.deepEqual(layers.body.layers.map((l) => l.name), ['Default']);
    });

    it('still refuses it to anyone else who may not see its files', async function () {
      for (const path of ['/mri/embed', '/mri/render3d', '/mri/layers']) {
        /* eslint-disable no-await-in-loop */
        assert.equal((await getPage(path, { url: privateURL })).statusCode, 403, path);
        assert.equal((await getPage(path, { url: privateURL, cookie: F.cookie(F.users.nonmember) })).statusCode, 403, path);
        assert.equal((await getPage(path, { url: ipOwnedURL })).statusCode, 403, path);
        /* eslint-enable no-await-in-loop */
      }
    });

    it('still refuses an MRI that no project lists, even to its owner', async function () {
      const res = await getPage('/mri/embed', { url: unlistedURL, cookie: F.cookie(F.users.mriowner) });
      assert.equal(res.statusCode, 403);
    });
  });
});
