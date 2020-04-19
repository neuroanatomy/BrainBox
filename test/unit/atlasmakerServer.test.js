const fs = require('fs');
var assert = require("assert");
const AMS = require('../../controller/atlasmakerServer/atlasmakerServer.js');
const datadir = './test/data/';
const U = require('../utils.js');

// console.log("Current directory:", __dirname);
// const { exec } = require("child_process");
// exec('ls -l', (error, stdout, std_err) => {
//   console.log(stdout);
// });

describe('UNIT TESTING ATLASMAKER SERVER', function () {
  describe('MRI IO', function () {
    let mri1, mri2;

    it('Should load a nii.gz file', async function () {
      mri1 = await AMS.readNifti(datadir + 'bert_brain.nii.gz');
    });

    it('Should get the dimensions right', function () {
      assert(mri1.dim[0]===256 && mri1.dim[1]===256 && mri1.dim[2]===256);
    });

    it('Should load a mgz file', async function () {
      mri2 = await AMS.readMGZ(datadir + 'bert_brain.mgz');
    });

    it('Should get the dimensions right', function () {
      assert(mri2.dim[0]===256 && mri2.dim[1]===256 && mri2.dim[2]===256);
    });

    it('Should recognize nii.gz from a filename', function () {
      const ext = AMS._filetypeFromFilename("/path/to/mri.nii.gz");
      assert.equal(ext, "nii.gz");
    });

    it('Should recognize mgz from a filename', function () {
      const ext = AMS._filetypeFromFilename("/path/to/mri.mgz");
      assert.equal(ext, "mgz");
    });

    it('Should return undefined if filename is not nii.gz nor mgz', function () {
      const ext = AMS._filetypeFromFilename("/path/to/mri.foo");
      assert(typeof ext === "undefined");
    });

    it('Subtract vectors correctly', function () {
      const res = AMS.subVecVec([1, 2, 3], [2, 3, 4]);
      assert(res[0] === -1 && res[1] === -1 && res[2] === -1);
    });
  });

  describe('Painting', function () {
    it('Convert screen coordinates to volume index', async function () {
      const s = [10, 20, 30];
      const mri = {
        s2v: { X:99, dx:-1, x:0, Y:0, dy:1, y:2, Z:299, dz:-1, z:1},
        dim: [100, 200, 300]
      };
      const i = AMS._screen2index(s, mri);
      assert.equal(i, 5583089);
    });
  });

  describe('Database', function () {
    it('Find user name given their nickname', async function () {
      const data = {type: "userNameQuery", metadata: {nickname: U.userFoo.nickname}};
      const result = await AMS.queryUserName(data);
      assert.equal(result[0].name, U.userFoo.name);
    });

    it('Find user nickname given their name', async function () {
      const data = {type: "userNameQuery", metadata: {name: U.userFoo.name}};
      const result = await AMS.queryUserName(data);
      assert.equal(result[0].nickname, U.userFoo.nickname);
    });

    it('Find project', async function () {
      const data = {type: "projectNameQuery", metadata: {name: U.projectTest.shortname}};
      const result = await AMS.queryProjectName(data);
      assert.equal(result.name, U.projectTest.name);
    });

    it('Find similar project names', async function () {
      const data = {
        type: "similarProjectNamesQuery",
        metadata: {projectName: U.projectTest.shortname.slice(0,3)}
      };
      const result = await AMS.querySimilarProjectNames(data);
      assert.equal(result[0].name, U.projectTest.name);
    });
  });

  describe('Volume slice server', function () {
    let mri;

    it('Should load a nii.gz file', async function () {
      mri = await AMS.readNifti(datadir + 'bert_brain.nii.gz');
    });

    it('Serve one slice', async function () {
      const view = 'cor';
      const slice = 50;
      const jpg = await AMS.drawSlice(mri, view, slice);
      const newPath = "./test/images/slice-bert-cor-50.jpg";
      const refPath = "./test/data/reference-images/slice-bert-cor-50.jpg";
      fs.writeFileSync(newPath, jpg.data);
      const diff = U.compareImages(newPath, refPath);
      assert(diff<10);
    });
  });
});
