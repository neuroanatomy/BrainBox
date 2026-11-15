'use strict';

/*
  The save of an existing project by per-list rights (2026-11-15): edit on at least one list lets
  a user save; each list's changes need that list's rights (add, remove, edit); the project's own
  fields (name, description, url, brainboxURL...) need files edit. Before, every save needed files
  edit. BrainBox has no browser test of a real settings save (project-settings-page.test.js
  answers the saves itself): the cases are tested through the route.
*/

const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const _ = require('lodash');
const U = require('../utils.js');

const PREFIX = 'saverights';
const access = (files, annotations, collaborators) => ({ files, annotations, collaborators });
const levels = {
  annadd: access('view', 'add', 'view'),
  annedit: access('view', 'edit', 'view'),
  annremove: access('view', 'remove', 'view'),
  coladd: access('view', 'view', 'add'),
  viewer: access('view', 'view', 'view'),
  filesedit: access('edit', 'view', 'view'),
  // the maintainer's rights in microdraw's squirrelmonkey
  squirrel: access('view', 'remove', 'remove')
};
const nick = (key) => `${PREFIX}${key}`;
const newcomer = `${PREFIX}newcomer`;
const row = (userID, a) => ({ userID, nickname: userID, access: a });

// files without a name: saving them writes no MRI document
const project = (shortname) => ({
  name: `Save rights ${shortname}`,
  shortname,
  url: '',
  brainboxURL: `/project/${shortname}`,
  description: 'Stored description',
  created: '2026-11-15T00:00:00.000Z',
  owner: 'foo',
  collaborators: {
    list: [
      row('anyone', access('none', 'none', 'none')),
      ...Object.keys(levels).map((key) => row(nick(key), levels[key]))
    ]
  },
  files: { list: [{ source: `https://example.org/${PREFIX}/1.nii.gz`, name: '' }] },
  annotations: { list: [{ type: 'volume', values: 'foreground.json', name: 'Layer' }] }
});

const layer = (name) => ({ type: 'volume', values: 'foreground.json', name });

// eslint-disable-next-line max-statements -- one test per case
describe('TESTING THE PROJECT SAVE BY PER-LIST RIGHTS (2026-11-15)', function () {
  let count = 0;

  // a fresh project, and the document as the settings page sends it back
  const fresh = async () => {
    count += 1;
    const shortname = `${PREFIX}${count}`;
    const res = await U.insertProject(project(shortname));
    assert.isTrue(res.body.success, JSON.stringify(res.body));

    return { shortname, doc: _.omit(project(shortname), ['owner']) };
  };
  const save = (key, shortname, doc) => chai.request(U.serverURL)
    .post(`/project/json/${shortname}?token=${U.testToken}${nick(key)}`)
    .send({ data: doc });
  const layerNames = (p) => p.annotations.list.map((a) => a.name);

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    await U.getNativeDB().collection('project')
      .deleteMany({ shortname: { $regex: `^${PREFIX}` } });
    for (const nickname of [...Object.keys(levels).map(nick), newcomer]) {
      // eslint-disable-next-line no-await-in-loop
      await U.removeUser(nickname);
      // eslint-disable-next-line no-await-in-loop
      await U.insertUser({ name: nickname, nickname, joined: (new Date()).toJSON() });
      // eslint-disable-next-line no-await-in-loop
      await U.insertTestTokenForUser(nickname);
    }
  });

  after(async function () {
    await U.getNativeDB().collection('project')
      .deleteMany({ shortname: { $regex: `^${PREFIX}` } });
    for (const nickname of [...Object.keys(levels).map(nick), newcomer]) {
      // eslint-disable-next-line no-await-in-loop
      await U.removeUser(nickname);
      // eslint-disable-next-line no-await-in-loop
      await U.removeTestTokenForUser(nickname);
    }
  });

  it('annotations add: a layer added is saved', async function () {
    const { shortname, doc } = await fresh();
    doc.annotations.list.push(layer('Added'));
    const res = await save('annadd', shortname, doc);
    assert.equal(res.status, 200, res.text);
    assert.notMatch(res.body.message, /ignored/);
    assert.deepEqual(layerNames(await U.queryProject(shortname)), ['Layer', 'Added']);
  });

  it('annotations edit: a layer renamed is saved', async function () {
    const { shortname, doc } = await fresh();
    doc.annotations.list[0].name = 'Renamed';
    const res = await save('annedit', shortname, doc);
    assert.equal(res.status, 200, res.text);
    assert.notMatch(res.body.message, /ignored/);
    assert.deepEqual(layerNames(await U.queryProject(shortname)), ['Renamed']);
  });

  it('annotations edit: a layer added is ignored and reported', async function () {
    const { shortname, doc } = await fresh();
    doc.annotations.list.push(layer('Added'));
    const res = await save('annedit', shortname, doc);
    assert.equal(res.status, 200, res.text);
    assert.match(res.body.message, /Some changes \(on annotations\) were ignored/);
    assert.deepEqual(layerNames(await U.queryProject(shortname)), ['Layer']);
  });

  it('annotations remove: a layer deleted is saved', async function () {
    const { shortname, doc } = await fresh();
    doc.annotations.list.push(layer('Second'));
    await save('annremove', shortname, doc);
    doc.annotations.list = [doc.annotations.list[1]];
    const res = await save('annremove', shortname, doc);
    assert.equal(res.status, 200, res.text);
    assert.notMatch(res.body.message, /ignored/);
    assert.deepEqual(layerNames(await U.queryProject(shortname)), ['Second']);
  });

  it('collaborators add: a collaborator added is saved', async function () {
    const { shortname, doc } = await fresh();
    doc.collaborators.list.push(row(newcomer, access('view', 'view', 'view')));
    const res = await save('coladd', shortname, doc);
    assert.equal(res.status, 200, res.text);
    assert.include((await U.queryProject(shortname)).collaborators.list.map((c) => c.userID), newcomer);
  });

  it('without files edit: the name, description, url and an unknown field changed are ignored and reported, the lists saved', async function () {
    const { shortname, doc } = await fresh();
    doc.name = 'Renamed project';
    doc.description = 'Changed';
    doc.url = 'https://example.org';
    doc.extra = 'not stored before';
    doc.annotations.list.push(layer('Added'));
    const res = await save('annadd', shortname, doc);
    assert.equal(res.status, 200, res.text);
    assert.match(res.body.message, /Some changes \(on name, url, description, extra\) were ignored/);
    const stored = await U.queryProject(shortname);
    assert.equal(stored.name, `Save rights ${shortname}`);
    assert.equal(stored.description, 'Stored description');
    assert.equal(stored.url, '');
    assert.notProperty(stored, 'extra');
    assert.deepEqual(layerNames(stored), ['Layer', 'Added']);
  });

  it('without files edit: a file\'s name is not written in its MRI document', async function () {
    const { shortname, doc } = await fresh();
    doc.files.list[0].name = 'renamed';
    doc.annotations.list[0].name = 'Renamed';
    const res = await save('annedit', shortname, doc);
    assert.equal(res.status, 200, res.text);
    assert.isNull(await U.getNativeDB().collection('mri')
      .findOne({ source: doc.files.list[0].source }));
  });

  it('view everywhere: 403, with the reason in error and in message, nothing changes', async function () {
    const { shortname, doc } = await fresh();
    doc.annotations.list.push(layer('Added'));
    const res = await save('viewer', shortname, doc);
    assert.equal(res.status, 403);
    assert.isFalse(res.body.success);
    assert.match(res.body.error, /edit rights/);
    assert.notEqual(res.body.error, 'error');
    assert.equal(res.body.message, res.body.error);
    assert.deepEqual(layerNames(await U.queryProject(shortname)), ['Layer']);
  });

  it('logged out: 401, with the reason in error', async function () {
    const { shortname, doc } = await fresh();
    const res = await chai.request(U.serverURL).post(`/project/json/${shortname}`)
      .send({ data: doc });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'User not authenticated');
  });

  it('files edit: the name is saved, a layer added is ignored (as before)', async function () {
    const { shortname, doc } = await fresh();
    doc.name = 'Renamed project';
    doc.annotations.list.push(layer('Added'));
    const res = await save('filesedit', shortname, doc);
    assert.equal(res.status, 200, res.text);
    assert.match(res.body.message, /Some changes \(on annotations\) were ignored/);
    const stored = await U.queryProject(shortname);
    assert.equal(stored.name, 'Renamed project');
    assert.deepEqual(layerNames(stored), ['Layer']);
  });

  it('squirrelmonkey: files view, annotations and collaborators remove, a layer Cortex is saved', async function () {
    const { shortname, doc } = await fresh();
    // BrainBox's layers are volumes (microdraw's case adds a vectorial layer with 10regions.json)
    doc.annotations.list.push({ name: 'Cortex', type: 'volume', values: 'cerebrum.json' });
    const res = await save('squirrel', shortname, doc);
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.message, 'Project settings updated.');
    assert.deepInclude((await U.queryProject(shortname)).annotations.list, { name: 'Cortex', type: 'volume', values: 'cerebrum.json' });
  });

  it('a new project is still created by any logged-in user', async function () {
    count += 1;
    const shortname = `${PREFIX}${count}`;
    const res = await save('viewer', shortname, _.omit(project(shortname), ['owner']));
    assert.equal(res.status, 200, res.text);
    assert.equal((await U.queryProject(shortname)).owner, nick('viewer'));
  });
});
