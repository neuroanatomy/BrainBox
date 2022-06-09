'use strict';

const chai = require('chai');
var { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');

describe('TESTING THE /project ROUTE', function () {
  // eslint-disable-next-line no-invalid-this
  this.timeout(U.longTimeout);

  before(async function () {
    // add one MRI
    let shouldContinue = true;
    while (shouldContinue) {
      // eslint-disable-next-line no-await-in-loop
      const res = await chai.request(U.serverURL).post('/mri/json')
        .send({
          url: U.localBertURL,
          token: U.testToken + U.userFoo.nickname
        });
      const { body } = res;
      // console.log(body);
      shouldContinue = (body.success !== true);

      // eslint-disable-next-line no-await-in-loop
      await U.delay(U.shortTimeout);
    }
  });

  describe('Get project information', function () {
    it('get("/") should return status 200', async function () {
      const res = await chai.request(U.serverURL)
        .get('/');
      assert.equal(res.statusCode, 200);
    });

    it('get("/project/json/") should get an error message requesting page', async function () {
      const { body } = await chai.request(U.serverURL).get('/project/json/');
      const expected = { error: 'Provide the parameter \'page\'' };
      assert.deepEqual(body, expected);
    });

    it('get("/project/json?page=0") should return an array', async function () {
      const { body } = await chai.request(U.serverURL).get('/project/json?page=0')
        .query({ page: 0 });
      assert(Array.isArray(body));
    });

    it('get("/project/json/test") should return status 200', async function () {
      const res = await chai.request(U.serverURL).get(`/project/json/${U.projectTest.shortname}`);
      assert.equal(res.statusCode, 200);
    });

    it('get("/project/json/test") should return an object with appropriate keys', async function () {
      const { body } = await chai.request(U.serverURL).get(`/project/json/${U.projectTest.shortname}`);
      const expectedKeys = [
        'name', 'shortname', 'url', 'brainboxURL', 'created', 'owner',
        'collaborators', 'files', 'annotations', 'description',
        'modified', 'modifiedBy'
      ];
      assert.hasAllKeys(body, expectedKeys);
    });

    it('get("/project/json/test/files") should return an array with >=1 file', async function () {
      const { body } = await chai.request(U.serverURL)
        .get(`/project/json/${U.projectTest.shortname}/files`)
        .query({ start: 0, length: 10 });
      assert.isArray(body);
      assert.isAtLeast(body.length, 1);
    });

    it('get("/project/json/test/files") should return objects with appropriate keys', async function () {
      const { body } = await chai.request(U.serverURL)
        .get(`/project/json/${U.projectTest.shortname}/files`)
        .query({ start: 0, length: 10 });
      // only the first mri was fetched, dim info can be missing for the others
      const expectedKeys1 = [
        '_id', 'filename', 'success', 'source', 'url', 'included',
        'dim', 'pixdim', 'voxel2world', 'worldOrigin',
        'owner', 'mri', 'modified', 'modifiedBy', 'name'
      ];
      const expectedKeys2 = [
        '_id', 'filename', 'source', 'url', 'included',
        'owner', 'mri', 'modified', 'modifiedBy', 'name'
      ];
      // console.log(body);
      assert.isArray(body);
      assert.containsAllKeys(body[0], expectedKeys1);
      for (let i = 1; i < 5; i++) {
        assert.containsAllKeys(body[i], expectedKeys2);
      }
    });

    it('get("/project/json/test/files") should return only sources and names if required', async function () {
      const { body } = await chai.request(U.serverURL)
        .get(`/project/json/${U.projectTest.shortname}/files`)
        .query({ start: 0, length: 10, names: true });
      assert.isArray(body);
      assert.hasAllKeys(body[0], ['source', 'name']);
    });

    it('Remove test MRI from db and disk', async function () {
      // remove the MRI
      const res = await chai.request(U.serverURL).get('/mri/json')
        .query({
          url: U.localBertURL
        });
      const { body } = res;
      const dirPath = './public' + body.url;
      await U.removeMRI({ dirPath, srcURL: U.localBertURL });
    });
  });
});
