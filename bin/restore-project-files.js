#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

/*
  Bring back the files that a project lost when its settings were saved with an
  incomplete list of files.

  Each save of a project's settings marks the previous version `backup: true` and
  inserts a new one, so the older versions are still in the `project` collection.
  This script lists them, and adds to the current version the files of an older
  one that it no longer has. Nothing else of the current version changes.

  Usage:
    MONGODB=localhost:27017/brainbox node bin/restore-project-files.js <shortname> [--from <_id>] [--apply]

  Without --apply, it only reports what it would do. --from picks the version to
  take the files from; by default, the one with the most files (the most recent
  one if several). The restored version is saved the way the settings page saves
  one: the current version is marked as a backup, and a new one inserted.
*/

const { MongoClient } = require('mongodb');

const sources = (version) => ((version.files && version.files.list) || []).map((f) => (typeof f === 'string' ? f : f.source));

/**
 * Work out a restore from the versions of a project
 * @param {Array} versions All the versions of the project, current and backups
 * @param {string} fromId Optional _id of the version to take the files from
 * @returns {Object} The current version, the version the files come from, and the missing files
 */
const planRestore = (versions, fromId) => {
  const current = versions.filter((v) => !v.backup);
  if (current.length !== 1) {
    throw new Error(`expected 1 current version of the project, found ${current.length}`);
  }
  const backups = versions.filter((v) => v.backup);
  let from;
  if (fromId) {
    from = versions.find((v) => String(v._id) === String(fromId));
    if (!from) { throw new Error(`no version with _id ${fromId}`); }
  } else {
    // the most files; among those, the most recent
    from = backups.reduce((best, v) => {
      if (!best) { return v; }
      const [n, nBest] = [sources(v).length, sources(best).length];

      return (n > nBest || (n === nBest && String(v.modified) > String(best.modified))) ? v : best;
    }, null);
  }
  const have = new Set(sources(current[0]));
  const missing = from ? [...new Set(sources(from))].filter((s) => !have.has(s)) : [];

  return { current: current[0], from, missing };
};

/**
 * Save a new current version of the project, with the missing files appended
 * @param {Object} db Native MongoDB database
 * @param {Object} plan The result of planRestore
 * @returns {Promise<Object>} The new version
 */
const applyRestore = async (db, { current, missing }) => {
  const restored = { ...current };
  delete restored._id;
  restored.files = { ...current.files, list: [...sources(current), ...missing] };
  restored.modified = (new Date()).toJSON();
  restored.modifiedBy = 'restore-project-files';
  await db.collection('project').updateMany({ shortname: current.shortname }, { $set: { backup: true } });
  await db.collection('project').insertOne(restored);

  return restored;
};

const loadVersions = (db, shortname) => db.collection('project')
  .find({ shortname })
  .sort({ modified: 1 })
  .toArray();

// eslint-disable-next-line max-statements
const main = async () => {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const fromIndex = args.indexOf('--from');
  const fromId = fromIndex >= 0 ? args[fromIndex + 1] : null;
  const shortname = args.find((a, i) => !a.startsWith('--') && (fromIndex < 0 || i !== fromIndex + 1));
  if (!shortname || (fromIndex >= 0 && !fromId)) {
    throw new Error('usage: MONGODB=host:port/db node bin/restore-project-files.js <shortname> [--from <_id>] [--apply]');
  }

  let url = process.env.MONGODB || 'localhost:27017/brainbox';
  if (!url.startsWith('mongodb')) { url = 'mongodb://' + url; }
  const client = await MongoClient.connect(url);
  try {
    const db = client.db();
    const versions = await loadVersions(db, shortname);
    if (versions.length === 0) {
      throw new Error(`no project ${shortname} in ${db.databaseName}`);
    }
    console.log(`Versions of ${shortname} in ${db.databaseName}:`);
    for (const v of versions) {
      console.log(`  ${v._id}  ${v.modified || '(no date)'}  ${String(v.modifiedBy || '').padEnd(16)} ${String(sources(v).length).padStart(6)} files${v.backup ? '' : '  <- current'}`);
    }

    const plan = planRestore(versions, fromId);
    if (!plan.from) {
      console.log('No backup version: nothing to restore.');

      return;
    }
    console.log(`\nTaking the files from ${plan.from._id} (${plan.from.modified}, ${sources(plan.from).length} files).`);
    console.log(`The current version has ${sources(plan.current).length} files; ${plan.missing.length} are missing from it.`);
    if (plan.missing.length === 0) { return; }

    const mris = await db.collection('mri')
      .find({ source: { $in: plan.missing }, backup: { $exists: false } }, { projection: { source: 1, [`mri.annotations.${shortname}`]: 1 } })
      .toArray();
    const annotated = mris.filter((m) => m.mri && m.mri.annotations && m.mri.annotations[shortname]);
    console.log(`Of the missing files, ${mris.length} are in the mri collection, ${annotated.length} with annotations for ${shortname}.`);
    console.log('First missing files:');
    plan.missing.slice(0, 10).forEach((s) => console.log(`  ${s}`));

    if (apply) {
      const restored = await applyRestore(db, plan);
      console.log(`\nRestored: ${shortname} now has ${restored.files.list.length} files.`);
    } else {
      console.log('\nNothing changed. Run again with --apply to restore them.');
    }
  } finally {
    await client.close();
  }
};

if (require.main === module) {
  main().catch((err) => {
    console.error('ERROR:', err.message);
    process.exitCode = 1;
  });
}

module.exports = { planRestore, applyRestore, loadVersions };
