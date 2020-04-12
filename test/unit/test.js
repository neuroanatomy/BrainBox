var fs = require('fs');
var assert = require("assert");
var jpeg = require('jpeg-js');
const pixelmatch = require('pixelmatch');
const AMS = require('../../controller/atlasmakerServer/atlasmakerServer.js');
const datadir = './test/data/';

// console.log("Current directory:", __dirname);
// const { exec } = require("child_process");
// exec('ls -l', (error, stdout, std_err) => {
//   console.log(stdout);
// });

function compareImages(pathImg1, pathImg2) {
  const data1 = fs.readFileSync(pathImg1);
  const data2 = fs.readFileSync(pathImg2);
  const img1 = jpeg.decode(data1);
  const img2 = jpeg.decode(data2);
  const pixdiff = pixelmatch(img1.data, img2.data, null, img1.width, img1.height);

  return pixdiff;
}

describe('Array', () => {
  describe('#indexOf()', () => {
    it('should return -1 when the value is not present', () => {
      assert.equal(-1, [1, 2, 3].indexOf(4)); // 4 is not present in this array so indexOf returns -1
    });
  });
});

describe('AtlasMakerServer', async () => {
  describe('MRI IO', async () => {
    let mri1, mri2;

    it('Should load a nii.gz file', async () => {
      mri1 = await AMS.readNifti(datadir + 'bert_brain.nii.gz');
    });

    it('Should get the dimensions right', () => {
      assert(mri1.dim[0]===256 && mri1.dim[1]===256 && mri1.dim[2]===256);
    });

    it('Should load a mgz file', async () => {
      mri2 = await AMS.readMGZ(datadir + 'bert_brain.mgz');
    });

    it('Should get the dimensions right', () => {
      assert(mri2.dim[0]===256 && mri2.dim[1]===256 && mri2.dim[2]===256);
    });

    it('Should recognize nii.gz from a filename', () => {
      const ext = AMS._filetypeFromFilename("/path/to/mri.nii.gz");
      assert.equal(ext, "nii.gz");
    });

    it('Should recognize mgz from a filename', () => {
      const ext = AMS._filetypeFromFilename("/path/to/mri.mgz");
      assert.equal(ext, "mgz");
    });

    it('Should return undefined if filename is not nii.gz nor mgz', () => {
      const ext = AMS._filetypeFromFilename("/path/to/mri.foo");
      assert(typeof ext === "undefined");
    });

    it('Subtract vectors correctly', () => {
      const res = AMS.subVecVec([1, 2, 3], [2, 3, 4]);
      assert(res[0] === -1 && res[1] === -1 && res[2] === -1);
    });
  });

  describe('Painting', async () => {
    it('Convert screen coordinates to volume index', async () => {
      const s = [10, 20, 30];
      const mri = {
        s2v: { X:99, dx:-1, x:0, Y:0, dy:1, y:2, Z:299, dz:-1, z:1},
        dim: [100, 200, 300]
      };
      const i = AMS._screen2index(s, mri);
      assert.equal(i, 5583089);
    });
  });

  describe('Database', async () => {
    it('Find user name given their nickname', async () => {
      const data = {type: "userNameQuery", metadata: {nickname: "r03ert0"}};
      const result = await AMS.queryUserName(data);
      assert.equal(result[0].name, "Roberto Toro");
    });

    it('Find user nickname given their name', async () => {
      const data = {type: "userNameQuery", metadata: {name: "Roberto Toro"}};
      const result = await AMS.queryUserName(data);
      assert.equal(result[0].nickname, "r03ert0");
    });

    it('Find project', async () => {
      const data = {type: "projectNameQuery", metadata: {name: "test"}};
      const result = await AMS.queryProjectName(data);
      assert.equal(result.name, "Test");
    });

    it('Find similar project names', async () => {
      const data = {type: "similarProjectNamesQuery", metadata: {projectName: "tes"}};
      const result = await AMS.querySimilarProjectNames(data);
      assert.equal(result[0].name, "Test");
    });
  });

  describe('Volume slice server', async () => {
    let mri;

    it('Should load a nii.gz file', async () => {
      mri = await AMS.readNifti(datadir + 'bert_brain.nii.gz');
    });

    it('Serve one slice', async () => {
      const view = 'cor';
      const slice = 50;
      const jpg = await AMS.drawSlice(mri, view, slice);
      const newPath = "./test/images/slice-bert-cor-50.jpg";
      const refPath = "./test/data/reference-images/slice-bert-cor-50.jpg";
      fs.writeFileSync(newPath, jpg.data);
      const diff = compareImages(newPath, refPath);
      assert(diff<10);
    });
  });
});

// Buffer.compare(atlasmakerServer.niiTag, "");
