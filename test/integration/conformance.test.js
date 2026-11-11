/**
 * NeuroWebLab's shared project-management suite, slices 1 (access matrix),
 * 2 (create, save, delete, validation, versions) and 3 (listings and search), against the server
 * test/runner.js started (test/integration/*.js runs it with the rest)
 * (neuroweblab/conformance/README.md).
 */
const { accessMatrix, projectLifecycle, projectListings } = require('neuroweblab/conformance');
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
  // slice 3 (3.7): a name and an email for a user
  setUserFields: (username, fields) => db().collection('user')
    .updateOne({ nickname: username }, { $set: fields }),
  // no project search since the hotfix (approved 3.6): projectNameQuery answers taken / free only
  routes: { searchProjects: null },
  // the approved slice 2 rules BrainBox does not follow yet (coordination tasks/proposed-shared-pm-tests.md,
  // "Slice 2: rules for the differing rows", 2026-11-11): none since slice 2 part C
  expectedDifferences: {
    'route:searchProjects': 'approved 3.6: no project search (similarProjectNamesQuery removed; projectNameQuery answers taken / free over the WebSocket)',
    // the approved slice 3 rules BrainBox does not follow yet ("Slice 3: rules for the differing rows", 2026-11-11)
    '3.2': 'approved 3.2: ?page pages the unfiltered projects in the query and again after filtering (short or empty pages)',
    '3.3': 'approved 3.3: a user\'s projects match collaborator rows by userID only (a row with username only is missed)',
    '3.4': 'approved 3.4: start/length required (403 without them); skip/limit before the access filter',
    '3.5': 'approved 3.5: numCollaborators counts every row, hidden collaborators included'
  }
};

accessMatrix(adapter);
projectLifecycle(adapter);
projectListings(adapter);
