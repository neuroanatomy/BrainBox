'use strict';

const chai = require('chai');
var {assert} = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');

describe('TESTING THE /mri ROUTE', function () {
  describe('/mri route', function () {
    it('get("/") should return status 200', async function () {
      const res = await chai.request(U.serverURL)
        .get('/');
      assert.equal(res.statusCode, 200);
    });

    it('Should return an error message requesting page for an empty GET /mri/json/', async function () {
      const res = await chai.request(U.serverURL).get('/mri/json/');
      const { body } = res;
      const expected = { error: "Provide the parameter 'page'" };
      assert.deepEqual(body, expected);
    });

    it('POST /mri/json without parameters should fail', async function () {
      const res = await chai.request(U.serverURL).post('/mri/json');
      assert.equal(res.statusCode, 403);
    });

    it('POST /mri/json with url should start a download', async function () {
      let shouldContinue = true;
      var body, res;
      while (shouldContinue) {
        // eslint-disable-next-line no-await-in-loop
        res = await chai.request(U.serverURL).post('/mri/json')
          .send({
            url: U.localBertURL,
            token: U.testToken + U.userFoo.nickname
          });
        ({body} = res);
        // console.log(body);
        shouldContinue = (body.success !== true);

        // eslint-disable-next-line no-await-in-loop
        await U.delay(U.shortTimeout);
      }
      // console.log(body.success, shouldContinue, body);
      assert.equal(res.statusCode, 200);
    }).timeout(U.longTimeout);

    it('POST /mri/json with url should return MRI info once the file is downloaded', async function () {
      await U.delay(U.shortTimeout);
      const res = await chai.request(U.serverURL).post('/mri/json')
        .send({
          url: U.localBertURL,
          token: U.testToken + U.userFoo.nickname
        });
      const { body } = res;
      // console.log(body);
      const expectedKeys = [
        "_id", "filename", "success", "source", "url", "included",
        "dim", "pixdim", "voxel2world", "worldOrigin",
        "owner", "mri", "modified", "modifiedBy", "name"
      ];
      assert.hasAllKeys(body, expectedKeys);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.source, U.localBertURL);
      assert.strictEqual(res.statusCode, 200);
    }).timeout(U.mediumTimeout);

    it('GET /mri/json?page=0 should return an array with >=1 file', async function () {
      const res = await chai.request(U.serverURL).get('/mri/json?page=0')
        .query({ page: 0 });
      const { body } = res;
      assert(Array.isArray(body));
      assert.isAtLeast(body.length, 1);
    });

    it('GET /mri/json should provide MRI info for an existing file', async function () {
      const res = await chai.request(U.serverURL).get('/mri/json')
        .query({ url: U.localBertURL });
      const { body } = res;
      const expectedKeys = [
        "_id", "filename", "success", "source", "url", "included",
        "dim", "pixdim", "voxel2world", "worldOrigin",
        "owner", "mri", "modified", "modifiedBy", "name"
      ];
      assert.isObject(body);
      assert.hasAllKeys(body, expectedKeys);
    });

    it('Remove test MRI from db and disk', async function () {
      // remove the MRI
      const res = await chai.request(U.serverURL).get('/mri/json')
        .query({
          url: U.localBertURL
        });
      const { body } = res;
      const dirPath = "./public" + body.url;
      await U.removeMRI({ dirPath, srcURL: U.localBertURL });
    });
  });
});
