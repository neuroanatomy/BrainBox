/**
 * Admin tools for finding and fixing damaged projects.
 *
 * Project documents are versioned: saving a project's settings marks every
 * version as backup and inserts a new one (the only one without the backup
 * field), so the files a save removed are still in the versions before it.
 *
 * A project is damaged when:
 * - files removed by a save are still missing from the current version. The
 *   settings page used to load the files in batches of 100, and saving before
 *   they had all arrived replaced the stored list with the part received: a
 *   save that keeps the first files of the previous version, a multiple of
 *   100 of them (maybe none), is flagged as an incomplete save. Other removals
 *   are listed too, as they may have been deliberate;
 * - it has several current versions.
 *
 * Fixes follow the same versioning rule, and are recorded in the log collection.
 */
const { ObjectId } = require('mongodb');
const lock = require('../projectLock.js');

const BATCH_LENGTH = 100; // files per batch in the settings page
const EXAMPLES = 3; // missing files shown for each save

const sources = (version) => ((version.files && Array.isArray(version.files.list)) ? version.files.list : [])
  .map((f) => (f && typeof f === 'object' ? f.source : f))
  .filter((s) => typeof s === 'string');

const isProjectName = (name) => typeof name === 'string' && name !== '';

/**
 * The versions of a project, oldest first
 * @param {object} nativeDb Native MongoDB database
 * @param {string} shortname Project shortname
 * @param {boolean} full Whole documents, or only what is needed to compare files
 * @returns {Promise<Array<object>>} The versions
 */
const projectVersions = (nativeDb, shortname, full = false) => nativeDb.collection('project')
  .find({ shortname }, full ? {} : { projection: { files: 1, modified: 1, modifiedBy: 1, backup: 1, name: 1 } })
  .sort({ _id: 1 })
  .toArray();

/**
 * Whether a save looks like it sent an incomplete list of files: it keeps the
 * first files of the previous version, a multiple of BATCH_LENGTH of them
 * @param {Array<string>} before Files of the previous version
 * @param {Array<string>} after Files of the version saved
 * @returns {boolean} True for an incomplete save
 */
const isIncompleteSave = (before, after) => after.length < before.length &&
  after.length % BATCH_LENGTH === 0 &&
  after.every((s, i) => s === before[i]);

/**
 * The files of a version that the next one does not have, in order
 * @param {Array<string>} before Files of the version
 * @param {Array<string>} after Files of the next version
 * @returns {Array<string>} The files removed
 */
const removedFiles = (before, after) => {
  const kept = new Set(after);

  return [...new Set(before)].filter((s) => !kept.has(s));
};

/**
 * Number of the files given that have annotations for the project
 * @param {object} nativeDb Native MongoDB database
 * @param {string} shortname Project shortname
 * @param {Array<string>} files Sources of the files
 * @returns {Promise<Set<string>>} The files with annotations
 */
const annotatedFiles = async (nativeDb, shortname, files) => {
  if (files.length === 0) { return new Set(); }
  const mris = await nativeDb.collection('mri')
    .find({
      source: { $in: files },
      backup: { $exists: false },
      $or: [{ [`mri.annotations.${shortname}`]: { $exists: true } }, { 'mri.atlas.project': shortname }]
    }, { projection: { _id: 0, source: 1 } })
    .toArray();

  return new Set(mris.map((m) => m.source));
};

/**
 * Examine a project's versions
 * @param {object} nativeDb Native MongoDB database
 * @param {string} shortname Project shortname
 * @returns {Promise<object|null>} The damage found, or null if there is none
 */
// eslint-disable-next-line max-statements
const examineProject = async (nativeDb, shortname) => {
  const versions = await projectVersions(nativeDb, shortname);
  const currents = versions.filter((v) => !v.backup);
  if (currents.length === 0) { return null; } // a deleted project
  const latest = currents[currents.length - 1];
  const now = new Set(sources(latest));

  const events = [];
  for (let i = 1; i < versions.length; i++) {
    const before = sources(versions[i - 1]);
    const after = sources(versions[i]);
    const removed = removedFiles(before, after);
    const stillMissing = removed.filter((s) => !now.has(s));
    if (stillMissing.length > 0) {
      events.push({
        version: String(versions[i]._id),
        previous: String(versions[i - 1]._id),
        modified: versions[i].modified,
        modifiedBy: versions[i].modifiedBy,
        before: before.length,
        after: after.length,
        removed: removed.length,
        stillMissing,
        incomplete: isIncompleteSave(before, after)
      });
    }
  }
  if (events.length === 0 && currents.length === 1) { return null; }

  const missing = [...new Set(events.flatMap((e) => e.stillMissing))];
  const annotated = await annotatedFiles(nativeDb, shortname, missing);

  return {
    project: shortname,
    name: latest.name,
    files: sources(latest).length,
    versions: versions.length,
    currentVersions: currents.length,
    missing: missing.length,
    suspected: events.some((e) => e.incomplete),
    events: events.map(({ stillMissing, ...e }) => ({
      ...e,
      stillMissing: stillMissing.length,
      annotated: stillMissing.filter((s) => annotated.has(s)).length,
      examples: stillMissing.slice(0, EXAMPLES)
    }))
  };
};

/**
 * Find the damaged projects: those whose current version lacks files that a
 * save removed, and those with several current versions. Projects with an
 * incomplete save come first, then those with the most files missing.
 * @param {object} nativeDb Native MongoDB database
 * @returns {Promise<Array<object>>} One entry per damaged project:
 *   { project, name, files, versions, currentVersions, missing, suspected, events: [{
 *   version, previous, modified, modifiedBy, before, after, removed, stillMissing,
 *   annotated, incomplete, examples }] }, where an event is a save that removed
 *   files still missing (version is the version saved, previous the one before)
 */
const findDamagedProjects = async (nativeDb) => {
  const shortnames = (await nativeDb.collection('project').distinct('shortname')).filter(isProjectName);
  const list = [];
  for (const shortname of shortnames) {
    // one project at a time, to keep the memory used bounded
    // eslint-disable-next-line no-await-in-loop
    const damage = await examineProject(nativeDb, shortname);
    if (damage) { list.push(damage); }
  }

  return list.sort((a, b) => (Number(b.suspected) - Number(a.suspected)) || (b.missing - a.missing));
};

const toObjectId = (id) => (ObjectId.isValid(id) && String(new ObjectId(id)) === id ? new ObjectId(id) : null);

/**
 * Make a new current version of a project, keeping the previous one as a
 * backup, and log the change
 * @param {object} nativeDb Native MongoDB database
 * @param {object} newVersion The new version, without _id
 * @param {object} log What to log: { key, value }
 * @returns {Promise<void>} Resolves once done
 */
const replaceCurrentVersion = async (nativeDb, newVersion, { key, value }) => {
  await nativeDb.collection('project').updateMany({ shortname: newVersion.shortname }, { $set: { backup: true } });
  await nativeDb.collection('project').insertOne(newVersion);
  await nativeDb.collection('log').insertOne({ key, value, date: (new Date()).toJSON() });
};

/**
 * The current version of a project, and the files that a save removed which
 * it does not have
 * @param {Array<object>} versions The versions of the project, oldest first
 * @param {ObjectId} id _id of the version saved that removed the files
 * @returns {object} { current, files }, or { error, status }
 */
const planRestore = (versions, id) => {
  const index = versions.findIndex((v) => v._id.equals(id));
  if (index < 1) { return { status: 404, error: 'No save of this project removed files in that version' }; }
  const currents = versions.filter((v) => !v.backup);
  if (currents.length !== 1) {
    return { status: 409, error: `The project has ${currents.length} current versions: fix that first` };
  }
  const [current] = currents;
  const now = new Set(sources(current));
  const files = removedFiles(sources(versions[index - 1]), sources(versions[index])).filter((s) => !now.has(s));
  if (files.length === 0) { return { status: 409, error: 'The files that save removed are all in the project' }; }

  return { current, files };
};

/**
 * Add back to a project the files that a save removed and that are still
 * missing, after its current files. The rest of the current version is kept.
 * @param {object} params Parameters
 * @param {object} params.nativeDb Native MongoDB database
 * @param {string} params.project Project shortname
 * @param {string} params.version _id of the version saved that removed the files
 * @param {string} params.username Admin doing the restore
 * @returns {Promise<object>} { restored, files }, or { error, status }
 */
const restoreFiles = ({ nativeDb, project, version, username }) => lock.acquire(['project', 'mri'], async () => {
  const id = toObjectId(version);
  if (!id) { return { status: 400, error: 'Invalid version' }; }
  const plan = planRestore(await projectVersions(nativeDb, project, true), id);
  if (plan.error) { return plan; }
  const { current, files } = plan;

  const restored = { ...current, files: { ...current.files, list: [...sources(current), ...files] } };
  delete restored._id;
  restored.modified = (new Date()).toJSON();
  restored.modifiedBy = username;
  await replaceCurrentVersion(nativeDb, restored, {
    key: 'adminRestoreProjectFiles',
    value: { username, project, version, files }
  });

  return { restored: files.length, files: restored.files.list.length };
});

/**
 * Keep the most recent of several current versions of a project, and make the
 * others backups
 * @param {object} params Parameters
 * @param {object} params.nativeDb Native MongoDB database
 * @param {string} params.project Project shortname
 * @param {string} params.username Admin doing the fix
 * @returns {Promise<object>} { kept, backups }, or { error, status }
 */
const fixCurrentVersions = ({ nativeDb, project, username }) => lock.acquire(['project', 'mri'], async () => {
  const currents = await nativeDb.collection('project')
    .find({ shortname: project, backup: { $exists: false } }, { projection: { _id: 1 } })
    .sort({ _id: 1 })
    .toArray();
  if (currents.length < 2) { return { status: 409, error: 'The project does not have several current versions' }; }
  const kept = currents.pop()._id;
  const backups = currents.map((v) => v._id);
  await nativeDb.collection('project').updateMany({ _id: { $in: backups } }, { $set: { backup: true } });
  await nativeDb.collection('log').insertOne({
    key: 'adminFixCurrentVersions',
    value: { username, project, kept: String(kept), backups: backups.map(String) },
    date: (new Date()).toJSON()
  });

  return { kept: String(kept), backups: backups.length };
});

module.exports = {
  isIncompleteSave,
  findDamagedProjects,
  restoreFiles,
  fixCurrentVersions
};
