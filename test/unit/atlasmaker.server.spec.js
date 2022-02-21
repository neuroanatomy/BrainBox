const fs = require('fs');
const path = require('path');
const WebSocket = require('ws').Server;
var assert = require('assert');
// const tracer = require('tracer').console({ format: '[{{file}}:{{line}}]  {{message}}' });
const la = require('../../controller/atlasmakerServer/atlasmaker-linalg.js');
const amri = require('../../controller/atlasmakerServer/atlasmaker-mri.js');
const atlasmakerServer = require('../../controller/atlasmakerServer/atlasmakerServer.js');
const datadir = './test/data/';
const U = require('../utils.js');
const { expect } = require('chai');
require('mocha-sinon');

let AMS;

describe('UNIT TESTING ATLASMAKER SERVER', function () {
  before(function() {
    AMS = atlasmakerServer(U.getDB());
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

    it('Should get the dimensions right', function () {
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

  describe('Utility Functions: ', function () {
    describe('numberOfUsersConnectedToMRI function() ', function () {

      it('should return 0 if the mri path is invalid or undefined', async function () {
        var users = await AMS.numberOfUsersConnectedToMRI('');
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
        for (var x = 0; x < AMS.US.length; x++) {
          if (AMS.US[x]) { cnt++; }
        }
        assert.strictEqual(cnt, 0);
      });

      it('should return the correct number of users if some users are connected', async function () {
        const ws = new WebSocket({ port: 8081 });
        await AMS._connectNewUser({ ws: ws });
        await AMS.displayUsers();
        let cnt = 0;
        for (var x = 0; x < AMS.US.length; x++) {
          if (AMS.US[x]) { cnt++; }
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
        for (var x = 0; x < AMS.Brains.length; x++) {
          if (AMS.Brains[x]) { cnt++; }
        }
        assert.strictEqual(cnt, 0);
      });

      it('should display the brains when there are some brains loaded', async function () {
        const mriPath = '/test_data/bert_brain.nii.gz';
        await AMS.getBrainAtPath(mriPath);
        await AMS.displayBrains();
        let cnt = 0;
        for (var x = 0; x < AMS.Brains.length; x++) {
          if (AMS.Brains[x]) { cnt++; }
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
        for (var x = 0; x < AMS.US.length; x++) {
          if (AMS.US[x]) { cnt++; }
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
        for (var x = 0; x < AMS.US.length; x++) {
          if (AMS.US[x]) { cnt++; }
        }
        ws.close();
        assert.strictEqual(cnt, 0);
      });
    });
  });
});
