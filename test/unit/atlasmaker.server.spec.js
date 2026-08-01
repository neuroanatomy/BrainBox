/* eslint-disable max-lines */

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws').Server;
const assert = require('assert');
// const tracer = require('tracer').console({ format: '[{{file}}:{{line}}]  {{message}}' });
const la = require('../../controller/atlasmakerServer/atlasmaker-linalg.js');
const amri = require('../../controller/atlasmakerServer/atlasmaker-mri.js');
const atlasmakerServer = require('../../controller/atlasmakerServer/atlasmakerServer.js');
const EmbedAccessService = require('../../services/EmbedAccessService.js');
const datadir = './test/data/';
const U = require('../utils.js');
const { expect } = require('chai');
const sinon = require('sinon');
require('mocha-sinon');

let AMS;

/**
 * Create a mock WebSocket object with sinon spies.
 * @param {object} [opts] - optional overrides
 * @param {number} [opts.readyState] - WebSocket readyState (default OPEN = 1)
 * @returns {object} mock socket
 */
const mockSocket = (opts) => {
  const o = opts || {};

  return {
    send: sinon.spy(),
    close: sinon.spy(),
    readyState: typeof o.readyState !== 'undefined' ? o.readyState : 1, // WebSocket.OPEN
    on: sinon.spy(),
    terminate: sinon.spy()
  };
};

/**
 * Register a mock socket as a connected user inside AMS.US
 * and return the user-socket entry.
 * @param {object} ws A websocket
 * @param {object} userProps User properties
 * @return {object} Test user
 */
const addMockUser = (ws, userProps) => {
  AMS.uidcounter += 1;
  const entry = { uid: 'u' + AMS.uidcounter, socket: ws };
  if (userProps) {
    entry.User = userProps;
  }
  AMS.US.push(entry);

  return entry;
};

// eslint-disable-next-line max-statements
describe('UNIT TESTING ATLASMAKER SERVER', function() {
  before(function () {
    AMS = atlasmakerServer(U.getDB(), U.getNativeDB());
  });

  describe('MRI IO', function () {
    let mri1, mri2;

    it('Should load a nii.gz file', async function () {
      mri1 = await amri.readNifti(datadir + 'bert_brain.nii.gz');
    }).timeout(U.mediumTimeout);

    it('Should get the dimensions right', function () {
      assert(mri1.dim[0] === 256 && mri1.dim[1] === 256 && mri1.dim[2] === 256);
    });

    it('Should load a mgz file', async function () {
      mri2 = await amri.readMGZ(datadir + 'bert_brain.mgz');
    }).timeout(U.mediumTimeout);

    it('Should get the dimensions right, still', function () {
      assert(mri2.dim[0] === 256 && mri2.dim[1] === 256 && mri2.dim[2] === 256);
    });

    it('Should recognize nii.gz from a filename', function () {
      const ext = amri.filetypeFromFilename('/path/to/mri.nii.gz');
      assert.strictEqual(ext, 'nii.gz');
    });

    it('Should recognize mgz from a filename', function () {
      const ext = amri.filetypeFromFilename('/path/to/mri.mgz');
      assert.strictEqual(ext, 'mgz');
    });

    it('Should return undefined if filename is not nii.gz nor mgz', function () {
      const ext = amri.filetypeFromFilename('/path/to/mri.foo');
      assert(typeof ext === 'undefined');
    });

    it('Subtract vectors correctly', function () {
      const res = la.subVecVec([1, 2, 3], [2, 3, 4]);
      assert(res[0] === -1 && res[1] === -1 && res[2] === -1);
    });

    it('Add vectors correctly', function () {
      const res = la.addVecVec([1, 2, 3], [4, 5, 6]);
      assert(res[0] === 5 && res[1] === 7 && res[2] === 9);
    });

    it('Multiply matrix by vector correctly with identity matrix', function () {
      const identity = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const vec = [3, 7, 11];
      const res = la.mulMatVec(identity, vec);
      assert(res[0] === 3 && res[1] === 7 && res[2] === 11);
    });

    it('Multiply matrix by vector correctly with known matrix', function () {
      const mat = [[2, 0, 0], [0, 3, 0], [0, 0, 4]];
      const vec = [1, 2, 3];
      const res = la.mulMatVec(mat, vec);
      assert(res[0] === 2 && res[1] === 6 && res[2] === 12);
    });

    it('Invert identity matrix correctly', function () {
      const identity = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const res = la.invMat(identity);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const expected = i === j ? 1 : 0;
          assert(Math.abs(res[i][j] - expected) < 1e-10);
        }
      }
    });

    it('Invert matrix round-trip: invMat(M) * M = identity', function () {
      const mat = [[1, 2, 3], [0, 1, 4], [5, 6, 0]];
      const inv = la.invMat(mat);
      // multiply inv * mat and check it equals identity
      for (let i = 0; i < 3; i++) {
        const row = la.mulMatVec(inv, [mat[0][i], mat[1][i], mat[2][i]]);
        for (let j = 0; j < 3; j++) {
          const expected = i === j ? 1 : 0;
          assert(Math.abs(row[j] - expected) < 1e-10);
        }
      }
    });
  });

  // Function to test loadMRI function on different inputs
  describe('loadMRI function ', function () {
    it('should load the contents of .nii.gz file when a valid path is passed', async function () {
      const mriPath = datadir + 'bert_brain.nii.gz';
      // eslint-disable-next-line max-statements
      const res = await amri.loadMRI(mriPath);
      expect(res).to.have.keys([
        'dim', 'pixdim', 'vox_offset', 'dir', 'ori', 's2v', 'v2w', 'wori',
        'hdr', 'hdrSz', 'datatype', 'data', 'sum', 'min', 'max'
      ]);
    });

    it('should load the contents of .mgz file when a valid path is passed', async function () {
      const mriPath = datadir + '001.mgz';
      const res = await amri.loadMRI(mriPath);
      expect(res).to.have.keys([
        'dim', 'pixdim', 'dir', 'ori', 's2v', 'v2w', 'wori',
        'hdr', 'hdrSz', 'ftr', 'data', 'sum', 'min', 'max'
      ]);
    }).timeout(U.mediumTimeout);

    it('should throw an error when a path to invalid file is passed', async function () {
      await amri.loadMRI('').catch((err) => {
        assert.strictEqual(err.message, 'ERROR: nothing we can read');
      });
    });
  });

  describe('Painting', function () {
    it('Convert screen coordinates to volume index', function () {
      const s = [10, 20, 30];
      const mri = {
        s2v: { X: 99, dx: -1, x: 0, Y: 0, dy: 1, y: 2, Z: 299, dz: -1, z: 1 },
        dim: [100, 200, 300]
      };
      const i = AMS._screen2index(s, mri);
      assert.strictEqual(i, 5583089);
    });
  });

  describe('Database', function () {
    it('Find user name given their nickname', async function () {
      const data = { type: 'userNameQuery', metadata: { nickname: U.userFoo.nickname } };
      const result = await AMS.queryUserName(data);
      assert.strictEqual(result[0].name, U.userFoo.name);
    });

    it('Find user nickname given their name', async function () {
      const data = { type: 'userNameQuery', metadata: { name: U.userFoo.name } };
      const result = await AMS.queryUserName(data);
      assert.strictEqual(result[0].nickname, U.userFoo.nickname);
    });

    it('Find project', async function () {
      const data = { type: 'projectNameQuery', metadata: { name: U.projectTest.shortname } };
      const result = await AMS.queryProjectName(data);
      assert.strictEqual(result.name, U.projectTest.name);
    });

    it('Find similar project names', async function () {
      const data = {
        type: 'similarProjectNamesQuery',
        metadata: { projectName: U.projectTest.shortname.slice(0, 3) }
      };
      const result = await AMS.querySimilarProjectNames(data);
      assert.ok(result.filter((e) => e.name === U.projectTest.name).length);
    });
  });

  describe('Volume slice server', function () {
    let mri;

    it('Should load a nii.gz file', async function () {
      mri = await amri.readNifti(datadir + 'bert_brain.nii.gz');
    });

    it('Serve one slice', async function () {
      const view = 'cor';
      const slice = 50;
      const jpg = await AMS.drawSlice(mri, view, slice);
      const newPath = './test/images/slice-bert-cor-50.jpg';
      const refPath = './test/data/reference-images/slice-bert-cor-50.jpg';
      await fs.promises.mkdir(path.dirname(newPath), { recursive: true });
      await fs.promises.writeFile(newPath, jpg.data);
      const diff = await U.compareImages(newPath, refPath);
      assert(diff < 10);
    });
  });

  // eslint-disable-next-line max-statements
  describe('Utility Functions: ', function () {
    describe('numberOfUsersConnectedToMRI function() ', function () {

      it('should return 0 if the mri path is invalid or undefined', async function () {
        const users = await AMS.numberOfUsersConnectedToMRI('');
        assert.strictEqual(users, 0);
      });

      it('should return correct value if the mri path is valid and not being used', async function () {
        const ws = new WebSocket({ port: 8081 });
        await AMS._connectNewUser({ ws: ws });
        const mriPath = datadir + '001.mgz';
        await amri.loadMRI(mriPath);
        const users = await AMS.numberOfUsersConnectedToMRI(mriPath);
        await AMS._disconnectUser({ ws: ws });
        ws.close();
        assert.strictEqual(users, 0);
      }).timeout(U.longTimeout);
    });

    describe('displayUsers function() ', function () {

      it('should return 0 if there are no users', async function () {
        let cnt = 0;
        await AMS.displayUsers();
        for (let x = 0; x < AMS.US.length; x += 1) {
          if (AMS.US[x]) { cnt += 1; }
        }
        assert.strictEqual(cnt, 0);
      });

      it('should return the correct number of users if some users are connected', async function () {
        const ws = new WebSocket({ port: 8081 });
        await AMS._connectNewUser({ ws: ws });
        await AMS.displayUsers();
        let cnt = 0;
        for (let x = 0; x < AMS.US.length; x++) {
          if (AMS.US[x]) { cnt += 1; }
        }
        await AMS._disconnectUser({ ws: ws });
        ws.close();
        assert.strictEqual(cnt, 1);
      });
    });

    describe('displayBrains function() ', function () {

      it('should display no brains when no brains are loaded', async function () {
        await AMS.displayBrains();
        let cnt = 0;
        for (let x = 0; x < AMS.Brains.length; x++) {
          if (AMS.Brains[x]) { cnt += 1; }
        }
        assert.strictEqual(cnt, 0);
      });

      it('should display the brains when there are some brains loaded', async function () {
        const mriPath = '/test_data/bert_brain.nii.gz';
        await AMS.getBrainAtPath(mriPath);
        await AMS.displayBrains();
        let cnt = 0;
        for (let x = 0; x < AMS.Brains.length; x++) {
          if (AMS.Brains[x]) { cnt += 1; }
        }
        await AMS.unloadMRI(mriPath);
        assert.strictEqual(cnt, 1);
      }).timeout(U.mediumTimeout);
    });

    describe('getBrainAtPath function() ', function () {
      it('should throw an error when the mri path is invalid', async function () {
        await AMS.getBrainAtPath('').catch((err) => {
          assert.strictEqual(err.message, 'ERROR: nothing we can read');
        });
      });

      it('should load the brain if the path is valid', async function () {
        const mriPath = '/test_data/bert_brain.nii.gz';
        const res = await AMS.getBrainAtPath(mriPath);
        expect(res).to.have.keys([
          'dim', 'pixdim', 'vox_offset', 'dir', 'ori', 's2v', 'v2w', 'wori',
          'hdr', 'hdrSz', 'datatype', 'data', 'sum', 'min', 'max'
        ]);
      });
    });

    describe('_connectNewUser() function ', function () {
      it('should connect the user when the web socket is passed', async function () {
        const ws = new WebSocket({ port: 8081 });
        await AMS._connectNewUser({ ws: ws });
        let cnt = 0;
        for (let x = 0; x < AMS.US.length; x++) {
          if (AMS.US[x]) { cnt += 1; }
        }
        await AMS._disconnectUser({ ws: ws });
        ws.close();
        assert.strictEqual(cnt, 1);
      });
    });

    describe('removeUser() function ', function () {
      it('should remove the user with the provided websocket', async function () {
        const ws = new WebSocket({ port: 8081 });
        await AMS._connectNewUser({ ws: ws });
        await AMS.removeUser(ws);
        let cnt = 0;
        for (let x = 0; x < AMS.US.length; x++) {
          if (AMS.US[x]) { cnt += 1; }
        }
        ws.close();
        assert.strictEqual(cnt, 0);
      });
    });

    describe('getUserFromSocket() function', function () {
      it('should return the user object matching the socket', async function () {
        const ws = new WebSocket({ port: 8081 });
        await AMS._connectNewUser({ ws: ws });
        const user = AMS.getUserFromSocket(ws);
        assert.strictEqual(user.socket, ws);
        await AMS._disconnectUser({ ws: ws });
        ws.close();
      });

      it('should return -1 if no user matches the socket', function () {
        const fakeSocket = {};
        const result = AMS.getUserFromSocket(fakeSocket);
        assert.strictEqual(result, -1);
      });
    });

    describe('getUserFromUserId() function', function () {
      it('should return the user object matching the uid', async function () {
        const ws = new WebSocket({ port: 8081 });
        await AMS._connectNewUser({ ws: ws });
        const connected = AMS.US.filter((o) => typeof o !== 'undefined');
        const lastUser = connected[connected.length - 1];
        const result = AMS.getUserFromUserId(lastUser.uid);
        assert.strictEqual(result.uid, lastUser.uid);
        await AMS._disconnectUser({ ws: ws });
        ws.close();
      });

      it('should return null if no user matches the uid', function () {
        const result = AMS.getUserFromUserId('nonexistent');
        assert.strictEqual(result, null);
      });
    });

    describe('numberOfUsersConnectedToAtlas() function', function () {
      it('should return 0 for undefined arguments', function () {
        let undef;
        assert.strictEqual(AMS.numberOfUsersConnectedToAtlas(undef, 'file.nii.gz'), 0);
        assert.strictEqual(AMS.numberOfUsersConnectedToAtlas('dir', undef), 0);
      });

      it('should return 0 when no users are connected', function () {
        assert.strictEqual(AMS.numberOfUsersConnectedToAtlas('/some/dir/', 'atlas.nii.gz'), 0);
      });

      it('should count users connected to a specific atlas', async function () {
        const ws = new WebSocket({ port: 8081 });
        await AMS._connectNewUser({ ws: ws });
        const connected = AMS.US.filter((o) => typeof o !== 'undefined');
        const lastUser = connected[connected.length - 1];
        lastUser.User = { dirname: '/test/', atlasFilename: 'atlas.nii.gz' };
        const count = AMS.numberOfUsersConnectedToAtlas('/test/', 'atlas.nii.gz');
        assert.strictEqual(count, 1);
        await AMS.removeUser(ws);
        ws.close();
      });
    });

    describe('indexOfAtlasAtPath() function', function () {
      let undef;

      it('should return undefined if no atlas matches', function () {
        const result = AMS.indexOfAtlasAtPath('/no/such/', 'atlas.nii.gz');
        assert.strictEqual(result, undef);
      });

      it('should return the key of a matching atlas', function () {
        const key = 'test_atlas_1';
        AMS.Atlases[key] = { dirname: '/test/', filename: 'found.nii.gz' };
        const result = AMS.indexOfAtlasAtPath('/test/', 'found.nii.gz');
        assert.strictEqual(result, key);
        delete AMS.Atlases[key];
      });
    });

    describe('unloadMRI() function', function () {
      it('should remove a brain from the Brains array by path', function () {
        const fakeBrain = { path: '/test/fake.nii.gz', data: {} };
        AMS.Brains.push(fakeBrain);
        const lenBefore = AMS.Brains.length;
        AMS.unloadMRI('/test/fake.nii.gz');
        assert.strictEqual(AMS.Brains.length, lenBefore - 1);
      });

      it('should do nothing if the path does not match any brain', function () {
        const lenBefore = AMS.Brains.length;
        AMS.unloadMRI('/nonexistent/path.nii.gz');
        assert.strictEqual(AMS.Brains.length, lenBefore);
      });
    });

    describe('toggleWebsocketRecording() function', function () {
      it('should toggle recordWS flag on and off', function () {
        const initial = AMS.recordWS;
        AMS.toggleWebsocketRecording();
        assert.strictEqual(AMS.recordWS, !initial);
        AMS.toggleWebsocketRecording();
        assert.strictEqual(AMS.recordWS, initial);
      });
    });

    describe('_isUserFirstConnection() function', function () {
      it('should return true for undefined User', function () {
        let undef;
        assert.strictEqual(AMS._isUserFirstConnection(undef), true);
      });

      it('should return true if User.isMRILoaded is false', function () {
        assert.strictEqual(AMS._isUserFirstConnection({ isMRILoaded: false }), true);
      });

      it('should return false if User is defined and isMRILoaded is not false', function () {
        assert.strictEqual(AMS._isUserFirstConnection({ isMRILoaded: true }), false);
      });
    });

    describe('_findAtlas() function', function () {
      it('should return atlasLoadedFlag true if atlas is already loaded', function () {
        const key = 'test_find_1';
        AMS.Atlases[key] = { dirname: '/find/', filename: 'atlas.nii.gz' };
        const result = AMS._findAtlas({ dirname: '/find/', atlasFilename: 'atlas.nii.gz' });
        assert.strictEqual(result.atlasLoadedFlag, true);
        assert.strictEqual(result.iAtlas, key);
        delete AMS.Atlases[key];
      });

      it('should return atlasLoadedFlag false if atlas is not loaded', function () {
        const result = AMS._findAtlas({ dirname: '/new/', atlasFilename: 'new.nii.gz' });
        assert.strictEqual(result.atlasLoadedFlag, false);
        assert.ok(result.iAtlas);
      });
    });

    describe('_validateUserAtlas() function', function () {
      it('should return true for a valid atlas object', function () {
        const atlas = { name: 'test.nii.gz', dirname: '/dir/', source: 'http://example.com' };
        assert.strictEqual(AMS._validateUserAtlas(atlas), true);
      });

      it('should return false if name is missing', function () {
        assert.strictEqual(AMS._validateUserAtlas({ dirname: '/dir/', source: 'http://example.com' }), false);
      });

      it('should return false if dirname is missing', function () {
        assert.strictEqual(AMS._validateUserAtlas({ name: 'test.nii.gz', source: 'http://example.com' }), false);
      });

      it('should return false if source is missing', function () {
        assert.strictEqual(AMS._validateUserAtlas({ name: 'test.nii.gz', dirname: '/dir/' }), false);
      });
    });

    describe('_fitsBroadcastExclusionCriteria() function', function () {
      it('should exclude when source and target have the same uid', function () {
        const sourceUS = { uid: 'u1', User: {} };
        const targetUS = { uid: 'u1', User: {} };
        assert.strictEqual(AMS._fitsBroadcastExclusionCriteria({ sourceUS, targetUS }), true);
      });

      it('should exclude autocomplete clients', function () {
        const sourceUS = { uid: 'u1', autocompleteClient: true, User: {} };
        const targetUS = { uid: 'u2', User: {} };
        assert.strictEqual(AMS._fitsBroadcastExclusionCriteria({ sourceUS, targetUS }), true);
      });

      it('should exclude when source User is undefined', function () {
        const sourceUS = { uid: 'u1' };
        const targetUS = { uid: 'u2', User: {} };
        assert.strictEqual(AMS._fitsBroadcastExclusionCriteria({ sourceUS, targetUS }), true);
      });

      it('should exclude when target User is undefined', function () {
        const sourceUS = { uid: 'u1', User: {} };
        const targetUS = { uid: 'u2' };
        assert.strictEqual(AMS._fitsBroadcastExclusionCriteria({ sourceUS, targetUS }), true);
      });

      it('should not exclude valid distinct users', function () {
        const sourceUS = { uid: 'u1', User: {} };
        const targetUS = { uid: 'u2', User: {} };
        assert.strictEqual(AMS._fitsBroadcastExclusionCriteria({ sourceUS, targetUS }), false);
      });
    });

    describe('_fitsBroadcastInclusionCriteria() function', function () {
      it('should include users on the same project page', function () {
        const sourceUS = { User: { projectPage: '/project/test' } };
        const targetUS = { User: { projectPage: '/project/test' } };
        assert.strictEqual(AMS._fitsBroadcastInclusionCriteria({ sourceUS, targetUS, data: { type: 'paint' } }), true);
      });

      it('should include users annotating the same atlas', function () {
        const sourceUS = { User: { iAtlas: 'a1' } };
        const targetUS = { User: { iAtlas: 'a1' } };
        assert.strictEqual(AMS._fitsBroadcastInclusionCriteria({ sourceUS, targetUS, data: { type: 'paint' } }), true);
      });

      it('should include userData messages regardless of atlas', function () {
        const sourceUS = { User: { iAtlas: 'a1' } };
        const targetUS = { User: { iAtlas: 'a2' } };
        assert.strictEqual(AMS._fitsBroadcastInclusionCriteria({ sourceUS, targetUS, data: { type: 'userData' } }), true);
      });

      it('should include chat messages regardless of atlas', function () {
        const sourceUS = { User: { iAtlas: 'a1' } };
        const targetUS = { User: { iAtlas: 'a2' } };
        assert.strictEqual(AMS._fitsBroadcastInclusionCriteria({ sourceUS, targetUS, data: { type: 'chat' } }), true);
      });

      it('should not include users on different atlases for paint messages', function () {
        const sourceUS = { User: { iAtlas: 'a1' } };
        const targetUS = { User: { iAtlas: 'a2' } };
        assert.strictEqual(AMS._fitsBroadcastInclusionCriteria({ sourceUS, targetUS, data: { type: 'paint' } }), false);
      });
    });

    describe('_isInBlacklist() function', function () {
      it('should return false for an address not in the blacklist', function () {
        assert.strictEqual(AMS._isInBlacklist('::ffff:192.168.1.1'), false);
      });
    });

    describe('declareAutocompleteClient() function', function () {
      it('should set the user as an autocomplete client', async function () {
        const ws = new WebSocket({ port: 8081 });
        await AMS._connectNewUser({ ws: ws });
        const connected = AMS.US.filter((o) => typeof o !== 'undefined');
        const lastUser = connected[connected.length - 1];
        AMS.declareAutocompleteClient({ uid: lastUser.uid });
        assert.strictEqual(lastUser.User.autocompleteClient, true);
        await AMS.removeUser(ws);
        ws.close();
      });
    });
  });

  describe('Undo System', function () {
    it('pushUndoLayer should add a layer to the UndoStack', function () {
      const initialLength = AMS.UndoStack.length;
      const User = { username: 'testuser', atlasFilename: 'test.nii.gz', specimenName: 'test' };
      const layer = AMS.pushUndoLayer(User);
      assert.strictEqual(AMS.UndoStack.length, initialLength + 1);
      assert.strictEqual(layer.User, User);
      assert.ok(Array.isArray(layer.actions));
      // clean up
      AMS.UndoStack.splice(AMS.UndoStack.length - 1, 1);
    });

    it('getCurrentUndoLayer should return existing layer for the user', function () {
      const User = { username: 'testuser', atlasFilename: 'test.nii.gz', specimenName: 'test' };
      AMS.pushUndoLayer(User);
      const layer = AMS.getCurrentUndoLayer(User);
      assert.strictEqual(layer.User.username, 'testuser');
      // clean up
      AMS.UndoStack.length = 0;
    });

    it('getCurrentUndoLayer should create a new layer if none exists', function () {
      AMS.UndoStack.length = 0;
      const User = { username: 'newuser', atlasFilename: 'new.nii.gz', specimenName: 'new' };
      const layer = AMS.getCurrentUndoLayer(User);
      assert.strictEqual(layer.User.username, 'newuser');
      assert.strictEqual(AMS.UndoStack.length, 1);
      // clean up
      AMS.UndoStack.length = 0;
    });
  });

  describe('Painting functions', function () {
    it('_sliceXYZ2index should convert slice coordinates to volume index', function () {
      const User = {
        view: 'cor',
        s2v: { X: 99, dx: -1, x: 0, Y: 0, dy: 1, y: 2, Z: 299, dz: -1, z: 1, sdim: [100, 200, 300] },
        dim: [100, 200, 300]
      };
      const i = AMS._sliceXYZ2index(10, 20, 30, User);
      assert.strictEqual(typeof i, 'number');
      assert.ok(i >= 0);
    });

    it('paintVoxel should modify the volume and record undo action', function () {
      const vol = Buffer.alloc(100 * 200 * 300).fill(0);
      const undoLayer = { actions: [] };
      const User = {
        view: 'cor',
        s2v: { X: 99, dx: -1, x: 0, Y: 0, dy: 1, y: 2, Z: 299, dz: -1, z: 1, sdim: [100, 200, 300] },
        dim: [100, 200, 300]
      };
      AMS.paintVoxel(10, 20, 30, User, vol, 5, undoLayer);
      // The voxel should have been painted
      const idx = AMS._screen2index([10, 30, 300 - 1 - 20], User);
      assert.strictEqual(vol[idx], 5);
      // The undo layer should record the previous value
      assert.strictEqual(undoLayer.actions[idx], 0);
    });

    it('paintVoxel should not record undo action if value unchanged', function () {
      const vol = Buffer.alloc(100 * 200 * 300).fill(5);
      const undoLayer = { actions: [] };
      const User = {
        view: 'cor',
        s2v: { X: 99, dx: -1, x: 0, Y: 0, dy: 1, y: 2, Z: 299, dz: -1, z: 1, sdim: [100, 200, 300] },
        dim: [100, 200, 300]
      };
      AMS.paintVoxel(10, 20, 30, User, vol, 5, undoLayer);
      assert.strictEqual(Object.keys(undoLayer.actions).length, 0);
    });

    it('line should paint along a path from (x0,y0) to (x,y)', function () {
      // Set up a minimal atlas
      const atlasKey = 'test_line_atlas';
      const dim = [100, 200, 300];
      const vol = Buffer.alloc(dim[0] * dim[1] * dim[2]).fill(0);
      AMS.Atlases[atlasKey] = { data: vol, dim: dim };

      const User = {
        view: 'axi',
        slice: 50,
        x0: 10,
        y0: 10,
        penSize: 1,
        penValue: 3,
        iAtlas: atlasKey,
        s2v: { X: 99, dx: -1, x: 0, Y: 0, dy: 1, y: 2, Z: 299, dz: -1, z: 1, sdim: [100, 200, 300] },
        dim: dim
      };
      const undoLayer = { actions: [] };
      AMS.line(15, 15, 3, User, undoLayer);

      // Some voxels along the line should be painted
      let paintedCount = 0;
      for (let i = 0; i < vol.length; i++) {
        if (vol[i] === 3) { paintedCount += 1; }
      }
      assert.ok(paintedCount > 0, 'Line should paint at least one voxel');

      delete AMS.Atlases[atlasKey];
    });
  });

  describe('Slice drawing', function () {
    let mri;

    before(async function () {
      mri = await amri.readNifti(datadir + 'bert_brain.nii.gz');
    });

    it('Should draw a sagittal slice', function () {
      const jpg = AMS.drawSlice(mri, 'sag', 128);
      assert.ok(jpg.data.length > 0);
    });

    it('Should draw an axial slice', function () {
      const jpg = AMS.drawSlice(mri, 'axi', 128);
      assert.ok(jpg.data.length > 0);
    });
  });

  // =========================================================================
  // Mock-socket tests: broadcast, send, receive, undo, verifyClient, fill, paintxy
  // =========================================================================
  describe('Mock-socket: broadcastMessage', function () {
    afterEach(function () {
      // clean up any mock users we added
      AMS.US = AMS.US.filter(() => false);
    });

    it('should send a JSON message to all other open sockets', function () {
      const ws1 = mockSocket();
      const ws2 = mockSocket();
      const us1 = addMockUser(ws1, {});
      addMockUser(ws2, {});

      AMS.broadcastMessage({ type: 'test', value: 42 }, us1.uid);

      assert.strictEqual(ws1.send.callCount, 0, 'should not send to the source user');
      assert.strictEqual(ws2.send.callCount, 1);
      const sent = JSON.parse(ws2.send.firstCall.args[0]);
      assert.strictEqual(sent.type, 'test');
      assert.strictEqual(sent.value, 42);
    });

    it('should skip sockets that are not in OPEN state', function () {
      const ws1 = mockSocket();
      const ws2 = mockSocket({ readyState: 3 }); // CLOSED
      const us1 = addMockUser(ws1, {});
      addMockUser(ws2, {});

      AMS.broadcastMessage({ type: 'hello' }, us1.uid);

      assert.strictEqual(ws2.send.callCount, 0);
    });
  });

  describe('Mock-socket: broadcastPaintVolumeMessage', function () {
    afterEach(function () {
      AMS.US = AMS.US.filter(() => false);
    });

    it('should broadcast paint volume data to users on the same atlas', function () {
      const ws1 = mockSocket();
      const ws2 = mockSocket();
      addMockUser(ws1, { iAtlas: 'a1' });
      const User = { iAtlas: 'a1' };
      addMockUser(ws2, { iAtlas: 'a1' });

      AMS.broadcastPaintVolumeMessage({ data: [[0, 1]] }, User);

      // both sockets should receive the message (broadcastPaintVolumeMessage
      // sends to everyone on the same iAtlas, including the source)
      assert.ok(ws1.send.callCount + ws2.send.callCount >= 1);
      const sent = JSON.parse(ws1.send.firstCall.args[0]);
      assert.strictEqual(sent.type, 'paintvol');
    });

    it('should not send to users on a different atlas', function () {
      const ws1 = mockSocket();
      const ws2 = mockSocket();
      addMockUser(ws1, { iAtlas: 'a1' });
      addMockUser(ws2, { iAtlas: 'a2' });

      AMS.broadcastPaintVolumeMessage({ data: [] }, { iAtlas: 'a1' });

      assert.strictEqual(ws2.send.callCount, 0);
    });
  });

  describe('Mock-socket: broadcastServerMessage', function () {
    afterEach(function () {
      AMS.US = AMS.US.filter(() => false);
    });

    it('should broadcast a serverMessage to all connected users', function () {
      const ws1 = mockSocket();
      addMockUser(ws1, {});

      AMS.broadcastServerMessage({ msg: 'hello world', dialogType: 'info' });

      assert.strictEqual(ws1.send.callCount, 1);
      const sent = JSON.parse(ws1.send.firstCall.args[0]);
      assert.strictEqual(sent.type, 'serverMessage');
      assert.strictEqual(sent.msg, 'hello world');
      assert.strictEqual(sent.dialogType, 'info');
    });
  });

  describe('Mock-socket: sendSliceToUser', function () {
    let mri;

    before(async function () {
      mri = await amri.readNifti(datadir + 'bert_brain.nii.gz');
    });

    it('should send a binary JPEG buffer to the socket', function () {
      const ws = mockSocket();
      AMS.sendSliceToUser(mri, 'cor', 100, ws);

      assert.strictEqual(ws.send.callCount, 1);
      const [buf] = ws.send.firstCall.args;
      assert.ok(Buffer.isBuffer(buf));
      // The buffer should end with the jpgTag
      const tag = buf.slice(buf.length - 8).toString()
        .trim();
      assert.strictEqual(tag, 'jpg');
    });
  });

  describe('Mock-socket: _sendAtlasVoxelDataToUser (uncompressed)', function () {
    it('should send atlas data concatenated with niiTag', function () {
      const ws = mockSocket();
      const atlasdata = Buffer.alloc(16).fill(1);
      AMS._sendAtlasVoxelDataToUser(atlasdata, ws, false);

      assert.strictEqual(ws.send.callCount, 1);
      const [buf] = ws.send.firstCall.args;
      assert.ok(Buffer.isBuffer(buf));
      const tag = buf.slice(buf.length - 8).toString()
        .trim();
      assert.strictEqual(tag, 'nii');
    });
  });

  describe('Mock-socket: _sendAtlasVoxelDataToUser (compressed)', function () {
    it('should gzip-compress and send atlas data with niiTag', function (done) {
      const ws = mockSocket();
      const atlasdata = Buffer.alloc(64).fill(2);
      AMS._sendAtlasVoxelDataToUser(atlasdata, ws, true);

      // gzip is async via callback, give it a moment
      setTimeout(function () {
        assert.strictEqual(ws.send.callCount, 1);
        const [buf] = ws.send.firstCall.args;
        assert.ok(Buffer.isBuffer(buf));
        const tag = buf.slice(buf.length - 8).toString()
          .trim();
        assert.strictEqual(tag, 'nii');
        done();
      }, 200);
    });

    it('should not send if socket is not OPEN', function (done) {
      const ws = mockSocket({ readyState: 3 });
      // need to register this socket in US so getUserFromSocket works
      addMockUser(ws, {});
      const atlasdata = Buffer.alloc(64).fill(2);
      AMS._sendAtlasVoxelDataToUser(atlasdata, ws, true);

      setTimeout(function () {
        assert.strictEqual(ws.send.callCount, 0);
        AMS.US = AMS.US.filter(() => false);
        done();
      }, 200);
    });
  });

  describe('Mock-socket: _sendAtlasVectorialDataToUser', function () {
    it('should send sanitised JSON vectorial data', function () {
      const ws = mockSocket();
      const data = [{ type: 'region', points: [[1, 2], [3, 4]] }];
      AMS._sendAtlasVectorialDataToUser(data, ws);

      assert.strictEqual(ws.send.callCount, 1);
      const sent = JSON.parse(ws.send.firstCall.args[0]);
      assert.strictEqual(sent.type, 'vectorial');
      assert.ok(Array.isArray(sent.data));
    });
  });

  describe('Mock-socket: sendAtlasToUser', function () {
    it('should send both voxel and vectorial data', function () {
      const ws = mockSocket();
      const atlas = {
        data: Buffer.alloc(16).fill(0),
        vectorial: [{ region: 'test' }]
      };
      AMS.sendAtlasToUser(atlas, ws, false);

      // voxel (binary) + vectorial (JSON) = 2 sends
      assert.strictEqual(ws.send.callCount, 2);
    });

    it('should initialise vectorial to empty array if undefined', function () {
      const ws = mockSocket();
      const atlas = { data: Buffer.alloc(16).fill(0) };
      AMS.sendAtlasToUser(atlas, ws, false);

      assert.ok(Array.isArray(atlas.vectorial));
      assert.strictEqual(atlas.vectorial.length, 0);
    });
  });

  describe('Mock-socket: sendDisconnectMessage', function () {
    afterEach(function () {
      AMS.US = AMS.US.filter(() => false);
    });

    it('should broadcast a disconnect message to other users', function () {
      const ws1 = mockSocket();
      const ws2 = mockSocket();
      const us1 = addMockUser(ws1, {});
      addMockUser(ws2, {});

      AMS.sendDisconnectMessage(us1.uid);

      assert.strictEqual(ws2.send.callCount, 1);
      const sent = JSON.parse(ws2.send.firstCall.args[0]);
      assert.strictEqual(sent.type, 'disconnect');
      assert.strictEqual(sent.uid, us1.uid);
    });
  });

  describe('Mock-socket: sendPreviousUserDataMessage', function () {
    afterEach(function () {
      AMS.US = AMS.US.filter(() => false);
    });

    it('should send existing user data to the new user', function () {
      const ws1 = mockSocket();
      const ws2 = mockSocket();
      addMockUser(ws1, { username: 'olduser', iAtlas: 'a1' });
      const newUS = addMockUser(ws2, {});

      AMS.sendPreviousUserDataMessage(newUS);

      // new user's socket receives data about the old user
      assert.strictEqual(ws2.send.callCount, 1);
      const sent = JSON.parse(ws2.send.firstCall.args[0]);
      assert.strictEqual(sent.type, 'userData');
      assert.strictEqual(sent.user.username, 'olduser');
    });
  });

  describe('Mock-socket: verifyClient', function () {
    it('should return true when no IP can be determined', function () {
      const info = { req: { connection: {}, socket: {} } };
      assert.strictEqual(AMS.verifyClient(info), true);
    });

    it('should return true for an IP not in the blacklist', function () {
      const info = { req: { connection: { remoteAddress: '::ffff:10.0.0.1' }, socket: {} } };
      assert.strictEqual(AMS.verifyClient(info), true);
    });

    it('should extract IP from socket._peername if connection.remoteAddress is missing', function () {
      const info = { req: { connection: {}, socket: { _peername: { address: '::ffff:10.0.0.2' } } } };
      assert.strictEqual(AMS.verifyClient(info), true);
    });
  });

  describe('Mock-socket: receivePaintMessage', function () {
    afterEach(function () {
      AMS.US = AMS.US.filter(() => false);
      AMS.UndoStack.length = 0;
    });

    it('should paint at the given coordinates via paintxy', function () {
      const atlasKey = 'test_recv_paint';
      const dim = [100, 200, 300];
      const vol = Buffer.alloc(dim[0] * dim[1] * dim[2]).fill(0);
      AMS.Atlases[atlasKey] = { data: vol, dim: dim };

      const ws = mockSocket();
      const userProps = {
        username: 'painter',
        atlasFilename: 'test.nii.gz',
        specimenName: 'test',
        iAtlas: atlasKey,
        view: 'axi',
        slice: 50,
        x0: 10,
        y0: 10,
        penSize: 1,
        penValue: 7,
        s2v: { X: 99, dx: -1, x: 0, Y: 0, dy: 1, y: 2, Z: 299, dz: -1, z: 1, sdim: dim },
        dim: dim
      };
      const us = addMockUser(ws, userProps);

      AMS.receivePaintMessage({
        uid: us.uid,
        data: { c: 'lf', x: 12, y: 12 }
      });

      let painted = 0;
      for (let i = 0; i < vol.length; i++) {
        if (vol[i] === 7) { painted += 1; }
      }
      assert.ok(painted > 0, 'receivePaintMessage should paint voxels');

      delete AMS.Atlases[atlasKey];
    });
  });

  describe('Mock-socket: receiveVectorialAnnotationMessage', function () {
    afterEach(function () {
      AMS.US = AMS.US.filter(() => false);
    });

    it('should update vectorial annotations on the atlas', function () {
      const atlasKey = 'test_vec';
      AMS.Atlases[atlasKey] = { data: Buffer.alloc(8), vectorial: [] };

      const ws = mockSocket();
      const us = addMockUser(ws, { iAtlas: atlasKey });

      const newData = [{ type: 'region', points: [[1, 2]] }];
      AMS.receiveVectorialAnnotationMessage({ uid: us.uid, data: newData });

      assert.deepStrictEqual(AMS.Atlases[atlasKey].vectorial, newData);

      delete AMS.Atlases[atlasKey];
    });
  });

  describe('Mock-socket: undo with broadcastPaintVolumeMessage', function () {
    afterEach(function () {
      AMS.US = AMS.US.filter(() => false);
      AMS.UndoStack.length = 0;
    });

    it('should revert painted voxels and broadcast the undo', function () {
      const atlasKey = 'test_undo';
      const dim = [10, 10, 10];
      const vol = Buffer.alloc(1000).fill(0);
      AMS.Atlases[atlasKey] = { data: vol, dim: dim };

      const ws = mockSocket();
      addMockUser(ws, { iAtlas: atlasKey });

      const User = {
        username: 'undoer',
        atlasFilename: 'undo.nii.gz',
        specimenName: 'test',
        iAtlas: atlasKey,
        dim: dim
      };

      // simulate a paint action: set voxel 42 to value 5, record old value 0
      vol[42] = 5;
      const undoLayer = AMS.pushUndoLayer(User);
      undoLayer.actions[42] = 0; // was 0 before paint

      AMS.undo(User);

      assert.strictEqual(vol[42], 0, 'voxel should be reverted');
      assert.ok(ws.send.callCount >= 1, 'broadcastPaintVolumeMessage should fire');

      delete AMS.Atlases[atlasKey];
    });

    it('should do nothing if no undo layer exists for the user', function () {
      AMS.UndoStack.length = 0;
      const User = { username: 'nobody', atlasFilename: 'x.nii.gz', specimenName: 'x' };
      // should not throw
      AMS.undo(User);
    });
  });

  describe('Mock-socket: fill function', function () {
    it('should flood-fill a region with the given value', function () {
      const atlasKey = 'test_fill';
      const dim = [20, 20, 20];
      const vol = Buffer.alloc(dim[0] * dim[1] * dim[2]).fill(0);
      AMS.Atlases[atlasKey] = { data: vol, dim: dim };

      const User = {
        view: 'axi',
        slice: 5,
        iAtlas: atlasKey,
        s2v: { X: 19, dx: -1, x: 0, Y: 0, dy: 1, y: 2, Z: 19, dz: -1, z: 1, sdim: dim },
        dim: dim
      };
      const undoLayer = { actions: [] };

      AMS.fill(10, 10, 5, 3, User, undoLayer);

      let filled = 0;
      for (let i = 0; i < vol.length; i++) {
        if (vol[i] === 3) { filled += 1; }
      }
      // An entire axi slice of 20x20 = 400 voxels should be filled
      assert.ok(filled > 0, 'fill should paint voxels');
      assert.ok(Object.keys(undoLayer.actions).length > 0, 'fill should record undo actions');

      delete AMS.Atlases[atlasKey];
    });

    it('should do nothing if fill value equals existing value', function () {
      const atlasKey = 'test_fill_noop';
      const dim = [10, 10, 10];
      const vol = Buffer.alloc(1000).fill(5);
      AMS.Atlases[atlasKey] = { data: vol, dim: dim };

      const User = {
        view: 'axi',
        slice: 5,
        iAtlas: atlasKey,
        s2v: { X: 9, dx: -1, x: 0, Y: 0, dy: 1, y: 2, Z: 9, dz: -1, z: 1, sdim: dim },
        dim: dim
      };
      const undoLayer = { actions: [] };

      AMS.fill(5, 5, 5, 5, User, undoLayer);
      assert.strictEqual(Object.keys(undoLayer.actions).length, 0);

      delete AMS.Atlases[atlasKey];
    });
  });

  describe('Mock-socket: paintxy function', function () {
    afterEach(function () {
      AMS.UndoStack.length = 0;
    });

    it('should handle "me" command (move, no paint)', function () {
      const atlasKey = 'test_paintxy_me';
      const dim = [10, 10, 10];
      AMS.Atlases[atlasKey] = { data: Buffer.alloc(1000).fill(0), dim: dim };

      const User = {
        view: 'axi',
        slice: 5,
        x0: -1,
        y0: -1,
        penSize: 1,
        penValue: 1,
        iAtlas: atlasKey,
        s2v: { X: 9, dx: -1, x: 0, Y: 0, dy: 1, y: 2, Z: 9, dz: -1, z: 1, sdim: dim },
        dim: dim
      };
      const undoLayer = { actions: [] };

      AMS.paintxy('u1', 'me', 5, 5, User, undoLayer);
      assert.strictEqual(User.x0, 5);
      assert.strictEqual(User.y0, 5);
      // "me" only moves the cursor, no voxels painted
      assert.strictEqual(Object.keys(undoLayer.actions).length, 0);

      delete AMS.Atlases[atlasKey];
    });

    it('should handle "le" command (line erase)', function () {
      const atlasKey = 'test_paintxy_le';
      const dim = [20, 20, 20];
      const vol = Buffer.alloc(dim[0] * dim[1] * dim[2]).fill(5);
      AMS.Atlases[atlasKey] = { data: vol, dim: dim };

      const User = {
        view: 'axi',
        slice: 5,
        x0: 3,
        y0: 3,
        penSize: 1,
        penValue: 5,
        iAtlas: atlasKey,
        s2v: { X: 19, dx: -1, x: 0, Y: 0, dy: 1, y: 2, Z: 19, dz: -1, z: 1, sdim: dim },
        dim: dim
      };
      const undoLayer = { actions: [] };

      AMS.paintxy('u1', 'le', 6, 6, User, undoLayer);

      let erased = 0;
      for (let i = 0; i < vol.length; i++) {
        if (vol[i] === 0) { erased += 1; }
      }
      assert.ok(erased > 0, 'le should erase (set to 0) along the line');

      delete AMS.Atlases[atlasKey];
    });

    it('should handle "mu" command (mouse up) by pushing undo layer', function () {
      const atlasKey = 'test_paintxy_mu';
      AMS.Atlases[atlasKey] = { data: Buffer.alloc(1000).fill(0), dim: [10, 10, 10] };

      const User = {
        username: 'muuser',
        atlasFilename: 'mu.nii.gz',
        specimenName: 'test',
        view: 'axi',
        slice: 5,
        x0: 5,
        y0: 5,
        penSize: 1,
        penValue: 1,
        iAtlas: atlasKey,
        s2v: { X: 9, dx: -1, x: 0, Y: 0, dy: 1, y: 2, Z: 9, dz: -1, z: 1, sdim: [10, 10, 10] },
        dim: [10, 10, 10]
      };
      const undoLayer = { actions: [] };
      const stackBefore = AMS.UndoStack.length;

      AMS.paintxy('u1', 'mu', 5, 5, User, undoLayer);

      assert.strictEqual(AMS.UndoStack.length, stackBefore + 1);

      delete AMS.Atlases[atlasKey];
    });
  });

  describe('Mock-socket: declareAutocompleteClient with mock', function () {
    afterEach(function () {
      AMS.US = AMS.US.filter(() => false);
    });

    it('should mark the user as autocomplete client', function () {
      const ws = mockSocket();
      const us = addMockUser(ws, {});
      AMS.declareAutocompleteClient({ uid: us.uid });
      assert.strictEqual(us.User.autocompleteClient, true);
      assert.strictEqual(us.User.uid, us.uid);
    });
  });

  describe('Mock-socket: drawSlice2 (brain + atlas overlay)', function () {
    let mri;

    before(async function () {
      mri = await amri.readNifti(datadir + 'bert_brain.nii.gz');
    });

    it('should produce a JPEG with atlas overlay', function () {
      const atlas = {
        data: Buffer.alloc(mri.dim[0] * mri.dim[1] * mri.dim[2]).fill(0)
      };
      // paint a few voxels with label 1 so the overlay path is exercised
      for (let i = 0; i < 100; i++) {
        atlas.data[i] = 1;
      }
      const jpg = AMS.drawSlice2(mri, atlas, 'cor', 50);
      assert.ok(jpg.data.length > 0);
    });
  });

  describe('displayAtlases', function () {
    it('should not throw when there are no atlases', function () {
      assert.doesNotThrow(() => AMS.displayAtlases());
    });
  });

  describe('saveAllAtlases', function () {
    it('should not throw when Atlases is empty', async function () {
      // ensure no atlases
      const saved = { ...AMS.Atlases };
      for (const k in AMS.Atlases) {
        if ({}.hasOwnProperty.call(AMS.Atlases, k)) {
          delete AMS.Atlases[k];
        }
      }
      await AMS.saveAllAtlases();
      // restore
      Object.assign(AMS.Atlases, saved);
    });
  });

  describe('_saveAtlasVoxelData error paths', function () {
    it('should throw if atlas is undefined', async function () {
      try {
        let undef;
        await AMS._saveAtlasVoxelData(undef);
        assert.fail('should have thrown');
      } catch (err) {
        assert.ok(err.message.includes('No voxel atlas'));
      }
    });

    it('should throw if atlas.dim is undefined', async function () {
      try {
        await AMS._saveAtlasVoxelData({});
        assert.fail('should have thrown');
      } catch (err) {
        assert.ok(err.message.includes('No voxel atlas'));
      }
    });

    it('should throw if atlas.data is undefined', async function () {
      try {
        await AMS._saveAtlasVoxelData({ dim: [2, 2, 2] });
        assert.fail('should have thrown');
      } catch (err) {
        assert.ok(err.message.includes('no voxel data'));
      }
    });
  });

  describe('_saveAtlasVectorialData error paths', function () {
    it('should throw if atlas is undefined', async function () {
      try {
        let undef;
        await AMS._saveAtlasVectorialData(undef);
        assert.fail('should have thrown');
      } catch (err) {
        assert.ok(err.message.includes('No vectorial atlas'));
      }
    });

    it('should throw if atlas.vectorial is undefined', async function () {
      try {
        await AMS._saveAtlasVectorialData({});
        assert.fail('should have thrown');
      } catch (err) {
        assert.ok(err.message.includes('No vectorial atlas'));
      }
    });
  });

  describe('removeAtlasAtIndex', function () {
    it('should clear timer and delete the atlas entry', function () {
      const key = 'test_remove_atlas';
      const timer = setInterval(() => { /* empty */ }, 999999);
      AMS.Atlases[key] = { filename: 'test.nii.gz', timer: timer };

      AMS.removeAtlasAtIndex(key);

      let undef;
      assert.strictEqual(AMS.Atlases[key], undef);
    });
  });

  describe('unloadUnusedBrains', function () {
    it('should remove brains with no connected users', function () {
      AMS.Brains.push({ path: '/unused/brain.nii.gz', data: {} });
      const lenBefore = AMS.Brains.length;

      AMS.unloadUnusedBrains();

      assert.ok(AMS.Brains.length < lenBefore);
    });
  });

  // =========================================================================
  // Embed connection enforcement: an embed-tagged connection must never be
  // able to write, regardless of anything the client claims over the socket.
  // =========================================================================
  describe('Embed connection enforcement', function () {
    describe('_connectNewUser: embed ticket tagging', function () {
      afterEach(function () {
        AMS.US = AMS.US.filter(() => false);
      });

      it('should tag the connection as embed with the ticket scope, for a valid ticket', async function () {
        const token = await EmbedAccessService.mintWsTicket(U.getNativeDB(), {
          dirname: '/data/testembed/',
          mriSource: 'http://example.com/b.nii.gz'
        });
        const ws = mockSocket();
        await AMS._connectNewUser({ ws, req: { url: '/?embedTicket=' + token } });
        await new Promise((resolve) => setTimeout(resolve, 100));

        const user = AMS.getUserFromSocket(ws);
        assert.strictEqual(user.isEmbed, true);
        assert.deepStrictEqual(user.embedScope, { dirname: '/data/testembed/', mriSource: 'http://example.com/b.nii.gz' });
      }).timeout(U.mediumTimeout);

      it('should tag the connection as embed but with a null scope, for an unknown ticket', async function () {
        const ws = mockSocket();
        await AMS._connectNewUser({ ws, req: { url: '/?embedTicket=not-a-real-ticket' } });
        await new Promise((resolve) => setTimeout(resolve, 100));

        const user = AMS.getUserFromSocket(ws);
        assert.strictEqual(user.isEmbed, true);
        assert.strictEqual(user.embedScope, null);
      }).timeout(U.mediumTimeout);

      it('should not tag the connection as embed when no ticket is present', async function () {
        let undef;
        const ws = mockSocket();
        await AMS._connectNewUser({ ws, req: { url: '/' } });

        const user = AMS.getUserFromSocket(ws);
        assert.strictEqual(user.isEmbed, undef);
      });
    });

    /**
     * Assert that a given WS message type is rejected outright (its receiver
     * function is never invoked) when sent on an embed-tagged connection.
     * @param {string} type The WS message type, e.g. 'paint'
     * @param {string} receiverName The AMS method that would normally handle it
     * @returns {void}
     */
    const assertWriteTypeRejectedForEmbed = function (type, receiverName) {
      const spy = sinon.spy(AMS, receiverName);
      const sourceUS = { uid: 'u1', isEmbed: true };

      AMS._handleUserWebSocketMessage({ data: { type, uid: 'u1' }, ws: mockSocket(), sourceUS });

      assert.strictEqual(spy.called, false);
    };

    describe('_handleUserWebSocketMessage: write rejection', function () {
      afterEach(function () {
        sinon.restore();
        AMS.US = AMS.US.filter(() => false);
      });

      it('should reject a "paint" message from an embed-tagged connection', function () {
        assertWriteTypeRejectedForEmbed('paint', 'receivePaintMessage');
      });

      it('should reject a "vectorial" message from an embed-tagged connection', function () {
        assertWriteTypeRejectedForEmbed('vectorial', 'receiveVectorialAnnotationMessage');
      });

      it('should reject a "save" message from an embed-tagged connection', function () {
        assertWriteTypeRejectedForEmbed('save', 'receiveSaveMessage');
      });

      it('should reject a "saveMetadata" message from an embed-tagged connection', function () {
        assertWriteTypeRejectedForEmbed('saveMetadata', 'receiveSaveMetadataMessage');
      });

      it('should reject an "atlas" message from an embed-tagged connection', function () {
        assertWriteTypeRejectedForEmbed('atlas', 'receiveAtlasFromUserMessage');
      });

      it('should still apply a "paint" message from a non-embed connection (negative control)', function () {
        const atlasKey = 'test_embed_reject_control';
        AMS.Atlases[atlasKey] = { data: Buffer.alloc(1000).fill(0), dim: [10, 10, 10] };
        const ws = mockSocket();
        const userProps = {
          username: 'painter',
          atlasFilename: 'test.nii.gz',
          specimenName: 'test',
          iAtlas: atlasKey,
          view: 'axi',
          slice: 5,
          x0: -1,
          y0: -1,
          penSize: 1,
          penValue: 1,
          s2v: { X: 9, dx: -1, x: 0, Y: 0, dy: 1, y: 2, Z: 9, dz: -1, z: 1, sdim: [10, 10, 10] },
          dim: [10, 10, 10]
        };
        const us = addMockUser(ws, userProps);

        AMS._handleUserWebSocketMessage({
          data: { type: 'paint', uid: us.uid, data: { c: 'me', x: 1, y: 1 } },
          ws,
          sourceUS: us
        });

        assert.strictEqual(us.User.x0, 1, 'non-embed connections must be unaffected by the embed guard');
        delete AMS.Atlases[atlasKey];
      });

      it('should still forward non-write message types (e.g. "show") for an embed-tagged connection', function () {
        const sourceUS = { uid: 'u1', isEmbed: true };
        // 'show' performs no action either way - this only asserts the guard
        // does not throw or otherwise misbehave for a type outside its blocklist.
        assert.doesNotThrow(() => {
          AMS._handleUserWebSocketMessage({ data: { type: 'show', uid: 'u1' }, ws: mockSocket(), sourceUS });
        });
      });
    });

    describe('Forged editMode does not bypass write rejection', function () {
      afterEach(function () {
        sinon.restore();
        AMS.US = AMS.US.filter(() => false);
      });

      it('should still reject a paint message after the client claims editMode:1 via allUserData', function () {
        const ws = mockSocket();
        const us = addMockUser(ws);
        us.isEmbed = true;
        us.embedScope = { dirname: '/scoped/' };

        // The attacker sends a forged 'allUserData' message claiming editMode:1.
        // receiveUserDataMessage trusts the client for this field (a pre-existing,
        // out-of-scope gap) - what must NOT happen is that this forged state is
        // ever consulted to allow a write.
        AMS.receiveUserDataMessage({
          uid: us.uid,
          description: 'allUserData',
          user: { editMode: 1, username: 'attacker', dirname: '/scoped/' }
        }, ws);
        assert.strictEqual(us.User.editMode, 1, 'sanity check: the forged field was in fact stored');

        const paintSpy = sinon.spy(AMS, 'receivePaintMessage');

        AMS._handleUserWebSocketMessage({
          data: { type: 'paint', uid: us.uid, c: 'lf', x: 1, y: 1 },
          ws,
          sourceUS: us
        });

        assert.strictEqual(paintSpy.called, false, 'paint must be rejected regardless of claimed editMode');
      });
    });

    describe('_isSendAtlasOutOfEmbedScope / _handleSendAtlasRequest: read scoping', function () {
      afterEach(function () {
        sinon.restore();
      });

      it('should reject sendAtlas for an embed connection requesting an out-of-scope dirname', function () {
        const spy = sinon.spy(AMS, '_findAtlas');
        const sourceUS = { uid: 'u1', isEmbed: true, embedScope: { dirname: '/scoped/' } };
        const User = { dirname: '/other/', atlasFilename: 'x.nii.gz' };

        AMS._handleSendAtlasRequest({ sourceUS, User, userSocket: mockSocket(), firstConnectionFlag: true });

        assert.strictEqual(spy.called, false);
      });

      it('should reject sendAtlas for an embed connection with no resolved scope yet', function () {
        const spy = sinon.spy(AMS, '_findAtlas');
        const sourceUS = { uid: 'u1', isEmbed: true, embedScope: null };
        const User = { dirname: '/anything/', atlasFilename: 'x.nii.gz' };

        AMS._handleSendAtlasRequest({ sourceUS, User, userSocket: mockSocket(), firstConnectionFlag: true });

        assert.strictEqual(spy.called, false);
      });

      it('should allow sendAtlas for an embed connection requesting its own scoped dirname', function () {
        const spy = sinon.spy(AMS, '_findAtlas');
        const sourceUS = { uid: 'u1', isEmbed: true, embedScope: { dirname: '/scoped/' }, User: {} };
        const User = { dirname: '/scoped/', atlasFilename: 'x.nii.gz' };

        AMS._handleSendAtlasRequest({ sourceUS, User, userSocket: mockSocket(), firstConnectionFlag: true });

        assert.strictEqual(spy.called, true);
      });

      it('should allow sendAtlas for a non-embed connection regardless of dirname', function () {
        const spy = sinon.spy(AMS, '_findAtlas');
        const sourceUS = { uid: 'u1', User: {} };
        const User = { dirname: '/anything/', atlasFilename: 'x.nii.gz' };

        AMS._handleSendAtlasRequest({ sourceUS, User, userSocket: mockSocket(), firstConnectionFlag: true });

        assert.strictEqual(spy.called, true);
      });
    });
  });
});
