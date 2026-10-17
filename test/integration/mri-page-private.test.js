'use strict';

// The MRI page (GET /mri?url=...) refuses an MRI whose files the user cannot
// see, as /mri/json does: one that projects list, none of which lets the user
// (or anyone) see its files, unless the user owns it. It answers 403 with a
// page that says the brain is private, and offers anonymous visitors to log in.

const crypto = require('crypto');
const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');
const F = require('../mri-access-fixtures.js');

const privateURL = `${U.serverURL}/test_data/mri-page-private-refused.nii.gz`;
const notDownloadedURL = `${U.serverURL}/test_data/mri-page-private-not-downloaded.nii.gz`;
const unlistedURL = `${U.serverURL}/test_data/mri-page-in-no-project.nii.gz`;
const shortname = 'mripageprivaterefused';
const brainName = 'Private page test brain';
const hiddenLayer = 'mri-page-private-layer.nii.gz';
const hash = (source) => crypto.createHash('md5').update(source)
  .digest('hex');
const mriDocument = (source) => ({
  source,
  url: `/data/${hash(source)}/`,
  filename: 'brain.nii.gz',
  name: brainName,
  success: true,
  dim: [10, 10, 10],
  owner: F.users.mriowner,
  mri: { atlas: [{ name: 'Default', filename: hiddenLayer, access: 'edit', type: 'volume', labels: 'foreground.json' }] }
});
const privateProject = {
  name: shortname,
  shortname,
  owner: 'foo',
  collaborators: {
    list: [
      { userID: 'anyone', nickname: 'anyone', username: 'anyone', name: 'Any User', access: { collaborators: 'none', annotations: 'none', files: 'none' } },
      { userID: F.users.viewer, nickname: F.users.viewer, username: F.users.viewer, name: F.users.viewer, access: { collaborators: 'view', annotations: 'view', files: 'view' } }
    ]
  },
  files: { list: [privateURL, notDownloadedURL] },
  annotations: { list: [] }
};

const getPage = ({ url, cookie }) => {
  const req = chai.request(U.serverURL).get('/mri')
    .query({ url });
  if (cookie) {
    req.set('Cookie', cookie);
  }

  return req;
};

describe('The MRI page refuses an MRI whose files the user cannot see', function () {
  // eslint-disable-next-line no-invalid-this
  this.timeout(U.longTimeout);

  before(async function () {
    await F.setUp();
    const db = U.getNativeDB();
    await db.collection('mri').deleteMany({ source: { $in: [privateURL, notDownloadedURL, unlistedURL] } });
    await db.collection('mri').insertMany([mriDocument(privateURL), mriDocument(unlistedURL)]);
    await db.collection('project').deleteMany({ shortname });
    await db.collection('project').insertOne(privateProject);
  });

  after(async function () {
    const db = U.getNativeDB();
    await db.collection('mri').deleteMany({ source: { $in: [privateURL, notDownloadedURL, unlistedURL] } });
    await db.collection('project').deleteMany({ shortname });
    await F.tearDown();
  });

  it('tells an anonymous visitor it is private, and offers to log in', async function () {
    const res = await getPage({ url: privateURL });
    assert.equal(res.statusCode, 403);
    assert.include(res.text, 'This brain is private');
    assert.match(res.text, /<a href="\/auth\/github">Log in<\/a> if you have access to it/);
    assert.notInclude(res.text, brainName);
    assert.notInclude(res.text, hiddenLayer);
    assert.notInclude(res.text, 'mriInfo');
  });

  it('tells a logged-in user who may not see it that it is private, without asking to log in', async function () {
    const res = await getPage({ url: privateURL, cookie: F.cookie(F.users.nonmember) });
    assert.equal(res.statusCode, 403);
    assert.include(res.text, 'This brain is private');
    assert.notInclude(res.text, 'if you have access to it');
    assert.notInclude(res.text, brainName);
    assert.notInclude(res.text, hiddenLayer);
  });

  it('refuses a private MRI that has no document yet', async function () {
    const res = await getPage({ url: notDownloadedURL });
    assert.equal(res.statusCode, 403);
    assert.include(res.text, 'This brain is private');
  });

  it('shows it to its owner and to a collaborator who may see the files', async function () {
    for (const username of [F.users.mriowner, F.users.viewer]) {
      /* eslint-disable no-await-in-loop */
      const res = await getPage({ url: privateURL, cookie: F.cookie(username) });
      assert.equal(res.statusCode, 200, username);
      assert.include(res.text, brainName, username);
      /* eslint-enable no-await-in-loop */
    }
  });

  it('shows an MRI that no project lists to anyone', async function () {
    const res = await getPage({ url: unlistedURL });
    assert.equal(res.statusCode, 200);
    assert.include(res.text, brainName);
  });

  it('shows an MRI that has no document and that no project lists, so that it can be downloaded', async function () {
    const res = await getPage({ url: `${U.serverURL}/test_data/mri-page-not-yet-added.nii.gz` });
    assert.equal(res.statusCode, 200);
  });
});
