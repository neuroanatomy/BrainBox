/**
 * The rows of a saved project compared with the stored ones (shared suite 2.4, 2.9, 2.14,
 * 2026-11-11), for postProject (project.controller.js) and BrainBox's rules for NeuroWebLab's
 * validateProject (project-rules.js, 1.20.0, T002 M13c), with BrainBox's shapes: files are
 * stored as their source and received as {source, name}; a collaborator row names its user by
 * userID.
 */
const _ = require('lodash');
// text (null, undefined and blank strings compare equal: the settings page may send '' for a
// missing value) and listOf are NeuroWebLab's (1.10.0, T002 M3)
const { AccessType, listOf, text } = require('neuroweblab');

const listTypes = [AccessType.COLLABORATORS, AccessType.FILES, AccessType.ANNOTATIONS];

// a file is stored as its source, and received as {source, name}
const fileSource = (f) => (_.isPlainObject(f) ? f.source : f);

// the user of a collaborator row: userID, else nickname or username (NWL's access check reads
// nickname or userID); validateProject's rules.collaboratorUser, the `anyone` row's included
const collaboratorUser = (c) => (_.isPlainObject(c) ? (c.userID || c.nickname || c.username) : c);

// What a row is compared on: what the settings page shows and edits. It adds a display name to
// the collaborators and `display` to the layers; a file's name is in its MRI document. Given to
// NeuroWebLab's sortRows (1.10.0, T002 M3) as sortRows(type, rows, oldRows, { rowKey }), with
// NeuroWebLab's isBlankRow, the same as BrainBox's: a collaborator row is blank without username,
// userID or nickname. Also given to NeuroWebLab's keepListsWithoutEditRights (1.19.0, T002 M12c),
// the save rights per list in postProject.
const rowKey = {
  files: (f) => text(fileSource(f)),
  collaborators: (c) => (_.isPlainObject(c) ?
    { user: text(collaboratorUser(c)), access: _.isPlainObject(c.access) ? _.pick(c.access, listTypes) : c.access } :
    c),
  annotations: (a) => (_.isPlainObject(a) ? { type: a.type, name: text(a.name), values: text(a.values) } : a)
};

module.exports = {
  collaboratorUser,
  fileSource,
  listOf,
  listTypes,
  rowKey
};
