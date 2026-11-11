/**
 * NeuroWebLab's shared project-management suite, slices 1 (access matrix) and
 * 2 (create, save, delete, validation, versions), against the server
 * test/runner.js started (test/integration/*.js runs it with the rest)
 * (neuroweblab/conformance/README.md).
 */
const { accessMatrix, projectLifecycle } = require('neuroweblab/conformance');
const U = require('../utils.js');

const db = () => U.getNativeDB();

const adapter = {
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
  versions: (shortname) => db().collection('project')
    .find({ shortname }, { sort: { _id: 1 } })
    .toArray(),
  // a volume annotation: an atlas of the project in the MRI document of the file; read by GET /mri/json
  annotations: {
    add: (owner, shortname, file) => db().collection('mri')
      .updateOne({ source: file.source, backup: { $exists: false } }, {
        $push: {
          'mri.atlas': {
            project: shortname,
            name: 'Layer',
            type: 'volume',
            filename: 'conformance.nii.gz',
            labels: 'foreground.json',
            owner: owner.username,
            access: 'edit'
          }
        }
      }),
    readable: async (user, shortname, file) => {
      const res = await user.client.get(`/mri/json?url=${encodeURIComponent(file.source)}`);
      const body = res.status === 200 ? JSON.parse(res.text) : {};

      return ((body.mri && body.mri.atlas) || []).some((a) => a.project === shortname);
    }
  },
  // the approved slice 2 rules BrainBox does not follow yet (coordination tasks/proposed-shared-pm-tests.md,
  // "Slice 2: rules for the differing rows", 2026-11-11): its fixes to come
  expectedDifferences: {
    '2.4': 'approved 2.4: rows changed in place without edit on that list are stored (lengths only)',
    '2.9': 'approved 2.9: every row must exist on every save (a removed user blocks it)',
    '2.10': 'approved 2.10: layer names not checked; other layer types accepted next to a volume',
    '2.12': 'approved 2.12: DOMPurify on the JSON string (markup breaks it: 500; "&" becomes "&amp;")',
    '2.14': 'approved 2.14: every row validated, blank new rows refused',
    '2.17': 'approved 2.17: the body is stored as the new version, stored fields not sent are lost'
  }
};

accessMatrix(adapter);
projectLifecycle(adapter);
