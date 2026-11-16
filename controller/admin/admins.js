const path = require('path');
const { createAdmins } = require('neuroweblab');

// The admins list, read once from the "admins" field of cfg.json (NeuroWebLab
// createAdmins, shared with microdraw; without a logger a bad cfg.json gives
// console.log('WARNING: cannot read the admins list from cfg.json', message)).
// Exports getAdmins, setAdmins (used by the tests), isAdmin, requestUsername,
// requireAdmin and adminPage, all reading the same list.
module.exports = createAdmins({ cfgPath: path.resolve(__dirname, '../../cfg.json') });
