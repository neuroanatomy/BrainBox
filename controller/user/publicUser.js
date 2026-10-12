'use strict';

/**
 * The only fields of a user document that may leave the server (T004).
 * An allow-list, not a deny-list: a field added to the `user` collection later
 * (like `passhash`, `email` or `strategy` for local login) stays private until
 * it is listed here.
 *
 * - nickname, name, avatarURL, joined: shown by nwl-components' UserPage
 *   (`usernameField` is `nickname` in BrainBox)
 * - url, brainboxURL: public profile links, part of the GET /user/json/:userName
 *   response (asserted by test/integration/user.controller.test.js)
 */
const PUBLIC_USER_FIELDS = Object.freeze(['nickname', 'name', 'avatarURL', 'url', 'brainboxURL', 'joined']);

/**
 * @param {Object} doc A user document, or a session user
 * @returns {Object} A new object with only the public fields that `doc` has
 */
const publicUser = function (doc) {
  const result = {};
  if (doc === null || typeof doc !== 'object') {
    return result;
  }
  for (const field of PUBLIC_USER_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(doc, field)) {
      result[field] = doc[field];
    }
  }

  return result;
};

/**
 * The logged user as the pages may see it: `username` (read by the
 * nwl-components header) plus the public fields. NeuroWebLab stores the whole
 * user document in the session (with `passhash` for a local user).
 *
 * @param {Object} reqUser `req.user`
 * @returns {Object|null} null when nobody is logged in
 */
const publicLoggedUser = function (reqUser) {
  if (!reqUser) {
    return null;
  }

  return { ...publicUser(reqUser), username: reqUser.username };
};

module.exports = { PUBLIC_USER_FIELDS, publicUser, publicLoggedUser };
