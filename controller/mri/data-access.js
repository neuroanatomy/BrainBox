'use strict';

/**
 * Who may download the files under /data over HTTP.
 *
 * `public/` is served by express.static, and each MRI has a folder there,
 * /data/<md5 of its source>/, with its image file, its layer files (random
 * names) and the earlier versions of its layers (`<ms>_<layer file>`, written
 * when a layer is saved). This middleware, placed before express.static,
 * decides whether a request for one of these files may be served, and then
 * leaves the serving (Range, ETag, 304, streaming) to express.static:
 *
 * - every file of the folder follows the MRI's rule (mayViewMriFiles, as
 *   /mri/json and the MRI page decide it: its owner always; an MRI that no
 *   project lists is open to anyone; otherwise a project that lets the user,
 *   or anyone, see its files);
 * - a layer file, and the earlier versions of it, also follow the layer's
 *   access, as the WebSocket server decides it (atlasReadAccess): a layer of an
 *   existing project whose annotations the user cannot see is hidden;
 * - a folder with no MRI document is served as before.
 *
 * The user is the one of the session cookie or of a `?token=`. A refused file
 * gets the same 404 as a file that does not exist. With DATA_ACCESS_CHECK unset
 * (or anything but 'enforce'), refusals are only logged ("WOULD REFUSE") and the
 * file is served, so that a deploy can show who would be refused.
 */
const path = require('path');
const _ = require('lodash');
const { AccessType } = require('neuroweblab');
const { getRelatedProjects, mayViewMriFiles } = require('./mri-access');
const { projectAccessLevel } = require('../atlasmakerServer/metadata-save-access');

// /data/<md5>/<file>, after decoding and normalising as express.static does
const dataFilePattern = /^data\/([0-9a-f]{32})\/([^/]+)$/i;
// the folder itself, or /data/ (express.static redirects or answers 404)
const dataFolderPattern = /^data(\/[0-9a-f]{32})?\/?$/i;
// an earlier version of a layer: '<milliseconds>_<layer file>'
const layerBackupPattern = /^\d+_(.+)$/;

/**
 * The mode of the check
 * @param {string} [value] The value of DATA_ACCESS_CHECK
 * @returns {string} 'enforce' (refuse) or 'log' (log and serve)
 */
const dataAccessMode = (value) => (value === 'enforce' ? 'enforce' : 'log');

/**
 * Where a request goes under public/, as express.static (send) resolves it
 * @param {string} urlPath The request's path (req.path)
 * @returns {string|null} The path relative to public/, e.g. 'data/<md5>/<file>', or null if it cannot be decoded
 */
const publicPath = (urlPath) => {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch (err) {
    return null;
  }

  return path.posix.normalize('./' + decoded.replace(/\\/g, '/'));
};

/**
 * The file name of an MRI's image, as the server stores it
 * @param {object} mri The MRI document
 * @returns {string|null} The file name
 */
const imageFilename = (mri) => {
  if (typeof mri.filename === 'string' && mri.filename) {
    return mri.filename;
  }
  try {
    return new URL(mri.source).pathname.split('/').pop() || null;
  } catch (err) {
    return null;
  }
};

/**
 * Whether a user may download a file of an MRI's folder
 * @param {object} params Parameters
 * @param {object|null} params.mri The MRI document whose folder it is (null if there is none)
 * @param {Array} params.projects The projects relevant to it (getRelatedProjects)
 * @param {string} params.username The server-verified username, or 'anonymous'
 * @param {string} params.filename The file's name
 * @returns {object} { allow, reason }
 */
// eslint-disable-next-line max-statements
const decideDataAccess = ({ mri, projects, username, filename }) => {
  if (!mri) {
    return { allow: true, reason: 'no MRI document' };
  }
  const name = filename.toLowerCase();
  const image = imageFilename(mri);
  const isImage = typeof image === 'string' && image.toLowerCase() === name;
  if (!mayViewMriFiles(mri.source, projects, username, mri)) {
    return { allow: false, reason: isImage ? 'private MRI' : 'file of a private MRI' };
  }
  if (isImage) {
    return { allow: true, reason: 'MRI image' };
  }
  // a layer, or an earlier version of one (compared without case: some file systems ignore it)
  const backup = name.match(layerBackupPattern);
  const atlases = (Array.isArray(_.get(mri, 'mri.atlas')) ? mri.mri.atlas : [])
    .filter((a) => a && typeof a.filename === 'string' &&
      (a.filename.toLowerCase() === name || (backup && a.filename.toLowerCase() === backup[1])));
  for (const atlas of atlases) {
    const project = atlas.project && projects.find((p) => _.isObject(p) && p.shortname === atlas.project);
    if (project && projectAccessLevel(project, username, AccessType.ANNOTATIONS) === 'none') {
      return { allow: false, reason: `hidden layer of project ${atlas.project}` };
    }
  }

  return { allow: true, reason: atlases.length ? 'layer' : 'other file' };
};

/**
 * The MRI whose folder is /data/<md5>/: its current document or, while a save
 * replaces it, the latest version; and the projects relevant to it
 * @param {object} nativeDb MongoDB database
 * @param {string} md5 The folder's name, lowercase
 * @returns {Promise<object>} { mri, projects }
 */
const loadFolder = async (nativeDb, md5) => {
  const url = `/data/${md5}/`;
  const projection = { _id: 0, source: 1, url: 1, filename: 1, owner: 1, 'mri.atlas': 1, 'mri.annotations': 1 };
  const mri = await nativeDb.collection('mri').findOne({ url, backup: { $exists: false } }, { projection }) ||
    await nativeDb.collection('mri').findOne({ url }, { projection, sort: { _id: -1 } });
  if (!mri || typeof mri.source !== 'string') {
    return { mri: null, projects: [] };
  }

  return { mri, projects: await getRelatedProjects(nativeDb, mri, mri.source) };
};

/**
 * The username of the request: its `?token=` (as authTokenMiddleware decides
 * it) or its session
 * @param {object} req The request
 * @returns {Promise<string>} The username, or 'anonymous'
 */
const requestUsername = async (req) => {
  const { token } = req.query || {};
  if (typeof token === 'string' && token && req.app && req.app.db && typeof req.app.db.findToken === 'function') {
    const found = await req.app.db.findToken(token).catch(() => null);
    if (found && found.expiryDate && found.expiryDate.getTime() > Date.now() && found.username) {
      return found.username;
    }
  }
  if (typeof req.isAuthenticated === 'function' && req.isAuthenticated() && req.user && req.user.username) {
    return req.user.username;
  }

  return 'anonymous';
};

/**
 * The middleware
 * @param {object} params Parameters
 * @param {object} params.nativeDb MongoDB database
 * @param {function} [params.mode] Returns 'enforce' or 'log' (default: from DATA_ACCESS_CHECK, read at each request)
 * @param {number} [params.ttl] How long a folder's MRI and projects are kept, in ms
 * @param {number} [params.maxEntries] How many folders are kept
 * @param {function} [params.log] Where refusals are logged
 * @returns {function} The middleware, with clearCache()
 */
const dataAccessMiddleware = ({
  nativeDb,
  mode = () => dataAccessMode(process.env.DATA_ACCESS_CHECK),
  ttl = 10 * 1000,
  maxEntries = 1000,
  log = (line) => console.log(line)
}) => {
  // md5 -> { time, promise }: the folder's MRI and projects, shared by all users
  const cache = new Map();
  const folder = (md5) => {
    const now = Date.now();
    const hit = cache.get(md5);
    if (hit && now - hit.time < ttl) {
      return hit.promise;
    }
    cache.delete(md5);
    const promise = loadFolder(nativeDb, md5);
    promise.catch(() => cache.delete(md5));
    cache.set(md5, { time: now, promise });
    while (cache.size > maxEntries) {
      cache.delete(cache.keys().next().value);
    }

    return promise;
  };

  // eslint-disable-next-line max-statements
  const middleware = async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }
    const rel = publicPath(req.path);
    if (rel === null || !(/^data(\/|$)/i).test(rel) || dataFolderPattern.test(rel)) {
      return next();
    }
    const match = rel.match(dataFilePattern);
    let username = 'anonymous';
    let decision;
    try {
      username = await requestUsername(req);
      if (match) {
        const { mri, projects } = await folder(match[1].toLowerCase());
        decision = decideDataAccess({ mri, projects, username, filename: match[2] });
      } else {
        decision = { allow: false, reason: 'not a file of an MRI folder' };
      }
    } catch (err) {
      console.error('ERROR: DATA_ACCESS check failed for', req.path, err.message);
      decision = { allow: false, reason: 'the check failed' };
    }
    if (decision.allow) {
      return next();
    }
    const enforce = mode() === 'enforce';
    log(`DATA_ACCESS ${enforce ? 'REFUSED' : 'WOULD REFUSE'} ${req.method} /${rel} (user: ${username}, reason: ${decision.reason})`);

    // refused: as a file that does not exist (leave the app's router, Express answers its own 404)
    return enforce ? next('router') : next();
  };
  middleware.clearCache = () => cache.clear();

  return middleware;
};

module.exports = {
  dataAccessMode,
  publicPath,
  decideDataAccess,
  dataAccessMiddleware
};
