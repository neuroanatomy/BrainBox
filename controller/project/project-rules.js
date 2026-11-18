/**
 * BrainBox's rules for NeuroWebLab's validateProject (1.20.0, project/validate.js; T002 M13c),
 * the validation of the project sent to POST /project/json/:projectName (postProject,
 * project.controller.js). The core checks the shortname, the three lists, the field types, the
 * collaborator rows, the duplicate layer names, the `anyone` row and the users; BrainBox gives
 * the file and layer rules, the name and description whitelist, the `volume` layer and the stored
 * file names. Rows equal to stored ones are not given to the row rules (shared suite 2.14), and the
 * stored values are kept as they are: `checkStoredFields: false` (a stored `description: null`
 * stays accepted, as the stored fields are merged into the body before the validation) and
 * `checkStoredKeys: false` (BrainBox never refused a stored row for its keys).
 */
const _ = require('lodash');
const validatorNPM = require('validator');
const { sanitize } = require('neuroweblab');
const { collaboratorUser, rowKey } = require('./project-rows.js');

// the characters of a new name, description or file name
const allowed = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,_- \'–:;'.split('');
const isWhitelisted = (str) => validatorNPM.isWhitelisted(str, allowed);

// the layer types of BrainBox's pages: the settings page offers volume and text, the project
// page shows text, multiple choices and hidden text layers (view/brainbox/src/brainbox.js
// annotationType)
const layerTypes = ['volume', 'text', 'multiple choices', 'hidden text'];

/**
 * What is wrong with a new file row
 * @param {*} file The row, as the settings page sends it: {source, name}
 * @returns {string|null} What is wrong, or null
 */
const fileError = (file) => {
  if (!_.isPlainObject(file) || typeof file.source !== 'string') {
    return 'File source not specified';
  }
  if (typeof file.name !== 'string') {
    return 'File name not specified';
  }
  if (!validatorNPM.isURL(file.source)) {
    return `Invalid file URL: ${file.source}`;
  }
  if (!isWhitelisted(file.name)) {
    return `Invalid file name "${file.name}"`;
  }

  return null;
};

// What a layer's name is compared on: blank if it has none
const layerName = (a) => (typeof a.name === 'string' ? a.name.trim() : '');

/**
 * What is wrong with a new layer: one of BrainBox's types, and a name (shared suite 2.10). The
 * core refuses a name of another layer, ignoring case and surrounding spaces
 * @param {*} layer The row
 * @param {number} i Its index
 * @returns {string|null} What is wrong, or null
 */
const layerError = (layer, i) => {
  if (!_.isPlainObject(layer) || !layerTypes.includes(layer.type)) {
    return `Layer ${i + 1} has an invalid type (allowed: ${layerTypes.join(', ')})`;
  }
  if (layerName(layer) === '') {
    return `Layer ${i + 1} needs a name`;
  }

  return null;
};

/**
 * The name and description: BrainBox's characters, unless the stored value is kept as it is (a
 * save keeps the stored fields the client does not send, shared suite 2.17, and these may be older
 * than the checks). The core has checked they are strings
 * @param {object} project The project sent, sanitised, with the stored fields
 * @param {object} params { oldProject: the stored project or null }
 * @returns {string|null} What is wrong, or null
 */
const fieldsError = (project, { oldProject }) => {
  const isStoredText = (field) => !_.isNil(oldProject) && _.isEqual(project[field], sanitize(oldProject[field]));
  if (project.description && !isStoredText('description') && !isWhitelisted(project.description)) {
    return 'Invalid project description';
  }
  if (project.name && !isStoredText('name') && !isWhitelisted(project.name)) {
    return 'Invalid name';
  }

  return null;
};

/**
 * The checks of the whole project, given the database: at least one volume layer, and the names
 * of the stored files that fileError would refuse, kept if they are the names stored in the
 * files' MRI documents (2.14)
 * @param {object} db Native MongoDB Db
 * @returns {function(object, object): Promise<string|null>} rules.projectError
 */
const projectErrorFor = (db) => async (project, { stored }) => {
  if (!project.annotations.list.some((a) => _.isPlainObject(a) && a.type === 'volume')) {
    return 'Annotations must contain at least 1 volume-type entry';
  }
  const storedNames = project.files.list.filter((file, i) => stored.files.has(i) &&
    _.isPlainObject(file) && typeof file.name === 'string' && !isWhitelisted(file.name));
  const mris = await Promise.all(storedNames.map(({ source }) => db.collection('mri')
    .findOne({ source, backup: { $exists: false } }, { projection: { name: 1, _id: 0 } })));
  const refused = storedNames.find((file, i) => !mris[i] || sanitize(_.isNil(mris[i].name) ? '' : mris[i].name) !== file.name);

  return refused ? `Invalid file name "${refused.name}"` : null;
};

/**
 * BrainBox's rules for validateProject, for a request's database
 * @param {object} db Native MongoDB Db (req.nativeDb)
 * @returns {object} The rules
 */
const projectRules = (db) => ({
  collaboratorUser,
  rowKey,
  fileError,
  layerError,
  fieldsError,
  projectError: projectErrorFor(db),
  checkStoredFields: false,
  checkStoredKeys: false
});

/**
 * The users among `names` with no user document, looked up on `nickname` in one query
 * @param {object} db Native MongoDB Db
 * @param {Array<string>} names The names
 * @returns {Promise<Array<string>>} The missing ones
 */
const missingUsers = async (db, names) => {
  if (names.length === 0) {
    return [];
  }
  const found = await db.collection('user').distinct('nickname', { nickname: { $in: names } });

  return names.filter((name) => !found.includes(name));
};

module.exports = {
  missingUsers,
  projectRules
};
