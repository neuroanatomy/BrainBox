/**
 * The lock that serialises the changes to projects (saving a project's
 * settings, deleting a project, the admin tools that fix projects), so that
 * two of them cannot both read the current version and then both replace it.
 * It only covers this process.
 *
 * The lock lives in NeuroWebLab 1.18.0, `project/lock.js` (T002 M11c): this is
 * its `withLock`, as `acquire`. The four holders take `['project', 'mri']`:
 * project.controller.js's save and delete, through NeuroWebLab 1.21.0's
 * projectSaveRoute and projectDeleteRoute (`lockKeys`, T002 M14c), and
 * admin.projects.js's restoreFiles and fixCurrentVersions, through NeuroWebLab
 * 1.23.0's damagedProjects (`lockKeys`, T002 M16c).
 *
 * Its state is shared by everything that requires the same copy of
 * `neuroweblab`: there must be one copy (`npm ls neuroweblab` shows one).
 *
 * The four other `new AsyncLock()` instances (admin.annotations.js,
 * atlasmakerServer.js, mri.controller.js, upload.controller.js) don't share
 * this lock yet (decision D3).
 */
const { withLock } = require('neuroweblab');

module.exports = { acquire: withLock };
