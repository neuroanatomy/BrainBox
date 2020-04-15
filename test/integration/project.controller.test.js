'use strict';

const fs = require('fs');
var assert = require('chai').assert;
const chai = require('chai');
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');

describe('TESTING THE /project ROUTE', () => {
  it('get("/") should return status 200', async () => {
    const res = await chai.request(U.serverURL)
      .get('/');
    assert.equal(res.statusCode, 200);
  });

  it('get("/project/json/") should get an error message requesting page', async () => {
    const res = await chai.request(U.serverURL).get('/project/json/');
    const {body} = res;
    const expected = {error: "Provide the parameter 'page'"};
    assert.deepEqual(body, expected);
  });

  it('get("/project/json?page=0") should return an array', async () => {
    const res = await chai.request(U.serverURL).get('/project/json?page=0')
        .query({page: 0});
    const {body} = res;
    assert(Array.isArray(body));
  });

  it('get("/project/json/test") should return status 200', async () => {
    const res = await chai.request(U.serverURL).get('/project/json/test');
    assert.equal(res.statusCode, 200);
  });

  it('get("/project/json/test") should return an object with appropriate keys', async () => {
    const res = await chai.request(U.serverURL).get('/project/json/test');
    const {body} = res;
    const expectedKeys = [
        "name", "shortname", "url", "brainboxURL", "created", "owner",
        "collaborators", "files", "annotations", "description",
        "modified", "modifiedBy"
    ];
    assert.hasAllKeys(body, expectedKeys);
  });

  it('get("/project/json/test/files") should return an array with >=1 file', async () => {
    const res = await chai.request(U.serverURL)
        .get('/project/json/test/files')
        .query({start: 0, length: 10});
    const {body} = res;
    assert.isArray(body);
    assert.isAtLeast(body.length, 1);
  });

  it('get("/project/json/test/files") should return objects with appropriate keys', async () => {
    const res = await chai.request(U.serverURL)
        .get('/project/json/test/files')
        .query({start: 0, length: 10});
    const {body} = res;
    const expectedKeys = [
        "_id", "filename", "success", "source", "url", "included",
        "dim", "pixdim", "voxel2world", "worldOrigin",
        "owner", "mri", "modified", "modifiedBy", "name"
    ];
    assert.isArray(body);
    assert.hasAllKeys(body[0], expectedKeys);
  });

  it('get("/project/json/test/files") should return only sources and names if required', async () => {
    const res = await chai.request(U.serverURL)
        .get('/project/json/test/files')
        .query({start: 0, length: 10, names: true});
    const {body} = res;
    const expectedKeys = ["source", "name"];
    assert.isArray(body);
    assert.hasAllKeys(body[0], expectedKeys);
  });
});
