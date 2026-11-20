/**
 * Admin tools for finding and fixing damaged projects: files removed by a
 * save that are still missing from the current version, and projects with
 * several current versions.
 *
 * The analysis and the two fixes are NeuroWebLab's `damagedProjects` (1.23.0,
 * `admin/damaged.js`, stage 4 merge M16, decision D6 option A): the version
 * token (projectVersion: a fix is refused, 409, on a project changed since
 * the list was read), the removal events, the log entries with the previous
 * document and the `after` token. What stays BrainBox's is given by the
 * adapter below:
 * - the file rows of a version: BrainBox stores a project's files as sources
 *   (strings; a file's name is in its MRI document), and old versions may
 *   hold `{source, name}` rows;
 * - the annotated files: the current MRI documents with annotations of the
 *   project, or an atlas of it;
 * - the save: NeuroWebLab's saveProjectVersion, the files stored as sources
 *   (a restore never writes `{source, name}` rows);
 * - the lock: `['project', 'mri']`, as NWL's project/lock.js (decision D3).
 * No logger: BrainBox logs with console, adminLog only writes the entry.
 *
 * Exports `{ findDamagedProjects(db), restoreFiles(db, params),
 * fixCurrentVersions(db, params), isIncompleteSave }`, `db` the native
 * MongoDB Db.
 */
const _ = require('lodash');
const { damagedProjects, listOf, saveProjectVersion } = require('neuroweblab');
const { fileSource } = require('../project/project-rows.js');

/**
 * The file rows of a version, as `{source, name}` (sources as rows)
 * @param {object} version A version of a project
 * @returns {Array<{source: string, name: string}>} The rows
 */
const sourcesOf = (version) => listOf(version, 'files')
  .map((f) => (_.isPlainObject(f) ? { source: f.source, name: f.name || '' } : { source: f, name: '' }));

/**
 * The sources among `files` that have annotations in the project
 * @param {object} db Native MongoDB Db
 * @param {string} shortname Project shortname
 * @param {Array<string>} files Sources
 * @returns {Promise<Set<string>>} The sources with annotations
 */
const annotatedFiles = async (db, shortname, files) => {
  const mris = await db.collection('mri')
    .find({
      source: { $in: files },
      backup: { $exists: false },
      $or: [{ [`mri.annotations.${shortname}`]: { $exists: true } }, { 'mri.atlas.project': shortname }]
    }, { projection: { _id: 0, source: 1 } })
    .toArray();

  return new Set(mris.map((m) => m.source));
};

module.exports = damagedProjects({
  sourcesOf,
  annotatedFiles,
  save: (db, doc, { by }) => saveProjectVersion(db, { ...doc, files: { ...doc.files, list: doc.files.list.map(fileSource) } }, { by }),
  lockKeys: () => ['project', 'mri']
});
