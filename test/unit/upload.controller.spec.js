/* eslint-disable no-empty-function */
const assert = require('assert');
const uploadController = require('../../controller/mri/upload.controller');
require('mocha-sinon');
const sinon = require('sinon');
const httpMocks = require('node-mocks-http');
const U = require('../utils');

describe('Upload Controller: ', function () {
  let db;
  before(function () {
    db = U.getDB();
  });

  describe('Validator function() ', function () {
    it('should perform the validations correctly', async function () {
      const req = httpMocks.createRequest({
        body: {
          url: 'abc.com',
          atlasName: 'MyAtlas',
          atlasProject: 'Visualisation',
          atlasLabelSet: 'SampleLabelSet',
          token: 'jnqpincpienfcpewnfcpewn123'
        },
        query: {},
        params: {},
        value: 0
      });
      const res = httpMocks.createResponse();
      await uploadController.validator(req, res, () => { });
      assert.strictEqual(res.statusCode, 200);
    });

    it('should throw errors if any validation fails', async function () {
      const req = httpMocks.createRequest({
        body: {
          url: '',
          token: ''
        },
        query: {},
        params: {},
        value: 0
      });
      const res = httpMocks.createResponse();
      await uploadController.validator(req, res, () => { });
      assert(res.statusCode, 403);
      const resData = res._getData();
      assert(Array.isArray(resData));
      assert.strictEqual(resData.length, 8);
    });
  });


  describe('otherValidations function() ', function () {
    it('should perform the other validations successfully', async function () {
      const req = {
        body: {
          token: U.testToken + 'foo',
          url: ''
        },
        files: [],
        query: {},
        params: {},
        value: 0,
        db: db
      };
      const resSpy = sinon.spy();
      const jsonSpy = sinon.spy();
      const sendStub = sinon.stub().returns({ end: resSpy });
      const res = {
        status: sinon.stub().returns({ send: sendStub, json: sinon.stub().returns({ end: jsonSpy }) })
      };
      await uploadController.otherValidations(req, res, () => { });
      assert.strictEqual(jsonSpy.callCount, 1);
      assert.strictEqual(resSpy.callCount, 0);
      sinon.restore();
    });

    it('should not accept a token that has expired.', async function () {
      const req = {
        body: {
          token: U.testToken + 'foo',
          url: ''
        },
        files: [],
        query: {},
        params: {},
        value: 0,
        db: db
      };
      sinon.useFakeTimers(new Date().getTime() + 365 * 86400 * 1000);
      const resSpy = sinon.spy();
      const jsonSpy = sinon.spy();
      const sendStub = sinon.stub().returns({ end: resSpy });
      const res = {
        status: sinon.stub().returns({ send: sendStub, json: sinon.stub().returns({ end: jsonSpy }) })
      };
      await uploadController.otherValidations(req, res, () => { });
      assert.strictEqual(jsonSpy.callCount, 0);
      assert.strictEqual(resSpy.callCount, 1);
      assert.strictEqual(sendStub.args[0][0], 'ERROR: Token expired');
      sinon.restore();
    });

    it('should throw an error if the token is invalid', async function () {
      const req = {
        body: {
          token: '',
          url: ''
        },
        files: [],
        query: {},
        params: {},
        value: 0,
        db: db
      };
      const resSpy = sinon.spy();
      const jsonSpy = sinon.spy();
      const sendStub = sinon.stub().returns({ end: resSpy });
      const res = {
        status: sinon.stub().returns({ send: sendStub, json: sinon.stub().returns({ end: jsonSpy }) })
      };
      await uploadController.otherValidations(req, res, () => { });
      assert.strictEqual(jsonSpy.callCount, 0);
      assert.strictEqual(resSpy.callCount, 1);
      assert.strictEqual(sendStub.args[0][0], 'ERROR: Cannot find token');
      sinon.restore();
    });
  });
});
