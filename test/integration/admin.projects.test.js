'use strict';

/*
  The admin tools for damaged projects: finding projects that lost files (in particular through
  saves of an incomplete list of files, from a settings page that had not loaded them all) or that
  have several current versions, and fixing them. The project versions are inserted directly in
  the database, in order, so their _ids follow the order of the saves.
*/

const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const { ObjectId } = require('mongodb');
const { projectVersion } = require('neuroweblab');
const U = require('../utils.js');
const admins = require('../../controller/admin/admins');

const adminToken = U.testToken + 'foo';
const otherToken = U.testToken + 'bar';
const DAMAGED = 'admindamaged';
const HEALTHY = 'adminhealthy';
const TWOCURRENT = 'admintwocurrent';
const src = (i) => `https://example.org/admindamaged/${i}.nii.gz`;
const range = (from, to) => Array.from({ length: to - from }, (_x, i) => from + i);

// v1: 250 files; v2: one removed (s5); v3: the first 200 of v2 (an incomplete save);
// v4, current: v3 and a new file (s300)
const v1 = range(0, 250).map(src);
const v2 = v1.filter((s) => s !== src(5));
const v3 = v2.slice(0, 200);
const v4 = [...v3, src(300)];
const lostInV3 = v2.slice(200);

const projectDoc = (shortname, list, modified, backup = true) => ({
  ...U.projectTest,
  shortname,
  brainboxURL: `/project/${shortname}`,
  files: { list },
  modified,
  modifiedBy: 'someone',
  ...(backup ? { backup: true } : {})
});

const projects = () => U.getNativeDB().collection('project');
const current = (shortname) => projects().findOne({ shortname, backup: { $exists: false } });
const get = (url, token = adminToken) => chai.request(U.serverURL).get(url)
  .query({ token });
const post = (url, data, token = adminToken) => chai.request(U.serverURL).post(url)
  .query({ token })
  .send(data);
// a project's entry in the damaged list (its version token is `version`)
const listed = async (shortname) => (await get('/admin/json/projects/damaged')).body.list
  .find((p) => p.shortname === shortname);
const logs = () => U.getNativeDB().collection('log');
const logCount = (shortname) => logs().countDocuments({ key: /^admin/, 'value.shortname': shortname });
const versionsOf = (shortname) => projects().find({ shortname }, { sort: { _id: 1 } })
  .toArray();

// eslint-disable-next-line max-statements
describe('TESTING THE ADMIN TOOLS FOR DAMAGED PROJECTS', function () {
  let previousAdmins;
  let ids;

  before(async function () {
    previousAdmins = admins.getAdmins();
    admins.setAdmins(['foo']);
    await U.insertTestTokenForUser('bar');
  });

  after(async function () {
    admins.setAdmins(previousAdmins);
    await U.removeTestTokenForUser('bar');
  });

  beforeEach(async function () {
    const { insertedIds } = await projects().insertMany([
      projectDoc(DAMAGED, v1, '2024-01-01T00:00:00.000Z'),
      projectDoc(DAMAGED, v2, '2024-02-01T00:00:00.000Z'),
      projectDoc(DAMAGED, v3, '2024-06-07T14:29:59.623Z'),
      projectDoc(DAMAGED, v4, '2024-07-01T00:00:00.000Z', false),
      projectDoc(HEALTHY, v1.slice(0, 3), '2024-01-01T00:00:00.000Z'),
      projectDoc(HEALTHY, v1.slice(0, 4), '2024-02-01T00:00:00.000Z', false),
      projectDoc(TWOCURRENT, v1.slice(0, 3), '2024-01-01T00:00:00.000Z', false),
      projectDoc(TWOCURRENT, v1.slice(0, 3), '2024-02-01T00:00:00.000Z', false)
    ]);
    ids = Object.values(insertedIds).map(String);
    // one of the files lost in v3 has text annotations for the project
    await U.getNativeDB().collection('mri')
      .insertOne({ source: src(210), name: 'annotated', mri: { atlas: [], annotations: { [DAMAGED]: { Comments: { value: 'work' } } } } });
  });

  afterEach(async function () {
    await projects().deleteMany({ shortname: { $in: [DAMAGED, HEALTHY, TWOCURRENT] } });
    await U.getNativeDB().collection('mri')
      .deleteMany({ source: src(210) });
    await U.getNativeDB().collection('log')
      .deleteMany({ key: { $in: ['adminRestoreProjectFiles', 'adminFixCurrentVersions'] }, 'value.shortname': { $in: [DAMAGED, TWOCURRENT] } });
  });

  it('refuses the endpoints to anonymous users (401) and to non-admins (403)', async function () {
    const requests = [
      (agent) => agent.get('/admin/json/projects/damaged'),
      (agent) => agent.post('/admin/json/projects/restore-files').send({ project: DAMAGED, version: 'token', save: ids[2] }),
      (agent) => agent.post('/admin/json/projects/fix-current').send({ project: TWOCURRENT, version: 'token' })
    ];
    for (const request of requests) {
      // eslint-disable-next-line no-await-in-loop
      const anonymous = await request(chai.request(U.serverURL));
      assert.equal(anonymous.statusCode, 401);
      // eslint-disable-next-line no-await-in-loop
      const other = await request(chai.request(U.serverURL)).query({ token: otherToken });
      assert.equal(other.statusCode, 403);
    }
    assert.deepEqual((await current(DAMAGED)).files.list, v4, 'nothing was changed');
  });

  // eslint-disable-next-line max-statements
  it('lists the files each save removed that are still missing, and flags incomplete saves', async function () {
    const res = await get('/admin/json/projects/damaged');
    assert.equal(res.statusCode, 200);
    const { list } = res.body;
    const shortnames = list.map((p) => p.shortname);
    assert.include(shortnames, DAMAGED);
    assert.notInclude(shortnames, HEALTHY);

    const damaged = list.find((p) => p.shortname === DAMAGED);
    assert.include(damaged, { owner: U.projectTest.owner, files: v4.length, versions: 4, missing: 1 + lostInV3.length, suspected: true });
    assert.match(damaged.version, /^[0-9a-f]{20}$/);
    assert.deepEqual(damaged.currentVersions, [{ id: ids[3], modified: '2024-07-01T00:00:00.000Z', modifiedBy: 'someone' }]);
    const withoutExamples = (e) => {
      const copy = { ...e };
      delete copy.examples;

      return copy;
    };
    assert.deepEqual(damaged.events.map(withoutExamples), [
      {
        save: ids[1],
        previous: ids[0],
        modified: '2024-02-01T00:00:00.000Z',
        modifiedBy: 'someone',
        before: 250,
        after: 249,
        removed: 1,
        stillMissing: 1,
        annotated: 0,
        incomplete: false
      },
      {
        save: ids[2],
        previous: ids[1],
        modified: '2024-06-07T14:29:59.623Z',
        modifiedBy: 'someone',
        before: 249,
        after: 200,
        removed: lostInV3.length,
        stillMissing: lostInV3.length,
        annotated: 1,
        incomplete: true
      }
    ]);
    assert.deepEqual(damaged.events[1].examples, lostInV3.slice(0, 3));
    assert.isTrue(list.slice(0, shortnames.indexOf(DAMAGED)).every((p) => p.suspected), 'projects with incomplete saves come first');
    assert.isFalse(list.find((p) => p.shortname === TWOCURRENT).suspected);
    assert.isAbove(shortnames.indexOf(TWOCURRENT), shortnames.indexOf(DAMAGED));
  });

  it('lists projects with several current versions', async function () {
    const { list } = (await get('/admin/json/projects/damaged')).body;
    const two = list.find((p) => p.shortname === TWOCURRENT);
    assert.include(two, { missing: 0 });
    assert.deepEqual(two.currentVersions.map((v) => v.id), [ids[6], ids[7]]);
  });

  // eslint-disable-next-line max-statements
  it('restores the files lost in a save, after the current ones, and keeps the rest of the current version', async function () {
    await projects().updateOne({ _id: (await current(DAMAGED))._id }, { $set: { description: 'current description' } });
    const previous = await current(DAMAGED);
    const { version } = await listed(DAMAGED);
    const res = await post('/admin/json/projects/restore-files', { project: DAMAGED, version, save: ids[2] });
    assert.equal(res.statusCode, 200);
    const restored = await current(DAMAGED);
    const log = await logs().findOne({ key: 'adminRestoreProjectFiles', 'value.shortname': DAMAGED });
    assert.deepEqual(res.body, {
      success: true, restored: lostInV3.length, files: v4.length + lostInV3.length, version: projectVersion(restored), log: String(log._id)
    });

    assert.deepEqual(restored.files.list, [...v4, ...lostInV3]);
    assert.strictEqual(restored.description, 'current description');
    assert.strictEqual(restored.modifiedBy, 'foo');
    assert.strictEqual(await projects().countDocuments({ shortname: DAMAGED }), 5, 'the previous version is kept as a backup');

    assert.include(log.value, { username: 'foo', before: version, save: ids[2], after: projectVersion(restored) });
    assert.deepEqual(log.value.files, lostInV3);
    const withoutId = { ...previous };
    delete withoutId._id;
    assert.deepEqual(log.value.project, withoutId, 'the log entry holds the previous document');

    const damaged = await listed(DAMAGED);
    assert.include(damaged, { missing: 1, suspected: false }, 'only the deliberate removal is left');
  });

  it('stores sources only when a version held {source, name} rows, and keeps the other rows unchanged', async function () {
    // an old current version with rows: the restore stores strings, the current rows' sources first
    const { _id } = await current(DAMAGED);
    const rows = v4.map((source, i) => (i % 2 ? { source, name: `file ${i}` } : source));
    await projects().updateOne({ _id }, { $set: { 'files.list': rows } });
    const { version } = await listed(DAMAGED);
    const res = await post('/admin/json/projects/restore-files', { project: DAMAGED, version, save: ids[2] });
    assert.equal(res.statusCode, 200);
    const { files } = await current(DAMAGED);
    assert.isTrue(files.list.every((f) => typeof f === 'string'), 'files.list holds strings only');
    assert.deepEqual(files.list, [...v4, ...lostInV3]);
  });

  it('refuses a fix on a project changed since it was listed (409), and stores nothing', async function () {
    const damaged = await listed(DAMAGED);
    const two = await listed(TWOCURRENT);
    // a save of each project after the list was read
    await projects().updateOne({ _id: (await current(DAMAGED))._id }, { $set: { description: 'changed' } });
    await projects().updateOne({ _id: new ObjectId(ids[7]) }, { $set: { description: 'changed' } });
    const before = { damaged: await versionsOf(DAMAGED), two: await versionsOf(TWOCURRENT) };

    let res = await post('/admin/json/projects/restore-files', { project: DAMAGED, version: damaged.version, save: ids[2] });
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, `Project ${DAMAGED} has changed since it was listed: reload the list`);
    res = await post('/admin/json/projects/fix-current', { project: TWOCURRENT, version: two.version });
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, `Project ${TWOCURRENT} has changed since it was listed: reload the list`);

    assert.deepEqual(await versionsOf(DAMAGED), before.damaged);
    assert.deepEqual(await versionsOf(TWOCURRENT), before.two);
    assert.equal(await logCount(DAMAGED), 0);
    assert.equal(await logCount(TWOCURRENT), 0);
  });

  it('refuses to restore from an unknown version, or when nothing is missing', async function () {
    const { version } = await listed(DAMAGED);
    let res = await post('/admin/json/projects/restore-files', { project: DAMAGED, version, save: ids[4] });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, 'No save of this project stored that version');
    res = await post('/admin/json/projects/restore-files', { project: DAMAGED, version, save: ids[0] });
    assert.equal(res.statusCode, 404, 'the first version did not remove anything');
    res = await post('/admin/json/projects/restore-files', { project: DAMAGED, version, save: 'not an id' });
    assert.equal(res.statusCode, 400);
    res = await post('/admin/json/projects/restore-files', { project: DAMAGED, version, save: ids[2] });
    assert.equal(res.statusCode, 200);
    res = await post('/admin/json/projects/restore-files', { project: DAMAGED, version: res.body.version, save: ids[2] });
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, 'The files that save removed are all in the project');
  });

  it('refuses to restore files in a project with several current versions', async function () {
    const { version } = await listed(TWOCURRENT);
    const res = await post('/admin/json/projects/restore-files', { project: TWOCURRENT, version, save: ids[7] });
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, `Project ${TWOCURRENT} has 2 current versions: fix that first`);
  });

  it('refuses a body without the project, its version or the save (400)', async function () {
    const cases = [
      ['restore-files', { version: 'token', save: ids[2] }, 'Provide the project shortname'],
      ['restore-files', { project: DAMAGED, save: ids[2] }, 'Provide the version of the project, as listed'],
      ['restore-files', { project: DAMAGED, version: 'token' }, 'Provide the save: the id of the version it stored, as listed'],
      ['fix-current', { version: 'token' }, 'Provide the project shortname'],
      ['fix-current', { project: TWOCURRENT }, 'Provide the version of the project, as listed']
    ];
    for (const [route, body, error] of cases) {
      // eslint-disable-next-line no-await-in-loop
      const res = await post(`/admin/json/projects/${route}`, body);
      assert.equal(res.statusCode, 400, `${route} ${JSON.stringify(body)}`);
      assert.equal(res.body.error, error);
    }
  });

  it('refuses a project without a current version (404)', async function () {
    let res = await post('/admin/json/projects/restore-files', { project: 'adminnosuchproject', version: 'token', save: ids[2] });
    assert.equal(res.statusCode, 404);
    res = await post('/admin/json/projects/fix-current', { project: 'adminnosuchproject', version: 'token' });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, 'Project adminnosuchproject not found');
  });

  it('keeps the most recent of several current versions, and makes the others backups', async function () {
    const { version } = await listed(TWOCURRENT);
    const res = await post('/admin/json/projects/fix-current', { project: TWOCURRENT, version });
    assert.equal(res.statusCode, 200);
    const log = await logs().findOne({ key: 'adminFixCurrentVersions', 'value.shortname': TWOCURRENT });
    assert.deepEqual(res.body, { success: true, kept: ids[7], backups: 1, version, log: String(log._id) });
    assert.include(log.value, { username: 'foo', kept: ids[7] });
    assert.deepEqual(log.value.backups, [ids[6]]);
    const currents = await projects().find({ shortname: TWOCURRENT, backup: { $exists: false } })
      .toArray();
    assert.deepEqual(currents.map((p) => String(p._id)), [ids[7]]);
    const res2 = await post('/admin/json/projects/fix-current', { project: DAMAGED, version: (await listed(DAMAGED)).version });
    assert.equal(res2.statusCode, 409, 'nothing to fix');
    assert.equal(res2.body.error, `Project ${DAMAGED} does not have several current versions`);
  });
});
