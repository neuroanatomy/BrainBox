'use strict';

const fs = require('fs');
var assert = require('chai').assert;
const chai = require('chai');
const chaiHttp = require('chai-http')

const url = "http://localhost:3001";

chai.use(chaiHttp);

describe('/user route', () => {
  it('get("/") should return status 200', async () => {
    const res = await chai.request(url)
      .get('/');
      // .query({ project: 'test' });
    assert.equal(res.statusCode, 200);
  });

  it('get("/user/json/") should get an error message requesting page', async () => {
    const res = await chai.request(url).get('/user/json/');
    const {body} = res;
    const expected = {error: "Provide the parameter 'page'"};
    assert.deepEqual(body, expected);
  });

  it('get("/user/json?page=0") should return an array', async () => {
    const res = await chai.request(url).get('/user/json?page=0')
      .query({page: 0});
    const {body} = res;
    assert(Array.isArray(body));
  });

  it('get("/user/json/r03ert0") should return status 200', async () => {
    const res = await chai.request(url).get('/user/json/r03ert0');
    assert.equal(res.statusCode, 200);
  });

  it('get("/user/json/r03ert0/files") should return an object with an array of files', async () => {
    const res = await chai.request(url).get('/user/json/r03ert0/files');
    const {body} = res;
    assert.isObject(body);
    assert.equal(body.success, true);
    assert.isArray(body.list);
  });

  it('get("/user/json/r03ert0/atlas") should return an object with an array of atlas', async () => {
    const res = await chai.request(url).get('/user/json/r03ert0/atlas');
    const {body} = res;
    assert.isObject(body);
    assert.equal(body.success, true);
    assert.isArray(body.list);
  });

  it('get("/user/json/r03ert0/projects") should return an object with an array of projects', async () => {
    const res = await chai.request(url).get('/user/json/r03ert0/projects');
    const {body} = res;
    assert.isObject(body);
    assert.equal(body.success, true);
    assert.isArray(body.list);
  });

  it('get("/user/r03ert0") should return status 200', async () => {
    const res = await chai.request(url).get('/user/json/r03ert0');
    assert.equal(res.statusCode, 200);
  });

  it('get("/user/json/r03ert0") should return expected values', async () => {
    const res = await chai.request(url).get('/user/json/r03ert0');
    const {body} = res;
    const expected = {
      name: 'Roberto Toro',
      nickname: 'r03ert0',
      url: 'http://neuroanatomy.github.io',
      brainboxURL: '/user/r03ert0'
    };
    assert.equal(body.name, expected.name);
    assert.equal(body.nickname, expected.nickname);
    assert.equal(body.url, expected.url);
    assert.equal(body.brainboxURL, expected.brainboxURL);
  });
});
