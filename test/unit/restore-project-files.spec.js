'use strict';

const chai = require('chai');
const { assert } = chai;
const U = require('../utils.js');
const { planRestore, applyRestore, loadVersions } = require('../../bin/restore-project-files.js');

const SHORTNAME = 'restorefilestest';
const source = (i) => `https://example.org/restorefilestest/${i}.nii.gz`;
const sources = (from, to) => Array.from({ length: to - from }, (_x, i) => source(from + i));
const version = (modified, list, backup = true) => ({
  shortname: SHORTNAME,
  name: 'Restore files test',
  owner: 'foo',
  description: backup ? 'old' : 'current',
  files: { list },
  modified,
  ...(backup ? { backup: true } : {})
});

describe('UNIT TESTING bin/restore-project-files.js', function () {
  let nativeDb;

  before(function () {
    nativeDb = U.getNativeDB();
  });

  beforeEach(async function () {
    await U.removeProject(SHORTNAME);
    await nativeDb.collection('project').insertMany([
      version('2024-01-01T00:00:00.000Z', sources(0, 8)),
      version('2024-02-01T00:00:00.000Z', sources(0, 10)),
      version('2024-03-01T00:00:00.000Z', sources(0, 10)),
      // a file added after the loss, and one removed
      version('2024-04-01T00:00:00.000Z', [...sources(1, 4), source(99)], false)
    ]);
  });

  after(async function () {
    await U.removeProject(SHORTNAME);
  });

  it('takes the files from the most recent of the versions with the most files', async function () {
    const plan = planRestore(await loadVersions(nativeDb, SHORTNAME));
    assert.strictEqual(plan.from.modified, '2024-03-01T00:00:00.000Z');
    assert.strictEqual(plan.current.description, 'current');
    assert.deepEqual(plan.missing, [source(0), ...sources(4, 10)]);
  });

  it('takes the files from the version asked for', async function () {
    const versions = await loadVersions(nativeDb, SHORTNAME);
    const plan = planRestore(versions, String(versions[0]._id));
    assert.deepEqual(plan.missing, [source(0), ...sources(4, 8)]);
  });

  it('appends the missing files to a new current version, and keeps the rest of the current one', async function () {
    await applyRestore(nativeDb, planRestore(await loadVersions(nativeDb, SHORTNAME)));
    const versions = await loadVersions(nativeDb, SHORTNAME);
    assert.strictEqual(versions.length, 5);
    const current = await U.queryProject(SHORTNAME);
    assert.deepEqual(current.files.list, [...sources(1, 4), source(99), source(0), ...sources(4, 10)]);
    assert.strictEqual(current.description, 'current');
    assert.strictEqual(versions.filter((v) => !v.backup).length, 1);
  });

  it('refuses a project without exactly one current version', async function () {
    await nativeDb.collection('project').updateMany({ shortname: SHORTNAME }, { $set: { backup: true } });
    const versions = await loadVersions(nativeDb, SHORTNAME);
    assert.throws(() => planRestore(versions), /found 0/);
    assert.throws(() => planRestore([...versions, { ...versions[0], backup: false }, { ...versions[1], backup: false }]), /found 2/);
  });
});
