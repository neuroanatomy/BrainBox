'use strict';

const fs = require('fs');
var assert = require('chai').assert;
const chai = require('chai');
const chaiHttp = require('chai-http');

const url = "http://localhost:3001";

chai.use(chaiHttp);

describe('/mri route', () => {
  it('get("/") should return status 200', async () => {
    const res = await chai.request(url)
      .get('/');
    assert.equal(res.statusCode, 200);
  });


  it('get("/mri/json/") should get an error message requesting page', async () => {
    const res = await chai.request(url).get('/mri/json/');
    const {body} = res;
    const expected = {error: "Provide the parameter 'page'"};
    assert.deepEqual(body, expected);
  });

  it('get("/mri/json?page=0") should return an array with >=1 file', async () => {
    const res = await chai.request(url).get('/mri/json?page=0')
        .query({page: 0});
    const {body} = res;
    assert(Array.isArray(body));
    assert.isAtLeast(body.length, 1);
  });

  it('get(`/mri/json?url=`) with existing url should return an array', async () => {
    const mriURL = `"https://zenodo.org/record/44855/files/MRI-n4.nii.gz?download=1"`;
    const res = await chai
        .request(url)
        .get('/mri/json')
        .query({url: mriURL});
    const {body} = res;
    const expectedKeys = ["location", "param", "msg", "value"];
    assert(Array.isArray(body));
    assert.hasAllKeys(body[0], expectedKeys);
  });
});
