const { assert } = require('chai');
const dataSlices = require('../../controller/dataSlices/dataSlices');
require('mocha-sinon');
const U = require('../utils.js');

describe('Data Slices ', function() {
  let db;
  before(function() {
    db=U.getDB();
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
        db: db
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
        db: db
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
        db: db
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
        db: db
      };
      const requestedUser = 'general';
      const files = await dataSlices.getUserProjectsSlice(req, requestedUser, 0, 4);
      assert.strictEqual(files.success, false);
      assert.strictEqual(files.list.length, 0);
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
        db: db
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
        db: db
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
        db: db
      };
      const files = await dataSlices.getProjectsSlice(req, 0, 0);
      assert.strictEqual(files.length, 0);
    });
  });
});
