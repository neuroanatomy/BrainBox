/**
 * NeuroWebLab's shared project-management suite, slice 1 (access matrix),
 * against the server test/runner.js started (test/integration/*.js runs it with the rest) (neuroweblab/conformance/README.md).
 */
const { accessMatrix } = require('neuroweblab/conformance');
const U = require('../utils.js');

const db = () => U.getNativeDB();

accessMatrix({
  baseURL: U.serverURL,
  layer: { type: 'volume', values: 'foreground.json' },
  // a project without an `anyone` row can't be saved over HTTP (validation)
  insertProject: (doc) => db().collection('project')
    .insertOne({ ...doc, files: { list: doc.files.list.map((f) => f.source) } }),
  // every version, and the MRI documents its files created (projectDocument's sources)
  removeProject: async (owner, shortname) => {
    await db().collection('project')
      .deleteMany({ shortname });
    await db().collection('mri')
      .deleteMany({ source: { $regex: `^https://example\\.org/conformance/${shortname}/` } });
  },
  removeUser: async (username) => {
    await db().collection('user')
      .deleteMany({ nickname: username });
    await db().collection('log')
      .deleteMany({ username });
  },
  expectedDifferences: {}
});
