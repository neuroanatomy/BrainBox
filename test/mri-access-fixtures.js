'use strict';

// Users, sessions, tokens and a project for the tests of who may read and write
// an MRI document over HTTP (test/integration/mri-*-access.test.js).
//
// The test brain (U.localBertURL) is listed by a project whose files anyone
// can see but whose annotations are hidden from anyone who is not a
// collaborator: 'viewer' may view its files and annotations, 'editor' may edit
// both, 'nonmember' is logged in but not a collaborator, and 'mriowner' owns
// the MRI document. Each one has a session cookie and an upload token.

const crypto = require('crypto');
const U = require('./utils.js');

const shortname = 'mriroutesaccess';
const users = {
  editor: 'mriroutes-editor',
  viewer: 'mriroutes-viewer',
  nonmember: 'mriroutes-nonmember',
  mriowner: 'mriroutes-mriowner'
};

/* express-session's signed cookie, with NeuroWebLab's secret (as in session.test.js) */
const SESSION_SECRET = process.env.SESSION_SECRET || 'a mi no me gusta la sémola';
const sid = (username) => `brainbox-test-mri-routes-${username}`;
const cookie = (username) => {
  const id = sid(username);
  const mac = crypto.createHmac('sha256', SESSION_SECRET).update(id)
    .digest('base64')
    .replace(/[=]+$/, '');

  return `connect.sid=${encodeURIComponent(`s:${id}.${mac}`)}`;
};
const token = (username) => U.testToken + username;

const collaborator = (username, annotations, files) => ({
  userID: username,
  nickname: username,
  username,
  name: username,
  access: { collaborators: 'view', annotations, files }
});

const project = {
  name: 'MRI routes access test',
  shortname,
  owner: 'foo',
  collaborators: {
    list: [
      { userID: 'anyone', nickname: 'anyone', username: 'anyone', name: 'Any User', access: { collaborators: 'none', annotations: 'none', files: 'view' } },
      collaborator(users.viewer, 'view', 'view'),
      collaborator(users.editor, 'edit', 'edit')
    ]
  },
  files: { list: [U.localBertURL] },
  annotations: { list: [{ type: 'volume', name: 'Hidden layer', values: 'foreground.json' }] }
};

/**
 * Create the project, the sessions and the tokens
 * @returns {Promise<void>} Once they are stored
 */
const setUp = async () => {
  const db = U.getNativeDB();
  await db.collection('project').deleteMany({ shortname });
  await db.collection('project').insertOne({ ...project, created: new Date().toJSON() });
  for (const username of Object.values(users)) {
    /* eslint-disable no-await-in-loop */
    await db.collection('sessions').deleteMany({ _id: sid(username) });
    await db.collection('sessions').insertOne({
      _id: sid(username),
      expires: new Date(Date.now() + 24 * 3600 * 1000),
      session: JSON.stringify({
        cookie: { originalMaxAge: null, expires: null, httpOnly: true, path: '/' },
        passport: { user: { username, nickname: username } }
      })
    });
    await U.insertTestTokenForUser(username);
    /* eslint-enable no-await-in-loop */
  }
};

/**
 * Remove what setUp created
 * @returns {Promise<void>} Once they are removed
 */
const tearDown = async () => {
  const db = U.getNativeDB();
  await db.collection('project').deleteMany({ shortname });
  for (const username of Object.values(users)) {
    /* eslint-disable no-await-in-loop */
    await db.collection('sessions').deleteMany({ _id: sid(username) });
    await U.removeTestTokenForUser(username);
    /* eslint-enable no-await-in-loop */
  }
};

/**
 * The stored MRI document
 * @param {string} [source] The MRI's source (default: the test brain)
 * @returns {Promise<object>} The document
 */
const storedMRI = (source = U.localBertURL) => U.getNativeDB().collection('mri')
  .findOne({ source, backup: { $exists: false } }, { projection: { _id: 0 } });

module.exports = { shortname, users, cookie, token, setUp, tearDown, storedMRI };
