'use strict';

// GET and POST /mri/json refuse an MRI whose files the user cannot see

const crypto = require('crypto');
const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');
const F = require('../mri-access-fixtures.js');

// GET and POST /mri/json refuse an MRI whose files the user cannot see, as
// /mri/embed does: one that projects list, none of which lets the user (or
// anyone) see its files. An MRI that no project lists stays open to anyone
// who has its URL; one that several projects list is visible if any of them
// lets the user see it.
const privateURL = `${U.serverURL}/test_data/mri-json-private.nii.gz`;
const unlistedURL = `${U.serverURL}/test_data/mri-json-in-no-project.nii.gz`;
const notDownloadedURL = `${U.serverURL}/test_data/mri-json-private-not-downloaded.nii.gz`;
const privateShortname = 'mrijsonprivatefiles';
const publicShortname = 'mrijsonpublicfiles';
const hash = (source) => crypto.createHash('md5').update(source)
  .digest('hex');
const mriDocument = (source) => ({
  source,
  url: `/data/${hash(source)}/`,
  filename: 'brain.nii.gz',
  name: 'Test brain',
  success: true,
  dim: [10, 10, 10],
  owner: 'foo',
  mri: { atlas: [{ name: 'Default', filename: 'Atlas.nii.gz', access: 'edit', type: 'volume', labels: 'foreground.json' }] }
});
const collaborator = (username, files) => ({
  userID: username,
  nickname: username,
  username,
  name: username,
  access: { collaborators: 'view', annotations: 'view', files }
});
const project = (shortname, anyoneFiles, files) => ({
  name: shortname,
  shortname,
  owner: 'foo',
  collaborators: {
    list: [
      { userID: 'anyone', nickname: 'anyone', username: 'anyone', name: 'Any User', access: { collaborators: 'none', annotations: 'none', files: anyoneFiles } },
      collaborator(F.users.viewer, 'view'),
      collaborator(F.users.editor, 'edit')
    ]
  },
  files: { list: files },
  annotations: { list: [] }
});

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

describe('/mri/json: MRIs whose files the user cannot see are refused', function () {
  // eslint-disable-next-line no-invalid-this
  this.timeout(U.longTimeout);

  before(async function () {
    await U.waitForTestBrain();
    await F.setUp();
    const db = U.getNativeDB();
    await db.collection('mri').deleteMany({ source: { $in: [privateURL, unlistedURL, notDownloadedURL] } });
    await db.collection('mri').insertMany([mriDocument(privateURL), mriDocument(unlistedURL)]);
    await db.collection('project').deleteMany({ shortname: { $in: [privateShortname, publicShortname] } });
    await db.collection('project').insertOne(project(privateShortname, 'none', [{ source: privateURL, name: 'private' }, notDownloadedURL]));
  });

  after(async function () {
    const db = U.getNativeDB();
    await db.collection('mri').deleteMany({ source: { $in: [privateURL, unlistedURL, notDownloadedURL] } });
    await db.collection('project').deleteMany({ shortname: { $in: [privateShortname, publicShortname] } });
    await F.tearDown();
  });

  it('refuses it to an anonymous visitor, over GET and POST', async function () {
    const get = await getJson({ url: privateURL });
    assert.equal(get.statusCode, 403);
    assert.isFalse(get.body.success);
    assert.match(get.body.error, /private/);
    assert.isUndefined(get.body.mri);
    const post = await postJson({ url: privateURL });
    assert.equal(post.statusCode, 403);
    assert.match(post.body.error, /private, log in/);
    assert.isUndefined(post.body.mri);
  });

  it('refuses a single variable too', async function () {
    const res = await postJson({ url: privateURL, variable: 'mri/atlas' });
    assert.equal(res.statusCode, 403);
    assert.notProperty(res.body, 'length');
  });

  it('refuses it to a logged-in user who is not a collaborator', async function () {
    const get = await getJson({ url: privateURL, cookie: F.cookie(F.users.nonmember) });
    assert.equal(get.statusCode, 403);
    const post = await postJson({ url: privateURL, cookie: F.cookie(F.users.nonmember) });
    assert.equal(post.statusCode, 403);
    assert.equal(post.body.error, 'This brain is private');
  });

  it('refuses to download a private MRI that has no document yet', async function () {
    const res = await postJson({ url: notDownloadedURL });
    assert.equal(res.statusCode, 403);
    assert.isNull(await F.storedMRI(notDownloadedURL));
  });

  it('gives it to a collaborator who may see the files (session cookie)', async function () {
    const get = await getJson({ url: privateURL, cookie: F.cookie(F.users.viewer) });
    assert.equal(get.statusCode, 200);
    assert.equal(get.body.source, privateURL);
    const post = await postJson({ url: privateURL, cookie: F.cookie(F.users.viewer), variable: 'dim' });
    assert.equal(post.statusCode, 200);
    assert.deepEqual(post.body, [10, 10, 10]);
  });

  it('gives it to a collaborator logged in with a token', async function () {
    const res = await getJson({ url: privateURL, token: F.token(F.users.editor) });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.source, privateURL);
  });

  it('gives an MRI that no project lists to anyone', async function () {
    const get = await getJson({ url: unlistedURL });
    assert.equal(get.statusCode, 200);
    assert.equal(get.body.source, unlistedURL);
    const post = await postJson({ url: unlistedURL, variable: 'dim' });
    assert.equal(post.statusCode, 200);
  });

  it('gives an MRI listed by a private and a public project to anyone', async function () {
    await U.getNativeDB().collection('project')
      .insertOne(project(publicShortname, 'view', [privateURL]));
    try {
      const get = await getJson({ url: privateURL });
      assert.equal(get.statusCode, 200);
      const post = await postJson({ url: privateURL, variable: 'dim' });
      assert.equal(post.statusCode, 200);
    } finally {
      await U.getNativeDB().collection('project')
        .deleteMany({ shortname: publicShortname });
    }
  });

  it('still gives the test brain (public project) to an anonymous visitor', async function () {
    const res = await postJson({ url: U.localBertURL });
    assert.equal(res.statusCode, 200);
    assert.isTrue(res.body.success);
  });
});
