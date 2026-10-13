'use strict';

/**
 * The only fields of a user document that may leave the server (T004).
 * An allow-list, not a deny-list: a field added to the `user` collection later
 * (like `passhash`, `email` or `strategy` for local login) stays private until
 * it is listed here.
 *
 * - nickname, name, avatarURL, joined: shown by nwl-components' UserPage
 *   (`usernameField` is `nickname` in BrainBox)
 * - url: public profile link, part of the GET /user/json/:userName response
 *   (asserted by test/integration/user.controller.test.js)
 *
 * Not `brainboxURL`: NeuroWebLab < 0.2.0 wrote it on GitHub users ('/user/<nickname>'),
 * 0.2.0 no longer does, and no page or client code reads it.
 */
const PUBLIC_USER_FIELDS = Object.freeze(['nickname', 'name', 'avatarURL', 'url', 'joined']);

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
 * nwl-components header) plus the public fields. Since NeuroWebLab 0.2.0 the
 * session user is already reduced to `{username, nickname, name, avatarURL,
 * url, joined}`; the allow-list stays, so that no other field can reach a page.
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
