const fs = require('fs');
const path = require('path');

/**
 * Read the list of admin usernames from cfg.json (field "admins").
 * @returns {Array<string>} The admin usernames, empty if none is configured
 */
const readAdminsFromConfig = () => {
  try {
    // eslint-disable-next-line no-sync
    const cfg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../cfg.json')));

    return Array.isArray(cfg.admins) ? cfg.admins.filter((name) => typeof name === 'string' && name !== '') : [];
  } catch (err) {
    console.log('WARNING: cannot read the admins list from cfg.json', err.message);

    return [];
  }
};

let admins = readAdminsFromConfig();

const getAdmins = () => [...admins];

/**
 * Replace the list of admins (used by the tests)
 * @param {Array<string>} list Admin usernames
 * @returns {void}
 */
const setAdmins = (list) => {
  admins = [...list];
};

const isAdmin = (username) => typeof username === 'string' && admins.includes(username);

/**
 * Username of the user making the request, logged in through
 * a session (GitHub, local sign in) or through a token
 * @param {object} req Request object
 * @returns {string|null} The username, null if nobody is logged in
 */
const requestUsername = (req) => {
  if (req.user && typeof req.user.username === 'string') {
    return req.user.username;
  }

  return null;
};

module.exports = {
  getAdmins,
  setAdmins,
  isAdmin,
  requestUsername
};
