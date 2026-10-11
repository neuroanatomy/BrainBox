/**
 * Admin tools for inspecting and removing annotations.
 *
 * MRI documents are versioned: a change marks every version of the
 * document as backup and inserts a new version (the only one without
 * the backup field). Removals done here follow the same rule, so that
 * the previous version can be restored from its backup, and they are
 * recorded in the log collection.
 */
const AsyncLock = require('async-lock');
const lock = new AsyncLock();

const isProjectName = (name) => typeof name === 'string' && name !== '';

/**
 * Shortnames of the projects that exist
 * @param {object} nativeDb Native MongoDB database
 * @returns {Promise<Array<string>>} Project shortnames
 */
const liveProjects = async (nativeDb) => {
  const shortnames = await nativeDb.collection('project').distinct('shortname', { backup: { $exists: false } });

  return shortnames.filter(isProjectName);
};

/**
 * Find the annotations that belong to projects which do not exist anymore
 * (for example, projects deleted before deleting a project also removed
 * its annotations).
 * @param {object} nativeDb Native MongoDB database
 * @returns {Promise<Array<object>>} One entry per missing project:
 *   { project, volume, text, mris: [{ source, name, volume, text }] },
 *   where volume is a number of volume annotations and text the number
 *   of MRIs with text annotations for that project.
 */
const findOrphanAnnotations = async (nativeDb) => {
  const live = await liveProjects(nativeDb);
  const notLive = (variable) => ({
    $and: [
      { $eq: [{ $type: variable }, 'string'] },
      { $ne: [variable, ''] },
      { $not: [{ $in: [variable, live] }] }
    ]
  });
  const rows = await nativeDb.collection('mri').aggregate([
    { $match: { backup: { $exists: false } } },
    {
      $project: {
        _id: 0,
        source: 1,
        name: 1,
        volume: {
          $filter: {
            input: {
              $map: {
                input: { $cond: [{ $isArray: '$mri.atlas' }, '$mri.atlas', []] },
                in: '$$this.project'
              }
            },
            cond: notLive('$$this')
          }
        },
        text: {
          $filter: {
            input: {
              $map: {
                input: { $objectToArray: { $cond: [{ $eq: [{ $type: '$mri.annotations' }, 'object'] }, '$mri.annotations', {}] } },
                in: '$$this.k'
              }
            },
            cond: notLive('$$this')
          }
        }
      }
    },
    { $match: { $or: [{ 'volume.0': { $exists: true } }, { 'text.0': { $exists: true } }] } }
  ])
    .toArray();

  const byProject = new Map();
  const entryFor = (project, row) => {
    if (!byProject.has(project)) {
      byProject.set(project, { project, volume: 0, text: 0, mris: new Map() });
    }
    const entry = byProject.get(project);
    if (!entry.mris.has(row.source)) {
      entry.mris.set(row.source, { source: row.source, name: row.name || '', volume: 0, text: 0 });
    }

    return { entry, mri: entry.mris.get(row.source) };
  };
  for (const row of rows) {
    for (const project of row.volume) {
      const { entry, mri } = entryFor(project, row);
      entry.volume += 1;
      mri.volume += 1;
    }
    for (const project of row.text) {
      const { entry, mri } = entryFor(project, row);
      entry.text += 1;
      mri.text += 1;
    }
  }

  return [...byProject.values()]
    .map((entry) => ({ ...entry, mris: [...entry.mris.values()].sort((a, b) => b.volume - a.volume) }))
    .sort((a, b) => (b.volume + b.text) - (a.volume + a.text));
};

/**
 * List the annotations of an MRI
 * @param {object} nativeDb Native MongoDB database
 * @param {string} source Source URL of the MRI
 * @returns {Promise<object|null>} { source, name, volume: [...], text: [...] },
 *   or null if there is no MRI with that source
 */
const describeMRI = async (nativeDb, source) => {
  const mri = await nativeDb.collection('mri').findOne({ source, backup: { $exists: false } }, { projection: { _id: 0 } });
  if (!mri) {
    return null;
  }
  const live = new Set(await liveProjects(nativeDb));
  const atlas = (mri.mri && Array.isArray(mri.mri.atlas)) ? mri.mri.atlas : [];
  const annotations = (mri.mri && mri.mri.annotations && typeof mri.mri.annotations === 'object') ? mri.mri.annotations : {};

  return {
    source: mri.source,
    name: mri.name || '',
    volume: atlas.map((a) => ({
      filename: a.filename,
      name: a.name,
      project: a.project,
      projectExists: isProjectName(a.project) ? live.has(a.project) : null,
      owner: a.owner,
      modifiedBy: a.modifiedBy,
      created: a.created,
      modified: a.modified,
      labels: a.labels,
      vectorial: Array.isArray(a.vectorial) ? a.vectorial.length : 0
    })),
    text: Object.keys(annotations).map((project) => ({
      project,
      projectExists: isProjectName(project) ? live.has(project) : null,
      keys: (annotations[project] && typeof annotations[project] === 'object') ? Object.keys(annotations[project]) : []
    }))
  };
};

/**
 * Remove the volume annotations selected by a function, and the text
 * annotations of some projects, from an MRI. The current version is
 * kept as a backup.
 * @param {object} nativeDb Native MongoDB database
 * @param {object} params Parameters
 * @param {string} params.source Source URL of the MRI
 * @param {function(object): boolean} params.selectVolume Tells if a volume annotation is removed
 * @param {Array<string>} params.text Projects whose text annotations are removed
 * @param {string} params.username Admin doing the removal
 * @returns {Promise<object|null>} { volume, text } with what was removed,
 *   or null if there is no MRI with that source
 */
// eslint-disable-next-line max-statements
const removeSelected = (nativeDb, { source, selectVolume, text, username }) => lock.acquire('mri', async () => {
  const mri = await nativeDb.collection('mri').findOne({ source, backup: { $exists: false } });
  if (!mri) {
    return null;
  }
  const atlas = (mri.mri && Array.isArray(mri.mri.atlas)) ? mri.mri.atlas : [];
  const removedVolume = atlas.filter(selectVolume);
  const removedText = (mri.mri && mri.mri.annotations && typeof mri.mri.annotations === 'object')
    ? text.filter((project) => Object.prototype.hasOwnProperty.call(mri.mri.annotations, project))
    : [];

  if (removedVolume.length === 0 && removedText.length === 0) {
    return { volume: [], text: [] };
  }

  mri.mri.atlas = atlas.filter((a) => !selectVolume(a));
  for (const project of removedText) {
    delete mri.mri.annotations[project];
  }
  delete mri._id;
  mri.modified = (new Date()).toJSON();
  mri.modifiedBy = username;

  await nativeDb.collection('mri').updateMany({ source }, { $set: { backup: true } });
  await nativeDb.collection('mri').insertOne(mri);

  const summary = {
    volume: removedVolume.map(({ filename, name, project, owner, created }) => ({ filename, name, project, owner, created })),
    text: removedText
  };
  await nativeDb.collection('log').insertOne({
    key: 'adminRemoveAnnotations',
    value: { username, source, ...summary },
    date: (new Date()).toJSON()
  });

  return summary;
});

/**
 * Remove volume annotations (by filename) and text annotations (by project)
 * from an MRI. The current version is kept as a backup.
 * @param {object} nativeDb Native MongoDB database
 * @param {object} params Parameters
 * @param {string} params.source Source URL of the MRI
 * @param {Array<string>} params.volume Filenames of the volume annotations to remove
 * @param {Array<string>} params.text Projects whose text annotations are removed
 * @param {string} params.username Admin doing the removal
 * @returns {Promise<object|null>} { volume, text } with what was removed,
 *   or null if there is no MRI with that source
 */
const removeAnnotations = (nativeDb, { source, volume = [], text = [], username }) => {
  const filenames = new Set(volume);

  return removeSelected(nativeDb, { source, selectVolume: (a) => filenames.has(a.filename), text, username });
};

/**
 * Remove all the annotations of a project that does not exist anymore
 * @param {object} nativeDb Native MongoDB database
 * @param {object} params Parameters
 * @param {string} params.project Shortname of the missing project
 * @param {string} params.username Admin doing the removal
 * @param {function(string): boolean} params.isOpen Tells if an MRI (by source) is open by a user: those are skipped
 * @returns {Promise<object|null>} { removed: [{ source, volume, text }], skipped: [source] },
 *   or null if the project exists
 */
const removeOrphanProjectAnnotations = async (nativeDb, { project, username, isOpen }) => {
  const live = await liveProjects(nativeDb);
  if (live.includes(project)) {
    return null;
  }
  const mris = await nativeDb.collection('mri').find({
    backup: { $exists: false },
    $or: [
      { 'mri.atlas.project': project },
      { ['mri.annotations.' + project]: { $exists: true } }
    ]
  }, { projection: { _id: 0, source: 1 } })
    .toArray();

  const removed = [];
  const skipped = [];
  for (const mri of mris) {
    if (isOpen(mri.source)) {
      skipped.push(mri.source);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const summary = await removeSelected(nativeDb, {
      source: mri.source,
      selectVolume: (a) => a.project === project,
      text: [project],
      username
    });
    if (summary) {
      removed.push({ source: mri.source, volume: summary.volume.length, text: summary.text.length });
    }
  }

  return { removed, skipped };
};

module.exports = {
  liveProjects,
  findOrphanAnnotations,
  describeMRI,
  removeAnnotations,
  removeOrphanProjectAnnotations
};
