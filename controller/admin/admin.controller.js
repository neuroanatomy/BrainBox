/* eslint-disable max-lines */
const notifier = require('../../notifier');
const { body, validationResult } = require('express-validator');
const { isAdmin, requestUsername } = require('./admins');
const annotations = require('./admin.annotations');
const projects = require('./admin.projects');
const { jsonForScript } = require('../utils/jsonForScript');
const { publicLoggedUser } = require('../user/publicUser');

const LOOPBACK_ADDRESSES = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
const FORWARDING_HEADERS = ['x-forwarded-for', 'forwarded', 'x-forwarded-host'];

/**
 * Address of the direct peer of the request (the front proxy, when there is one)
 * @param {object} req Request object
 * @returns {string|undefined} The address
 */
const peerAddress = (req) => {
  const socket = req.socket || req.connection;

  return socket ? socket.remoteAddress : undefined; // eslint-disable-line no-undefined
};

/**
 * Whether the request comes from the server itself: its direct peer is a
 * loopback address and it did not go through a proxy. The front proxy
 * (Apache) also connects from a loopback address, but it adds X-Forwarded-For
 * @param {object} req Request object
 * @returns {boolean} True for a direct local request
 */
const isDirectLocalRequest = (req) => {
  const headers = req.headers || {};

  return LOOPBACK_ADDRESSES.includes(peerAddress(req))
    && FORWARDING_HEADERS.every((name) => typeof headers[name] === 'undefined');
};

/**
 * Let through admins, and requests made on the server itself (scripts
 * calling the app's port directly, not through the front proxy)
 * @param {object} req Request object
 * @param {object} res Response object
 * @param {function} next Next middleware
 * @returns {void}
 */
const validator = (req, res, next) => {
  if (isAdmin(requestUsername(req))) {
    return next();
  }

  if (isDirectLocalRequest(req)) {
    return next();
  }

  const headers = req.headers || {};
  console.log('admin: refused', req.method, req.originalUrl, {
    peer: peerAddress(req),
    forwardedFor: headers['x-forwarded-for'],
    user: requestUsername(req)
  });
  res.status(403).send({ error: 'Unauthorized address' })
    .end();
};

/**
 * Save all atlases
 * @param {object} req Request object
 * @param {object} res Response object
 * @returns {void}
 */
const saveAllAtlases = (req, res) => {
  notifier.emit('saveAllAtlases');
  res.send({ msg: 'Will save all atlases', success: true });
};

/**
 * Broadcast a server message to all connected users. Message is
 * in req.body.msg
 * @param {object} req Request object
 * @param {object} res Response object
 * @returns {void}
 */
const broadcastMessage = async (req, res) => {
  console.log('broadcastMessage');

  await body('msg', 'Provide a msg to broadcast')
    .notEmpty()
    .run(req);

  const errors = validationResult(req).array();
  if (errors.length) {
    return res.status(403).send(errors)
      .end();
  }
  // const msg = req.sanitize(req.body.msg); // why does this not work?
  const { msg } = req.body;
  notifier.emit('broadcastMessage', msg);
  res.send({ msg: 'Will broadcast message ' + msg, success: true });
};

/**
 * Let through only admins (logged in, or authenticated by a token)
 * @param {object} req Request object
 * @param {object} res Response object
 * @param {function} next Next middleware
 * @returns {void}
 */
const requireAdmin = (req, res, next) => {
  const username = requestUsername(req);
  if (!username) {
    return res.status(401).json({ success: false, error: 'User not authenticated' });
  }
  if (!isAdmin(username)) {
    return res.status(403).json({ success: false, error: 'Admins only' });
  }

  next();
};

/**
 * Number of users connected through the WebSocket server who have
 * open the MRI with that source
 * @param {string} source Source URL of the MRI
 * @returns {number} Number of users
 */
const usersOnMRI = (source) => {
  let users = 0;
  notifier.emit('usersOnMRI', source, (n) => { users = n; });

  return users;
};

/**
 * Render the admin page
 * @param {object} req Request object
 * @param {object} res Response object
 * @returns {void}
 */
const adminPage = (req, res) => {
  const username = requestUsername(req);
  if (!username) {
    req.session.returnTo = req.originalUrl;
    res.render('askForLogin', {
      title: 'BrainBox: Admin',
      functionality: 'use the admin tools',
      login: '<a href=\'/auth/github\'>Log in with GitHub</a>'
    });

    return;
  }
  if (!isAdmin(username)) {
    res.status(403).render('error', { message: 'Admins only' });

    return;
  }
  res.render('admin', {
    title: 'BrainBox: Admin',
    loggedUser: jsonForScript(publicLoggedUser(req.user))
  });
};

const serverError = (res, err) => {
  console.log('ERROR:', err);
  res.status(500).json({ success: false, error: 'Server error' });
};

const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');

/**
 * List the annotations of projects that do not exist anymore
 * @param {object} req Request object
 * @param {object} res Response object
 * @returns {void}
 */
const getOrphans = async (req, res) => {
  try {
    const list = await annotations.findOrphanAnnotations(req.nativeDb);
    res.json({ success: true, list });
  } catch (err) {
    serverError(res, err);
  }
};

/**
 * Remove all the annotations of a project that does not exist anymore.
 * The project is in req.body.project
 * @param {object} req Request object
 * @param {object} res Response object
 * @returns {void}
 */
const removeOrphans = async (req, res) => {
  const { project } = req.body;
  if (typeof project !== 'string' || project === '') {
    return res.status(400).json({ success: false, error: 'Provide the project' });
  }
  try {
    const result = await annotations.removeOrphanProjectAnnotations(req.nativeDb, {
      project,
      username: requestUsername(req),
      isOpen: (source) => usersOnMRI(source) > 0
    });
    if (result === null) {
      return res.status(409).json({ success: false, error: `Project ${project} exists: remove its annotations MRI by MRI` });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    serverError(res, err);
  }
};

/**
 * List the annotations of an MRI. The MRI source is in req.query.url
 * @param {object} req Request object
 * @param {object} res Response object
 * @returns {void}
 */
const getMRI = async (req, res) => {
  const source = req.query.url;
  if (typeof source !== 'string' || source === '') {
    return res.status(400).json({ success: false, error: 'Provide the url of the MRI' });
  }
  try {
    const mri = await annotations.describeMRI(req.nativeDb, source);
    if (mri === null) {
      return res.status(404).json({ success: false, error: 'MRI not found' });
    }
    res.json({ success: true, ...mri, usersConnected: usersOnMRI(source) });
  } catch (err) {
    serverError(res, err);
  }
};

/**
 * Remove annotations from an MRI. req.body contains the MRI source (url),
 * the filenames of the volume annotations to remove (volume) and the
 * projects whose text annotations are removed (text)
 * @param {object} req Request object
 * @param {object} res Response object
 * @returns {void}
 */
const removeMRIAnnotations = async (req, res) => {
  const { url: source, volume = [], text = [] } = req.body;
  if (typeof source !== 'string' || source === '') {
    return res.status(400).json({ success: false, error: 'Provide the url of the MRI' });
  }
  if (!isStringArray(volume) || !isStringArray(text)) {
    return res.status(400).json({ success: false, error: 'volume and text must be lists of strings' });
  }
  if (usersOnMRI(source) > 0) {
    return res.status(409).json({ success: false, error: 'Someone has this MRI open: try again when nobody is using it' });
  }
  try {
    const removed = await annotations.removeAnnotations(req.nativeDb, { source, volume, text, username: requestUsername(req) });
    if (removed === null) {
      return res.status(404).json({ success: false, error: 'MRI not found' });
    }
    res.json({ success: true, removed });
  } catch (err) {
    serverError(res, err);
  }
};

/**
 * List the damaged projects: files removed by a save that are still missing,
 * several current versions
 * @param {object} req Request object
 * @param {object} res Response object
 * @returns {void}
 */
const getDamagedProjects = async (req, res) => {
  try {
    const list = await projects.findDamagedProjects(req.nativeDb);
    res.json({ success: true, list });
  } catch (err) {
    serverError(res, err);
  }
};

/**
 * Answer with the result of a fix, or its error
 * @param {object} res Response object
 * @param {Promise<object>} fix The fix
 * @returns {Promise<void>} Resolves once answered
 */
const sendFixResult = async (res, fix) => {
  try {
    const { status, error, ...result } = await fix;
    if (error) {
      return res.status(status).json({ success: false, error });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    serverError(res, err);
  }
};

/**
 * Add back to a project the files that a save removed. req.body contains the
 * project and the version saved that removed them
 * @param {object} req Request object
 * @param {object} res Response object
 * @returns {void}
 */
const restoreProjectFiles = (req, res) => {
  const { project, version } = req.body;
  if (typeof project !== 'string' || project === '' || typeof version !== 'string') {
    return res.status(400).json({ success: false, error: 'Provide the project and the version' });
  }
  sendFixResult(res, projects.restoreFiles({ nativeDb: req.nativeDb, project, version, username: requestUsername(req) }));
};

/**
 * Keep only the most recent of the current versions of a project. The project
 * is in req.body.project
 * @param {object} req Request object
 * @param {object} res Response object
 * @returns {void}
 */
const fixProjectCurrentVersions = (req, res) => {
  const { project } = req.body;
  if (typeof project !== 'string' || project === '') {
    return res.status(400).json({ success: false, error: 'Provide the project' });
  }
  sendFixResult(res, projects.fixCurrentVersions({ nativeDb: req.nativeDb, project, username: requestUsername(req) }));
};

module.exports = {
  validator,
  requireAdmin,
  adminPage,
  saveAllAtlases,
  broadcastMessage,
  getOrphans,
  removeOrphans,
  getMRI,
  removeMRIAnnotations,
  getDamagedProjects,
  restoreProjectFiles,
  fixProjectCurrentVersions
};
