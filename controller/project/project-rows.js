/**
 * The rows of a saved project compared with the stored ones (shared suite 2.4, 2.9, 2.14,
 * 2026-11-11), for postProject and isProjectObject (project.controller.js). As microdraw's
 * storedRows (app/controller/project/project.validation.js), with BrainBox's shapes: files are
 * stored as their source and received as {source, name}; a collaborator row names its user by
 * userID.
 */
const _ = require('lodash');
const { AccessType } = require('neuroweblab');

const listTypes = [AccessType.COLLABORATORS, AccessType.FILES, AccessType.ANNOTATIONS];

const isBlank = (v) => v === null || typeof v === 'undefined' || (typeof v === 'string' && v.trim() === '');

// null, undefined and '' compare equal: the settings page may send '' for a missing value
const text = (v) => (isBlank(v) ? '' : v);

const listOf = (project, type) => ((project && _.isPlainObject(project[type]) && Array.isArray(project[type].list)) ? project[type].list : []);

// a file is stored as its source, and received as {source, name}
const fileSource = (f) => (_.isPlainObject(f) ? f.source : f);

// the user of a collaborator row: userID, else nickname or username (NWL's access check reads
// nickname or userID)
const collaboratorUser = (c) => (_.isPlainObject(c) ? (c.userID || c.nickname || c.username) : c);

// What a row is compared on: what the settings page shows and edits. It adds a display name to
// the collaborators and `display` to the layers; a file's name is in its MRI document.
const rowKey = {
  files: (f) => text(fileSource(f)),
  collaborators: (c) => (_.isPlainObject(c) ?
    { user: text(collaboratorUser(c)), access: _.isPlainObject(c.access) ? _.pick(c.access, listTypes) : c.access } :
    c),
  annotations: (a) => (_.isPlainObject(a) ? { type: a.type, name: text(a.name), values: text(a.values) } : a)
};

// rows left empty, e.g. by the settings page's "+" button
const isBlankRow = {
  files: (f) => _.isPlainObject(f) && isBlank(f.source) && isBlank(f.name),
  collaborators: (c) => _.isPlainObject(c) && isBlank(c.userID) && isBlank(c.nickname) && isBlank(c.username),
  annotations: (a) => _.isPlainObject(a) && isBlank(a.name) && isBlank(a.values)
};

/**
 * Sort the rows of one list of the project sent. A row equal to a stored row (on rowKey; each
 * stored row matches at most one row sent, wherever it is) is a stored row, accepted as it is
 * (2.14); a blank row that is not stored is dropped; the others are new or changed, and checked.
 * @param {string} type The list: collaborators, files or annotations
 * @param {Array} rows The rows sent, sanitised
 * @param {Array} oldRows The stored rows, sanitised as the rows sent
 * @returns {Object} { kept: the rows without the dropped ones, stored: Set of the indexes in
 *   kept of the stored rows, dropped: how many were dropped }
 */
const sortRows = (type, rows, oldRows) => {
  const available = oldRows.map(rowKey[type]);
  const kept = [];
  const stored = new Set();
  let dropped = 0;
  for (const row of rows) {
    const key = rowKey[type](row);
    const at = available.findIndex((k) => _.isEqual(k, key));
    if (at >= 0) {
      available.splice(at, 1);
      stored.add(kept.length);
      kept.push(row);
    } else if (isBlankRow[type](row)) {
      dropped += 1;
    } else {
      kept.push(row);
    }
  }

  return { kept, stored, dropped };
};

/**
 * Whether a list differs from the stored one as the settings page shows it (rowKey, in order):
 * a row changed in place, or moved (2.4)
 * @param {string} type The list
 * @param {Array} rows The rows to store
 * @param {Array} oldRows The stored rows, sanitised as the rows sent
 * @returns {boolean} True if the list changed
 */
const listChanged = (type, rows, oldRows) => !_.isEqual(rows.map(rowKey[type]), oldRows.map(rowKey[type]));

/**
 * The users that must exist (2.9): a new project's owner, and the users of the collaborator
 * rows that are not stored and that the stored project does not have. A stored project may
 * name users removed since: saving it again stays possible.
 * @param {Object} project The project sent
 * @param {Object|null} oldProject The stored project
 * @param {Set<number>} stored The indexes of the stored collaborator rows
 * @returns {Array<string>} The users, each once
 */
const usersToCheck = (project, oldProject, stored = new Set()) => {
  const known = listOf(oldProject, AccessType.COLLABORATORS).map(collaboratorUser);
  const names = listOf(project, AccessType.COLLABORATORS)
    .filter((c, i) => !stored.has(i))
    .map(collaboratorUser)
    .filter((name) => !known.includes(name));

  return _.uniq(oldProject ? names : [project.owner, ...names]);
};

module.exports = {
  collaboratorUser,
  fileSource,
  listChanged,
  listOf,
  listTypes,
  sortRows,
  usersToCheck
};
