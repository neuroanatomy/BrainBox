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

const version = (shortname, list, modified, backup = true) => ({
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
      version(DAMAGED, v1, '2024-01-01T00:00:00.000Z'),
      version(DAMAGED, v2, '2024-02-01T00:00:00.000Z'),
      version(DAMAGED, v3, '2024-06-07T14:29:59.623Z'),
      version(DAMAGED, v4, '2024-07-01T00:00:00.000Z', false),
      version(HEALTHY, v1.slice(0, 3), '2024-01-01T00:00:00.000Z'),
      version(HEALTHY, v1.slice(0, 4), '2024-02-01T00:00:00.000Z', false),
      version(TWOCURRENT, v1.slice(0, 3), '2024-01-01T00:00:00.000Z', false),
      version(TWOCURRENT, v1.slice(0, 3), '2024-02-01T00:00:00.000Z', false)
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
      .deleteMany({ key: { $in: ['adminRestoreProjectFiles', 'adminFixCurrentVersions'] }, 'value.project': { $in: [DAMAGED, TWOCURRENT] } });
  });

  it('refuses the endpoints to anonymous users (401) and to non-admins (403)', async function () {
    const requests = [
      (agent) => agent.get('/admin/json/projects/damaged'),
      (agent) => agent.post('/admin/json/projects/restore-files').send({ project: DAMAGED, version: ids[2] }),
      (agent) => agent.post('/admin/json/projects/fix-current').send({ project: TWOCURRENT })
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
    const shortnames = list.map((p) => p.project);
    assert.include(shortnames, DAMAGED);
    assert.notInclude(shortnames, HEALTHY);

    const damaged = list.find((p) => p.project === DAMAGED);
    assert.include(damaged, { files: v4.length, versions: 4, currentVersions: 1, missing: 1 + lostInV3.length, suspected: true });
    const withoutExamples = (e) => {
      const copy = { ...e };
      delete copy.examples;

      return copy;
    };
    assert.deepEqual(damaged.events.map(withoutExamples), [
      {
        version: ids[1],
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
        version: ids[2],
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
    assert.isFalse(list.find((p) => p.project === TWOCURRENT).suspected);
    assert.isAbove(shortnames.indexOf(TWOCURRENT), shortnames.indexOf(DAMAGED));
  });

  it('lists projects with several current versions', async function () {
    const { list } = (await get('/admin/json/projects/damaged')).body;
    const two = list.find((p) => p.project === TWOCURRENT);
    assert.include(two, { currentVersions: 2, missing: 0 });
  });

  it('restores the files lost in a save, after the current ones, and keeps the rest of the current version', async function () {
    await projects().updateOne({ _id: (await current(DAMAGED))._id }, { $set: { description: 'current description' } });
    const res = await post('/admin/json/projects/restore-files', { project: DAMAGED, version: ids[2] });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true, restored: lostInV3.length, files: v4.length + lostInV3.length });

    const restored = await current(DAMAGED);
    assert.deepEqual(restored.files.list, [...v4, ...lostInV3]);
    assert.strictEqual(restored.description, 'current description');
    assert.strictEqual(restored.modifiedBy, 'foo');
    assert.strictEqual(await projects().countDocuments({ shortname: DAMAGED }), 5, 'the previous version is kept as a backup');

    const log = await U.getNativeDB().collection('log')
      .findOne({ key: 'adminRestoreProjectFiles', 'value.project': DAMAGED });
    assert.include(log.value, { username: 'foo', version: ids[2] });
    assert.deepEqual(log.value.files, lostInV3);

    const { list } = (await get('/admin/json/projects/damaged')).body;
    const damaged = list.find((p) => p.project === DAMAGED);
    assert.include(damaged, { missing: 1, suspected: false }, 'only the deliberate removal is left');
  });

  it('refuses to restore from an unknown version, or when nothing is missing', async function () {
    let res = await post('/admin/json/projects/restore-files', { project: DAMAGED, version: ids[4] });
    assert.equal(res.statusCode, 404);
    res = await post('/admin/json/projects/restore-files', { project: DAMAGED, version: ids[0] });
    assert.equal(res.statusCode, 404, 'the first version did not remove anything');
    res = await post('/admin/json/projects/restore-files', { project: DAMAGED, version: 'not an id' });
    assert.equal(res.statusCode, 400);
    await post('/admin/json/projects/restore-files', { project: DAMAGED, version: ids[2] });
    res = await post('/admin/json/projects/restore-files', { project: DAMAGED, version: ids[2] });
    assert.equal(res.statusCode, 409);
  });

  it('refuses to restore files in a project with several current versions', async function () {
    const res = await post('/admin/json/projects/restore-files', { project: TWOCURRENT, version: ids[7] });
    assert.equal(res.statusCode, 409);
  });

  it('keeps the most recent of several current versions, and makes the others backups', async function () {
    const res = await post('/admin/json/projects/fix-current', { project: TWOCURRENT });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true, kept: ids[7], backups: 1 });
    const currents = await projects().find({ shortname: TWOCURRENT, backup: { $exists: false } })
      .toArray();
    assert.deepEqual(currents.map((p) => String(p._id)), [ids[7]]);
    const res2 = await post('/admin/json/projects/fix-current', { project: DAMAGED });
    assert.equal(res2.statusCode, 409, 'nothing to fix');
  });
});
