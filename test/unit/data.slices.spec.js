const { assert } = require('chai');
const dataSlices = require('../../controller/dataSlices/dataSlices');
require('mocha-sinon');
const U = require('../utils.js');

describe('Data Slices ', function() {
  let nativeDb;

  before(function() {
    nativeDb=U.getNativeDB();
  });

  describe('getUserFilesSlice function() ', function() {
    it('should return the correct files with valid input', async function() {
      const req = {
        user: {
          username: 'foo'
        },
        isAuthenticated: function () {
          // eslint-disable-next-line no-unneeded-ternary
          return this.user.username ? true : false;
        },
        nativeDb: nativeDb
      };
      const requestedUser = 'foo';
      const files = await dataSlices.getUserFilesSlice(req, requestedUser, 1, 2);
      assert.strictEqual(files.success, true);
    });
  });

  describe('getUserAtlasSlice function() ', function() {

    /* does not really test the function since like it is currently configured
    the user does not have any atlas */
    it('should return the correct atlas slice with valid input', async function() {
      const req = {
        user: {
          username: 'foo'
        },
        isAuthenticated: function () {
          // eslint-disable-next-line no-unneeded-ternary
          return this.user.username ? true : false;
        },
        nativeDb: nativeDb
      };
      const requestedUser = 'foo';
      const files = await dataSlices.getUserAtlasSlice(req, requestedUser, 0, 10);
      assert.strictEqual(files.success, true);
    });
  });

  // the query, the view right and the slicing of a user's projects are NeuroWebLab's
  // userProjectsRoute (1.22.0, T002 M15), covered by its route spec and the shared suite (3.3-3.5,
  // 3.16-3.18); the row is the app's
  describe('userProjectRow function() ', function() {
    const row = {
      shortname: 'rowtest',
      name: 'Row test',
      brainboxURL: '/project/rowtest',
      owner: 'foo',
      modified: '2026-01-01T00:00:00.000Z',
      collaborators: { list: [{ userID: 'anyone', access: { collaborators: 'view', annotations: 'view', files: 'view' } }] },
      files: { list: ['a', 'b'] }
    };

    it('answers the row of a project', function() {
      assert.deepStrictEqual(dataSlices.userProjectRow(row, 'anonymous'), {
        project: 'rowtest',
        projectName: 'Row test',
        projectURL: '/project/rowtest',
        numFiles: 2,
        numCollaborators: 1,
        owner: 'foo',
        modified: '2026-01-01T00:00:00.000Z'
      });
    });

    it('counts 0 files for a project without a files list', function() {
      const noFiles = { ...row };
      delete noFiles.files;
      assert.strictEqual(dataSlices.userProjectRow(noFiles, 'anonymous').numFiles, 0);
      assert.strictEqual(dataSlices.userProjectRow({ ...row, files: {} }, 'anonymous').numFiles, 0);
    });
  });

  // the 404, the view right, the slicing and the paging are NeuroWebLab's projectFilesRoute and
  // projectListRoute (1.17.0, T002 M10), covered by its route specs and the shared suite (3.11-3.15)
  describe('projectFileEntries function() ', function() {
    describe('with files that are in the mri collection, and files that are not', function () {
      const shortname = 'filesslicetest';
      const src = (i) => `https://example.org/filesslicetest/${i}.nii.gz`;
      const req = {
        user: { username: 'foo' },
        isAuthenticated: () => true,
        nativeDb: null
      };
      let project;
      const mri = (i, name, backup) => ({
        source: src(i),
        ...(typeof name === 'undefined' ? {} : { name }),
        url: `/data/filesslicetest${i}/`,
        mri: { atlas: [{ name: 'Default', project: shortname, access: 'edit', type: 'volume', filename: 'Atlas.nii.gz', labels: 'foreground.json' }] },
        ...(backup ? { backup: true } : {})
      });

      before(async function () {
        req.nativeDb = nativeDb;
        // src(1) is listed twice
        project = { ...U.projectTest, shortname, files: { list: [src(0), src(1), src(2), src(3), src(1)] } };
        await nativeDb.collection('mri').insertMany([mri(1, 'old one', true), mri(1, 'one'), mri(3, 'three'), mri(4)]);
      });

      after(async function () {
        await nativeDb.collection('mri').deleteMany({ source: { $in: [0, 1, 2, 3, 4].map(src) } });
      });

      it('gives the source and name of each file, in the order of the slice', async function () {
        const result = await dataSlices.projectFileEntries(req, project, project.files.list, { names: true });
        assert.deepEqual(result, [
          { source: src(0), name: '' },
          { source: src(1), name: 'one' },
          { source: src(2), name: '' },
          { source: src(3), name: 'three' },
          { source: src(1), name: 'one' }
        ]);
      });

      it('gives a string name for an mri document without one (shared suite 3.13)', async function () {
        const result = await dataSlices.projectFileEntries(req, project, [src(4)], { names: true });
        assert.deepEqual(result, [{ source: src(4), name: '' }]);
      });

      it('gives [] for an empty slice', async function () {
        assert.deepEqual(await dataSlices.projectFileEntries(req, project, [], { names: true }), []);
      });

      it('gives the whole entry of the files in the mri collection without the names flag', async function () {
        const result = await dataSlices.projectFileEntries(req, project, project.files.list.slice(0, 4));
        assert.deepEqual(result[0], { source: src(0), name: '' });
        assert.notProperty(result[1], '_id');
        assert.notProperty(result[1], 'backup');
        assert.strictEqual(result[1].name, 'one');
        assert.strictEqual(result[3].url, '/data/filesslicetest3/');
        assert.strictEqual(result[3].mri.atlas[0].access, 'remove', 'the access the project gives the user');
      });
    });
  });

  describe('getFilesSlice function() ', function() {
    it('should return the correct files slice with valid input', async function() {
      const req = {
        user: {
          username: 'anyone'
        },
        isAuthenticated: function () {
          // eslint-disable-next-line no-unneeded-ternary
          return this.user.username ? true : false;
        },
        nativeDb: nativeDb
      };
      const files = await dataSlices.getFilesSlice(req, 0, 4);
      assert.notEqual(files, null);
    });
  });

  describe('projectRow function() ', function() {
    const anyone = { userID: 'anyone', access: { collaborators: 'none', annotations: 'none', files: 'view' } };
    const row = { userID: 'foo', access: { collaborators: 'view', annotations: 'view', files: 'view' } };
    const project = {
      shortname: 'slicecountproject',
      name: 'A project',
      owner: 'foo',
      collaborators: { list: [anyone, row] },
      files: { list: ['a', 'b', 'c'] }
    };
    const asUser = (username) => dataSlices.projectRow({ user: { username }, isAuthenticated: () => Boolean(username) }, project);

    it('gives the project, its name, its number of files and its owner', function () {
      const { numCollaborators, ...rest } = asUser('foo');
      assert.deepEqual(rest, { project: 'slicecountproject', projectName: 'A project', numFiles: 3, owner: 'foo' });
      assert.isNumber(numCollaborators);
    });

    it('counts only the collaborator rows the user may see (as the project JSON route; 3.5)', function () {
      assert.strictEqual(asUser('').numCollaborators, 1);
      assert.strictEqual(asUser('foo').numCollaborators, 2);
    });
  });
});
