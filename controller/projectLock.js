/**
 * The lock that serialises the changes to projects (saving a project's
 * settings, deleting a project, the admin tools that fix projects), so that
 * two of them cannot both read the current version and then both replace it.
 * It only covers this process.
 */
const AsyncLock = require('async-lock');

module.exports = new AsyncLock();
