/**
 * Who may write to an atlas over the WebSocket.
 *
 * The WebSocket server cannot trust what the client says about itself (the
 * `username` in its `userData` messages, or its `editMode`), so the identity
 * comes from the HTTP session whose cookie the browser sent when it opened the
 * socket, and the access is computed from the database the same way the HTTP
 * API computes the `access` it gives each atlas
 * (BrainboxAccessControlService.setVolumeAnnotationsAccessByProjects).
 */
const crypto = require('crypto');
const { AccessType, AccessLevel } = require('neuroweblab');
const BrainboxAccessControlService = require('../../services/BrainboxAccessControlService');

const accessLevels = ['none', 'view', 'edit', 'add', 'remove'];

/**
 * The username of the session a cookie header belongs to.
 * @param {function} sessionParser The app's session middleware (express-session)
 * @param {string} cookie The Cookie header sent when the socket was opened
 * @returns {Promise<string|null>} The username, or null for an anonymous visitor
 */
const usernameFromCookie = (sessionParser, cookie) => new Promise((resolve) => {
  if (typeof sessionParser !== 'function' || typeof cookie !== 'string' || cookie.length === 0) {
    resolve(null);

    return;
  }
  // a fresh request each time, so a logout is seen
  const req = { headers: { cookie }, url: '/', originalUrl: '/' };
  try {
    sessionParser(req, {}, (err) => {
      const user = !err && req.session && req.session.passport && req.session.passport.user;
      // the same reduction as NeuroWebLab's sessionUser.js (old sessions store whole documents)
      const username = user && typeof user === 'object' && (user.username || user.nickname);
      resolve(typeof username === 'string' && username.length > 0 ? username : null);
    });
  } catch (err) {
    resolve(null);
  }
});

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
    const project = await nativeDb.collection('project').findOne({ shortname: atlas.project, backup: { $exists: false } });
    if (project) {
      return BrainboxAccessControlService
        .getUserOrPublicAccessLevel(project, username || 'anonymous', AccessType.ANNOTATIONS)
        .toString();
    }
  }

  // no project: the access stored with the atlas, as the HTTP API sends it
  return accessLevels.includes(atlas.access) ? atlas.access : 'none';
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
  const project = await nativeDb.collection('project').findOne({ shortname: atlas.project, backup: { $exists: false } });
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

module.exports = { usernameFromCookie, atlasAccessLevel, atlasReadAccess, canEdit };
