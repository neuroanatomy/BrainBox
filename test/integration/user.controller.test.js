'use strict';

const fs = require('fs');
var assert = require('chai').assert;
const chai = require('chai');
const chaiHttp = require('chai-http')
chai.use(chaiHttp);
const U = require('../utils.js');

describe('TESTING THE /user ROUTE', () => {
  it('get("/") should return status 200', async () => {
    const res = await chai.request(U.serverURL).get('/');
    assert.equal(res.statusCode, 200);
  });

  it('get("/user/json/") should get an error message requesting page', async () => {
    const res = await chai.request(U.serverURL).get('/user/json/');
    const {body} = res;
    const expected = {error: "Provide the parameter 'page'"};
    assert.deepEqual(body, expected);
  });

  it('get("/user/json?page=0") should return an array', async () => {
    const res = await chai.request(U.serverURL).get('/user/json?page=0')
      .query({page: 0});
    const {body} = res;
    assert(Array.isArray(body));
  });

  it('get("/user/json/foo") should return status 200', async () => {
    const res = await chai.request(U.serverURL).get(`/user/json/${U.userFoo.nickname}`);
    assert.equal(res.statusCode, 200);
  });

  it('get("/user/json/foo/files") should return an object with an array of files', async () => {
    const res = await chai.request(U.serverURL).get(`/user/json/${U.userFoo.nickname}/files`);
    const {body} = res;
    assert.isObject(body);
    assert.equal(body.success, true);
    assert.isArray(body.list);
  });

  it('get("/user/json/foo/atlas") should return an object with an array of atlas', async () => {
    const res = await chai.request(U.serverURL).get(`/user/json/${U.userFoo.nickname}/atlas`);
    const {body} = res;
    assert.isObject(body);
    assert.equal(body.success, true);
    assert.isArray(body.list);
  });

  it('get("/user/json/foo/projects") should return an object with an array of projects', async () => {
    const res = await chai.request(U.serverURL).get(`/user/json/${U.userFoo.nickname}/projects`);
    const {body} = res;
    assert.isObject(body);
    assert.equal(body.success, true);
    assert.isArray(body.list);
  });

  it('get("/user/foo") should return status 200', async () => {
    const res = await chai.request(U.serverURL).get(`/user/${U.userFoo.nickname}`);
    assert.equal(res.statusCode, 200);
  });

  it('get("/user/json/foo") should return expected values', async () => {
    const res = await chai.request(U.serverURL).get(`/user/json/${U.userFoo.nickname}`);
    const {body} = res;
    const expected = U.userFoo;
    assert.equal(body.name, expected.name);
    assert.equal(body.nickname, expected.nickname);
    assert.equal(body.url, expected.url);
    assert.equal(body.brainboxURL, expected.brainboxURL);
  });
});
