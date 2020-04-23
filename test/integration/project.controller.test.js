'use strict';

const fs = require('fs');
const chai = require('chai');
var assert = chai.assert;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');

describe('TESTING THE /project ROUTE', function () {
  this.timeout(U.longTimeout);

  before( async function () {
    // add one MRI
    let shouldContinue = true;
    while(shouldContinue) {
      const res = await chai.request(U.serverURL).post('/mri/json').send({
        url: U.localBertURL,
        token: U.testToken + U.userFoo.nickname
      });
      const {body} = res;
      // console.log(body);
      shouldContinue = (body.success !== true);

      await U.delay(U.shortTimeout);
    }
  });

  describe('Get project information', function () {
    it('get("/") should return status 200', function (done) {
      chai.request(U.serverURL)
        .get('/')
        .end(function (err, res) {
          assert.equal(res.statusCode, 200);
          done();
        });
    });

    it('get("/project/json/") should get an error message requesting page', function (done) {
      chai.request(U.serverURL).get('/project/json/')
      .end(function (err, res) {
        const {body} = res;
        const expected = {error: "Provide the parameter 'page'"};
        assert.deepEqual(body, expected);
        done();
      });
    });

    it('get("/project/json?page=0") should return an array', function (done) {
      chai.request(U.serverURL).get('/project/json?page=0')
          .query({page: 0})
          .end(function (err, res) {
            const {body} = res;
            assert(Array.isArray(body));
            done();
          });
    });

    it('get("/project/json/test") should return status 200', function (done) {
      chai.request(U.serverURL).get(`/project/json/${U.projectTest.shortname}`)
      .end(function (err, res) {
        assert.equal(res.statusCode, 200);
        done();
      });
    });

    it('get("/project/json/test") should return an object with appropriate keys', function (done) {
      chai.request(U.serverURL).get(`/project/json/${U.projectTest.shortname}`)
      .end(function (err, res) {
        const {body} = res;
        const expectedKeys = [
            "name", "shortname", "url", "brainboxURL", "created", "owner",
            "collaborators", "files", "annotations", "description",
            "modified", "modifiedBy"
        ];
        assert.hasAllKeys(body, expectedKeys);
        done();
      });
    });

    it('get("/project/json/test/files") should return an array with >=1 file', function (done) {
      chai.request(U.serverURL)
          .get(`/project/json/${U.projectTest.shortname}/files`)
          .query({start: 0, length: 10})
          .end(function (err, res) {
            const {body} = res;
            assert.isArray(body);
            assert.isAtLeast(body.length, 1);
            done();
          });
    });

    it('get("/project/json/test/files") should return objects with appropriate keys', function (done) {
      chai.request(U.serverURL)
          .get(`/project/json/${U.projectTest.shortname}/files`)
          .query({start: 0, length: 10})
          .end(function(err, res) {
            const {body} = res;
            const expectedKeys1 = [
                "_id", "filename", "success", "source", "url", "included",
                "dim", "pixdim", "voxel2world", "worldOrigin",
                "owner", "mri", "modified", "modifiedBy", "name"
            ];
            const expectedKeys2 = ["source", "name"];
            // console.log(body);
            assert.isArray(body);
            assert.containsAllKeys(body[0], expectedKeys1);
            assert.containsAllKeys(body[4], expectedKeys2);
            done();
          });
    });

    it('get("/project/json/test/files") should return only sources and names if required', function (done) {
      chai.request(U.serverURL)
        .get(`/project/json/${U.projectTest.shortname}/files`)
        .query({start: 0, length: 10, names: true})
        .end(function (err, res) {
          const {body} = res;
          assert.isArray(body);
          assert.hasAllKeys(body[0], ["source", "name"]);
          done();
        });
    });

    it('Remove test MRI from db and disk', async function () {
      // remove the MRI
      const res = await chai.request(U.serverURL).get('/mri/json').query({
        url: U.localBertURL
      });
      const {body} = res;
      const dirPath = "./public" + body.url;
      await U.removeMRI({dirPath, srcURL: U.localBertURL});
    });
  });
});
