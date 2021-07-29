/* eslint-disable no-await-in-loop */
/* eslint-disable no-invalid-this */
/* eslint-disable prefer-destructuring */
/* eslint-disable no-unused-vars */
'use strict';

const fs = require('fs');
const chai = require('chai');
var assert = chai.assert;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');

describe('TESTING THE /user ROUTE', function () {
  this.timeout(U.mediumTimeout);

  describe('Obtaining user information', function () {
    it('Add test MRI', async function () {
      await chai.request(U.serverURL).get('/----1');
      let shouldContinue = true;
      while(shouldContinue) {
        const res = await chai.request(U.serverURL).post('/mri/json')
          .send({
            url: U.localBertURL,
            token: U.testToken + U.userFoo.nickname
          });
        const {body} = res;
        // console.log(body);
        shouldContinue = (body.success !== true);

        await U.delay(U.shortTimeout);
      }
      await chai.request(U.serverURL).get('/----1_end');
    }).timeout(U.longTimeout);

    it('get("/") should return status 200', async function () {
      const res = await chai.request(U.serverURL).get('/');
      assert.equal(res.statusCode, 200);
    });

    it('get("/user/json/") should get an error message requesting page', async function () {
      const res = await chai.request(U.serverURL).get('/user/json/');
      const {body} = res;
      const expected = {error: "Provide the parameter 'page'"};
      assert.deepEqual(body, expected);
    });

    it('get("/user/json?page=0") should return an array', async function () {
      const res = await chai.request(U.serverURL).get('/user/json?page=0')
        .query({page: 0});
      const {body} = res;
      assert(Array.isArray(body));
    });

    it('get("/user/json/foo") should return status 200', async function () {
      const res = await chai.request(U.serverURL).get(`/user/json/${U.userFoo.nickname}`);
      assert.equal(res.statusCode, 200);
    });

    it('get("/user/json/foo/files") should return an object with an array of files', async function () {
      const res = await chai.request(U.serverURL).get(`/user/json/${U.userFoo.nickname}/files`)
        .query({start:0, length:100});
      const {body} = res;
      assert.isObject(body);
      assert.equal(body.success, true);
      assert.isArray(body.list);
    });

    it('get("/user/json/foo/atlas") should return an object with an array of atlas', async function () {
      const res = await chai.request(U.serverURL).get(`/user/json/${U.userFoo.nickname}/atlas`)
        .query({start:0, length:100});
      const {body} = res;
      assert.isObject(body);
      assert.equal(body.success, true);
      assert.isArray(body.list);
    });

    it('get("/user/json/foo/projects") should return an object with an array of projects', async function () {
      const res = await chai.request(U.serverURL).get(`/user/json/${U.userFoo.nickname}/projects`)
        .query({start:0, length:100});
      const {body} = res;
      assert.isObject(body);
      assert.equal(body.success, true);
      assert.isArray(body.list);
    });

    it('get("/user/foo") should return status 200', async function () {
      const res = await chai.request(U.serverURL).get(`/user/${U.userFoo.nickname}`);
      assert.equal(res.statusCode, 200);
    });

    it('get("/user/json/foo") should return expected values', async function () {
      const res = await chai.request(U.serverURL).get(`/user/json/${U.userFoo.nickname}`);
      const {body} = res;
      const expected = U.userFoo;
      assert.equal(body.name, expected.name);
      assert.equal(body.nickname, expected.nickname);
      assert.equal(body.url, expected.url);
      assert.equal(body.brainboxURL, expected.brainboxURL);
    });

    it('Remove test MRI from db and disk', async function () {
      // remove the MRI
      const res = await chai.request(U.serverURL).get('/mri/json')
        .query({
          url: U.localBertURL
        });
      const {body} = res;
      const dirPath = "./public" + body.url;
      await U.removeMRI({dirPath, srcURL: U.localBertURL});
    });
  });
});
