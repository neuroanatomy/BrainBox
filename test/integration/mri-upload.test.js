'use strict';

const path = require('path');
const chai = require('chai');
const {assert} = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');

describe('TESTING MRI UPLOAD AND RESET', function () {
  // eslint-disable-next-line no-invalid-this
  this.timeout(U.longTimeout);

  let mriInfo;

  before(async function () {
    // Download test MRI so it's in the DB
    let shouldContinue = true;
    while (shouldContinue) {
      // eslint-disable-next-line no-await-in-loop
      const res = await chai.request(U.serverURL).post('/mri/json')
        .send({
          url: U.localBertURL,
          token: U.testToken + U.userFoo.nickname
        });
      const {body} = res;
      shouldContinue = (body.success !== true);

      if (shouldContinue) {
        // eslint-disable-next-line no-await-in-loop
        await U.delay(U.shortTimeout);
      }
    }

    // Fetch MRI info for use in tests
    const res = await chai.request(U.serverURL).get('/mri/json')
      .query({url: U.localBertURL});
    mriInfo = res.body;
  });

  after(async function () {
    // Clean up: remove the MRI from db and disk
    if (mriInfo) {
      const dirPath = './public' + mriInfo.url;
      await U.removeMRI({dirPath, srcURL: U.localBertURL});
    }
  });

  describe('GET /mri/upload (deprecated token page)', function () {
    it('should return a deprecation message', async function () {
      const res = await chai.request(U.serverURL).get('/mri/upload');
      assert.equal(res.statusCode, 200);
      assert.include(res.text, 'deprecated');
    });
  });

  describe('POST /mri/upload', function () {
    it('should return 403 without any body parameters', async function () {
      const res = await chai.request(U.serverURL).post('/mri/upload');
      assert.equal(res.statusCode, 403);
    });

    it('should return 403 with missing required fields', async function () {
      const res = await chai.request(U.serverURL).post('/mri/upload')
        .field('url', U.localBertURL)
        .field('atlasName', 'TestAtlas');
      // missing atlasProject, atlasLabelSet, token
      assert.equal(res.statusCode, 403);
    });

    it('should return 403 with an invalid token', async function () {
      const res = await chai.request(U.serverURL).post('/mri/upload')
        .field('url', U.localBertURL)
        .field('atlasName', 'TestAtlas')
        .field('atlasProject', 'TestProject')
        .field('atlasLabelSet', 'cerebrum.json')
        .field('token', 'invalidtoken123')
        .attach('atlas', path.join(__dirname, '../data/bert_aseg.nii.gz'));
      assert.equal(res.statusCode, 403);
    });

    it('should return 403 when no file is attached', async function () {
      const res = await chai.request(U.serverURL).post('/mri/upload')
        .field('url', U.localBertURL)
        .field('atlasName', 'TestAtlas')
        .field('atlasProject', 'TestProject')
        .field('atlasLabelSet', 'cerebrum.json')
        .field('token', U.testToken + U.userFoo.nickname);
      assert.equal(res.statusCode, 403);
    });

    it('should upload an atlas .nii.gz file with valid params', async function () {
      const res = await chai.request(U.serverURL).post('/mri/upload')
        .field('url', U.localBertURL)
        .field('atlasName', 'UploadTestAtlas')
        .field('atlasProject', 'UploadTestProject')
        .field('atlasLabelSet', 'cerebrum.json')
        .field('token', U.testToken + U.userFoo.nickname)
        .attach('atlas', path.join(__dirname, '../data/bert_aseg.nii.gz'));
      assert.equal(res.statusCode, 200);
      assert.isObject(res.body);
      assert.equal(res.body.source, U.localBertURL);

      // Verify the uploaded atlas appears in the MRI's atlas list
      const atlasEntry = res.body.mri.atlas.find(
        (a) => a.name === 'UploadTestAtlas' && a.project === 'UploadTestProject'
      );
      assert.exists(atlasEntry, 'Uploaded atlas should appear in the atlas list');
      assert.equal(atlasEntry.labels, 'cerebrum.json');
      assert.equal(atlasEntry.owner, U.userFoo.nickname);
      assert.equal(atlasEntry.type, 'volume');
      assert.match(atlasEntry.filename, /\.nii\.gz$/);
    });

    it('should reflect the upload in GET /mri/json', async function () {
      const res = await chai.request(U.serverURL).get('/mri/json')
        .query({url: U.localBertURL});
      assert.equal(res.statusCode, 200);
      const atlasEntry = res.body.mri.atlas.find(
        (a) => a.name === 'UploadTestAtlas' && a.project === 'UploadTestProject'
      );
      assert.exists(atlasEntry, 'Uploaded atlas should persist in DB');
    });

    it('should replace an existing atlas with the same name and project', async function () {
      const res = await chai.request(U.serverURL).post('/mri/upload')
        .field('url', U.localBertURL)
        .field('atlasName', 'UploadTestAtlas')
        .field('atlasProject', 'UploadTestProject')
        .field('atlasLabelSet', 'cerebellum.json')
        .field('token', U.testToken + U.userFoo.nickname)
        .attach('atlas', path.join(__dirname, '../data/bert_aseg.nii.gz'));
      assert.equal(res.statusCode, 200);

      // Should have exactly one atlas with this name/project, not two
      const matching = res.body.mri.atlas.filter(
        (a) => a.name === 'UploadTestAtlas' && a.project === 'UploadTestProject'
      );
      assert.equal(matching.length, 1, 'Duplicate atlas entries should not exist');
      assert.equal(matching[0].labels, 'cerebellum.json', 'Atlas should have updated labelSet');
    });
  });

  describe('GET /mri/reset', function () {
    it('should re-read MRI metadata from the file on disk', async function () {
      const res = await chai.request(U.serverURL).get('/mri/reset')
        .query({url: U.localBertURL});
      assert.equal(res.statusCode, 200);
      assert.isObject(res.body);
      assert.isArray(res.body.dim);
      assert.equal(res.body.dim.length, 3);
      assert.isArray(res.body.pixdim);
      assert.equal(res.body.pixdim.length, 3);
      assert.isArray(res.body.voxel2world);
      assert.isArray(res.body.worldOrigin);
    });

    it('should update the DB with refreshed metadata', async function () {
      const resetRes = await chai.request(U.serverURL).get('/mri/reset')
        .query({url: U.localBertURL});

      // Verify DB matches reset response
      const mriRes = await chai.request(U.serverURL).get('/mri/json')
        .query({url: U.localBertURL});
      assert.deepEqual(mriRes.body.dim, resetRes.body.dim);
      assert.deepEqual(mriRes.body.pixdim, resetRes.body.pixdim);
      assert.deepEqual(mriRes.body.voxel2world, resetRes.body.voxel2world);
      assert.deepEqual(mriRes.body.worldOrigin, resetRes.body.worldOrigin);
    });
  });
});
