'use strict';

const fs = require('fs');
var assert = require('chai').assert;
const chai = require('chai');
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');

describe('TESTING THE /mri ROUTE', async () => {
  before(async () => {
      // insert test token
      await U.insertTestTokenForUser("foo");
  });

  after(async () => {
    // remove MRI from db and file system
    const res = await chai.request(U.serverURL).post('/mri/json').send({
      url: U.localBertURL,
      token: U.testToken
    });
    const {body} = res;
    const dirPath = "./public" + body.url;
    await U.removeMRI({dirPath, srcURL: U.localBertURL});

    // remove test token
    await U.removeTestToken();
  });

  describe('/mri route', async () => {
    it('get("/") should return status 200', async () => {
      const res = await chai.request(U.serverURL)
        .get('/');
      assert.equal(res.statusCode, 200);
    });

    it('Should return an error message requesting page for an empty GET /mri/json/', async () => {
      const res = await chai.request(U.serverURL).get('/mri/json/');
      const {body} = res;
      const expected = {error: "Provide the parameter 'page'"};
      assert.deepEqual(body, expected);
    });

    it('GET /mri/json?page=0 should return an array with >=1 file', async () => {
      const res = await chai.request(U.serverURL).get('/mri/json?page=0')
          .query({page: 0});
      const {body} = res;
      assert(Array.isArray(body));
      assert.isAtLeast(body.length, 1);
    });

    it('POST /mri/json without parameters should fail', async () => {
      const res = await chai.request(U.serverURL).post('/mri/json');
      assert.equal(res.statusCode, 403);
    });

    // It's fine to post /mri/json without being authenticated
    // it('POST /mri/json with token but without url should fail', async () => {
    //   const res = await chai.request(U.serverURL).post('/mri/json').send({token: U.testToken});
    //   assert.equal(res.statusCode, 403);
    // });

    // it('POST /mri/json with url but without token should fail', async () => {
    //   const res = await chai.request(U.serverURL).post('/mri/json').send({url: U.localBertURL});
    //   assert.equal(res.statusCode, 403);
    // });

    it('POST /mri/json with url should start a download', async () => {
      let res = await chai.request(U.serverURL).post('/mri/json').send({
        url: U.localBertURL,
        token: U.testToken
      });
      let {body} = res;
      if(body.success === true) {
        // console.log("MRI was already downloaded. Rimraf it and start again");
        const dirPath = "./public" + body.url;
        await U.removeMRI({dirPath, srcURL: U.localBertURL});
      }

      res = await chai.request(U.serverURL).post('/mri/json').send({
        url: U.localBertURL,
        token: U.testToken
      });
      body = res.body;
      assert.equal(body.success, "downloading");
      assert.equal(res.statusCode, 200);
    });

    it('POST /mri/json with url should return MRI info once the file is downloaded', async () => {
      await U.delay(U.shortTimeout);
      const res = await chai.request(U.serverURL).post('/mri/json').send({
        url: U.localBertURL
      });
      const {body} = res;
      assert.equal(body.success, true);
      assert.equal(res.statusCode, 200);
    }).timeout(U.mediumTimeout);

    it('GET /mri/json should provide MRI info for an existing file', async () => {
      const res = await chai.request(U.serverURL).get('/mri/json')
          .query({url: U.localBertURL});
      const {body} = res;
      const expectedKeys = [
        "_id", "filename", "success", "source", "url", "included",
        "dim", "pixdim", "voxel2world", "worldOrigin",
        "owner", "mri" // optional keys: "modified", "modifiedBy", "name"
      ];
      assert.isObject(body);
      assert.hasAllKeys(body, expectedKeys);
    });
  });
});
