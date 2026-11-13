'use strict';

// A logged-out visitor never writes annotations, even where 'anyone' may edit
// them: 'anyone: edit' means any logged-in user (shared suite 4.4, decided
// 2026-11-11). The project page and the MRI data it loads tell a logged-out
// visitor 'view', as to a user with 'view', so the page shows no painting tools;
// a logged-in user gets 'edit'.

const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');
const F = require('../mri-access-fixtures.js');

const shortname = 'loggedoutannotations';
const source = `${U.testDataURL}/test_data/${shortname}.nii.gz`;

const project = {
  name: 'Logged-out annotations test',
  shortname,
  owner: 'foo',
  collaborators: { list: [{ userID: 'anyone', nickname: 'anyone', access: { collaborators: 'view', annotations: 'edit', files: 'view' } }] },
  files: { list: [source] },
  annotations: { list: [{ type: 'volume', name: 'Layer', values: 'foreground.json' }] }
};

const mri = {
  source,
  url: `/data/${shortname}/`,
  filename: `${shortname}.nii.gz`,
  owner: 'foo',
  name: 'Logged-out annotations brain',
  mri: {
    atlas: [
      { filename: 'project.nii.gz', name: 'Layer', project: shortname, access: 'edit', type: 'volume', labels: 'foreground.json' },
      { filename: 'noproject.nii.gz', name: 'Default', access: 'edit', type: 'volume', labels: 'foreground.json' }
    ]
  }
};

const db = () => U.getNativeDB();
const removeAll = async () => {
  await db().collection('project')
    .deleteMany({ shortname });
  await db().collection('mri')
    .deleteMany({ source });
};

/**
 * GET a path, logged out or with a user's session
 * @param {string} path The path
 * @param {string} [username] The user (logged out if not given)
 * @returns {Promise<object>} The response
 */
const get = (path, username) => {
  const req = chai.request(U.serverURL).get(path);

  return username ? req.set('Cookie', F.cookie(username)) : req;
};

// the access the project page is told, as its script declares it
// the page's logged user, given to its header: null when logged out
const pageUser = (res) => JSON.parse(res.text.match(/const loggedUser = (.*);/u)[1]);
const pageAccess = (res) => {
  const match = res.text.match(/const annotationsAccessLevel='([a-z]+)'/);

  return match && match[1];
};

// the access of each layer of the project's file, as the page loads them
const layerAccess = async (username) => {
  const res = await get(`/project/json/${shortname}/files?start=0&length=10`, username);
  assert.equal(res.statusCode, 200);
  const [file] = res.body;

  return Object.fromEntries(file.mri.atlas.map((a) => [a.filename, a.access]));
};

describe('A logged-out visitor is told view-only access to annotations anyone may edit (shared suite 4.4)', function () {
  before(async function () {
    await removeAll();
    await F.setUp();
    await db().collection('project')
      .insertOne({ ...project, created: new Date().toJSON() });
    await db().collection('mri')
      .insertOne({ ...mri });
  });

  after(async function () {
    await removeAll();
    await F.tearDown();
  });

  it('the project page: \'view\' logged out, \'edit\' logged in', async function () {
    const loggedOut = await get(`/project/${shortname}`);
    assert.equal(loggedOut.statusCode, 200);
    assert.equal(pageAccess(loggedOut), 'view');
    // nwl-components' header shows how to log in when the page's user is null (UI kit step 10b)
    assert.isNull(pageUser(loggedOut), 'the page shows how to log in');
    const loggedIn = await get(`/project/${shortname}`, F.users.nonmember);
    assert.equal(pageAccess(loggedIn), 'edit');
    assert.equal(pageUser(loggedIn).username, F.users.nonmember);
  });

  it('the layers the page loads: \'view\' logged out, \'edit\' logged in', async function () {
    assert.deepEqual(await layerAccess(), { 'project.nii.gz': 'view', 'noproject.nii.gz': 'view' });
    assert.deepEqual(await layerAccess(F.users.nonmember), { 'project.nii.gz': 'edit', 'noproject.nii.gz': 'edit' });
  });
});
