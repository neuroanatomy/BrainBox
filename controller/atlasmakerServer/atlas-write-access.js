/**
 * Who may write to an atlas over the WebSocket.
 *
 * The WebSocket server cannot trust what the client says about itself (the
 * `username` in its `userData` messages, or its `editMode`), so the identity
 * comes from the HTTP session whose cookie the browser sent when it opened the
 * socket, and the access is computed from the database the same way the HTTP
 * API computes the `access` it gives each atlas
 * (BrainboxAccessControlService.setVolumeAnnotationsAccessByProjects).
 * The cookie is read by NeuroWebLab's `usernameFromCookie` (1.8.0): it takes
 * `username`, else the configured `usernameField`, `nickname` in BrainBox.
 */
const crypto = require('crypto');
const { AccessType, AccessLevel, findCurrentProject } = require('neuroweblab');
const BrainboxAccessControlService = require('../../services/BrainboxAccessControlService');

const accessLevels = ['none', 'view', 'edit', 'add', 'remove'];

/**
 * The access a user has to one atlas of an MRI, as the HTTP API gives it.
 * @param {object} nativeDb MongoDB database
 * @param {object} params Parameters
 * @param {string|null} params.username The server-verified username, or null
 * @param {string} params.dirname The atlas' directory, '/data/<md5 of the source>/'
 * @param {string} params.filename The atlas' file name
 * @param {string} params.source The MRI's source URL (checked against dirname)
 * @returns {Promise<string>} 'none', 'view', 'edit', 'add' or 'remove'
 */
const atlasAccessLevel = async (nativeDb, { username, dirname, filename, source }) => {
  if (typeof source !== 'string' || typeof dirname !== 'string' || typeof filename !== 'string') {
    return 'none';
  }
  const hash = crypto.createHash('md5').update(source)
    .digest('hex');
  if (dirname !== `/data/${hash}/`) {
    return 'none';
  }
  const mri = await nativeDb.collection('mri').findOne(
    { source, backup: { $exists: false } },
    { projection: { 'mri.atlas': 1 } }
  );
  const atlases = (mri && mri.mri && Array.isArray(mri.mri.atlas)) ? mri.mri.atlas : [];
  const atlas = atlases.find((a) => a && a.filename === filename);
  if (!atlas) {
    return 'none';
  }
  if (atlas.project) {
    const project = await findCurrentProject(nativeDb, atlas.project);
    if (project) {
      return BrainboxAccessControlService
        .getUserOrPublicAccessLevel(project, username || 'anonymous', AccessType.ANNOTATIONS)
        .toString();
    }
  }

  // no project: the access stored with the atlas, as the HTTP API sends it (a
  // logged-out visitor only views)
  return accessLevels.includes(atlas.access) ? BrainboxAccessControlService.storedLayerAccess(atlas.access, username) : 'none';
};

/**
 * Whether a user may see an atlas of an MRI, as the HTTP API decides it
 * (BrainboxAccessControlService.setVolumeAnnotationsAccessByProjects): a layer
 * of a project whose annotations the user cannot see is hidden; any other
 * layer, one without a project or whose project is gone, and a file that the
 * MRI does not list (e.g. the layer a project page has just created, before it
 * saves the MRI) are not. The MRI is the one whose directory is `dirname`,
 * whatever the client says its source is
 * @param {object} nativeDb MongoDB database
 * @param {object} params Parameters
 * @param {string|null} params.username The server-verified username, or null
 * @param {string} params.dirname The atlas' directory, '/data/<md5 of the source>/'
 * @param {string} params.filename The atlas' file name
 * @param {string} [params.source] The MRI's source URL, as the client says (to find it faster)
 * @returns {Promise<object>} { hidden, level }: level is the user's access to the layer's project, if it has one
 */
// eslint-disable-next-line max-statements
const atlasReadAccess = async (nativeDb, { username, dirname, filename, source }) => {
  if (typeof dirname !== 'string' || typeof filename !== 'string') {
    return { hidden: true, level: 'none' };
  }
  // the current version of the MRI document or, while a save replaces it (it
  // marks the current one as a backup before it inserts the next), the latest
  const projection = { url: 1, 'mri.atlas': 1 };
  const latest = async (query) => await nativeDb.collection('mri').findOne({ ...query, backup: { $exists: false } }, { projection }) ||
    nativeDb.collection('mri').findOne(query, { projection, sort: { _id: -1 } });
  let mri = (typeof source === 'string') ? await latest({ source }) : null;
  if (!mri || mri.url !== dirname) {
    // not the MRI the client says (or no source): find it by its directory
    mri = await latest({ url: dirname });
  }
  const atlases = (mri && mri.mri && Array.isArray(mri.mri.atlas)) ? mri.mri.atlas : [];
  const atlas = atlases.find((a) => a && a.filename === filename);
  if (!atlas || !atlas.project) {
    return { hidden: false, level: null };
  }
  const project = await findCurrentProject(nativeDb, atlas.project);
  if (!project) {
    return { hidden: false, level: null };
  }
  let level;
  try {
    level = BrainboxAccessControlService
      .getUserOrPublicAccessLevel(project, username || 'anonymous', AccessType.ANNOTATIONS)
      .toString();
  } catch (err) {
    // no collaborator entry for the user nor for 'anyone'
    level = 'none';
  }

  return { hidden: level === 'none', level };
};

/**
 * @param {string} level An access level
 * @returns {boolean} True for 'edit' or higher
 */
const canEdit = (level) => accessLevels.indexOf(level) >= accessLevels.indexOf(AccessLevel.EDIT.toString());

module.exports = { atlasAccessLevel, atlasReadAccess, canEdit };
