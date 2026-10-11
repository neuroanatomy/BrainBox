const { assert } = require('chai');
const dataSlices = require('../../controller/dataSlices/dataSlices');
require('mocha-sinon');
const U = require('../utils.js');

describe('Data Slices ', function() {
  let db, nativeDb;

  before(function() {
    db=U.getDB();
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
        db: db,
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
        db: db,
        nativeDb: nativeDb
      };
      const requestedUser = 'foo';
      const files = await dataSlices.getUserAtlasSlice(req, requestedUser, 0, 10);
      assert.strictEqual(files.success, true);
    });
  });

  describe('getUserProjectsSlice function() ', function() {
    it('should return the correct project files with valid input', async function() {
      const req = {
        user: {
          username: 'foo'
        },
        isAuthenticated: function () {
          // eslint-disable-next-line no-unneeded-ternary
          return this.user.username ? true : false;
        },
        db: db,
        nativeDb: nativeDb
      };
      const requestedUser = 'foo';
      const files = await dataSlices.getUserProjectsSlice(req, requestedUser, 0, 4);
      assert.strictEqual(files.success, true);
      assert.notStrictEqual(files.list.length, 0);
      assert.containsAllKeys(files.list[0], ['project', 'owner']);
    });

    it('should not return files with invalid input', async function() {
      const req = {
        user: {
          username: 'foo'
        },
        isAuthenticated: function () {
          // eslint-disable-next-line no-unneeded-ternary
          return this.user.username ? true : false;
        },
        db: db,
        nativeDb: nativeDb
      };
      const requestedUser = 'general';
      const files = await dataSlices.getUserProjectsSlice(req, requestedUser, 0, 4);
      assert.strictEqual(files.success, false);
      assert.strictEqual(files.list.length, 0);
    });
  });

  describe('getProjectFilesSlice function() ', function() {
    it('should return files for an existing project', async function() {
      const req = {
        user: {
          username: 'foo'
        },
        isAuthenticated: function () {
          // eslint-disable-next-line no-unneeded-ternary
          return this.user.username ? true : false;
        },
        db: db,
        nativeDb: nativeDb
      };
      const result = await dataSlices.getProjectFilesSlice(req, 'testproject', 0, 2);
      assert.isArray(result);
    });

    it('should return undefined for a non-existent project', async function() {
      const req = {
        user: {
          username: 'foo'
        },
        isAuthenticated: function () {
          // eslint-disable-next-line no-unneeded-ternary
          return this.user.username ? true : false;
        },
        db: db,
        nativeDb: nativeDb
      };
      const result = await dataSlices.getProjectFilesSlice(req, 'nonexistentproject', 0, 2);
      assert.isUndefined(result);
    });

    describe('with files that are in the mri collection, and files that are not', function () {
      const shortname = 'filesslicetest';
      const src = (i) => `https://example.org/filesslicetest/${i}.nii.gz`;
      const req = {
        user: { username: 'foo' },
        isAuthenticated: () => true,
        nativeDb: null
      };
      const mri = (i, name, backup) => ({
        source: src(i),
        name,
        url: `/data/filesslicetest${i}/`,
        mri: { atlas: [{ name: 'Default', project: shortname, access: 'edit', type: 'volume', filename: 'Atlas.nii.gz', labels: 'foreground.json' }] },
        ...(backup ? { backup: true } : {})
      });

      before(async function () {
        req.nativeDb = nativeDb;
        await nativeDb.collection('project').insertOne({
          ...U.projectTest,
          shortname,
          // src(1) is listed twice
          files: { list: [src(0), src(1), src(2), src(3), src(1)] }
        });
        await nativeDb.collection('mri').insertMany([mri(1, 'old one', true), mri(1, 'one'), mri(3, 'three')]);
      });

      after(async function () {
        await nativeDb.collection('project').deleteMany({ shortname });
        await nativeDb.collection('mri').deleteMany({ source: { $in: [0, 1, 2, 3].map(src) } });
      });

      it('gives the source and name of each file, in the order of the list', async function () {
        const result = await dataSlices.getProjectFilesSlice(req, shortname, 0, 10, true);
        assert.deepEqual(result, [
          { source: src(0), name: '' },
          { source: src(1), name: 'one' },
          { source: src(2), name: '' },
          { source: src(3), name: 'three' },
          { source: src(1), name: 'one' }
        ]);
      });

      it('gives the requested slice', async function () {
        const result = await dataSlices.getProjectFilesSlice(req, shortname, 1, 2, true);
        assert.deepEqual(result, [{ source: src(1), name: 'one' }, { source: src(2), name: '' }]);
        assert.deepEqual(await dataSlices.getProjectFilesSlice(req, shortname, 10, 2, true), []);
      });

      it('gives the whole entry of the files in the mri collection without the names flag', async function () {
        const result = await dataSlices.getProjectFilesSlice(req, shortname, 0, 4);
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
        db: db,
        nativeDb: nativeDb
      };
      const files = await dataSlices.getFilesSlice(req, 0, 4);
      assert.notEqual(files, null);
    });
  });

  describe('getProjectsSlice function() ', function() {
    it('should return the correct projects slice with valid input', async function() {
      const req = {
        user: {
          username: 'anyone'
        },
        isAuthenticated: function () {
          // eslint-disable-next-line no-unneeded-ternary
          return this.user.username ? true : false;
        },
        db: db,
        nativeDb: nativeDb
      };
      const files = await dataSlices.getProjectsSlice(req, 0, 10);
      assert.notStrictEqual(files.length, 0);
    });

    it('should return the number of files based on length', async function() {
      const req = {
        user: {
          username: 'general'
        },
        isAuthenticated: function () {
          // eslint-disable-next-line no-unneeded-ternary
          return this.user.username ? true : false;
        },
        db: db,
        nativeDb: nativeDb
      };
      const files = await dataSlices.getProjectsSlice(req, 0, 0);
      assert.strictEqual(files.length, 0);
    });
  });
});
