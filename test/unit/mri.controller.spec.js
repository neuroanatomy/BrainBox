var assert = require("assert");
const mriController = require('../../controller/mri/mri.controller');
// const atlasMakerServer = require('../../controller/atlasmakerServer/atlasmakerServer');
const monk = require('monk');
require('mocha-sinon');
const sinon = require('sinon');
var db = monk('localhost:27017/brainbox');
// const U = require('../utils');
const dirname = require('path').resolve(__dirname, '../..');

describe('MRI Controller: ', function () {

  describe('Validator function() ', function() {
    it('should perform the validations correctly', async function () {
      const req = {
        body: {
          url: 'abc.com',
          atlasName: 'MyAtlas',
          atlasProject: 'Visualisation@',
          atlasLabelSet: 'SampleLabelSet',
          token: 'jnqpincpienfcpewnfcpewn123'
        },
        value: 0,
        validationErrors: function() {
          if(req.body.atlasProject) { return null; }

          return new Error('Body has validation errors!');
        }
      };
      const resSpy = sinon.spy();
      const res = {
        status: sinon.stub().returns({ send: resSpy })
      };
      await mriController.validator(req, res, () => { /* do nothing */ });
      assert.strictEqual(resSpy.callCount, 0);
      sinon.restore();
    });

    it('should throw error if validation fails.', async function() {
      const req = {
        body: {
          atlasName: 'MyAtlas',
          atlasLabelSet: 'SampleLabelSet',
          token: 'jnqpincpienfcpewnfcpewn123'
        },
        query: {},
        value: 0,
        validationErrors: function() {
          if(this.body.atlasProject) { return null; }

          return new Error('Body has validation errors!');
        }
      };
      const resSpy = sinon.spy();
      const res = {
        status: sinon.stub().returns({ send: sinon.stub().returns({ end: resSpy })})
      };
      await mriController.validator(req, res, () => { /* do nothing */ });
      assert.strictEqual(resSpy.callCount, 1);
      sinon.restore();
    });
  });


  describe('validatorPost function() ', function () {
    it('should perform the validations correctly', async function () {
      const reqSpy = sinon.spy();
      const urlSpy = sinon.spy();
      const req = {
        body: {
          url: 'abc.com',
          atlasName: 'MyAtlas',
          atlasProject: 'Visualisation@',
          atlasLabelSet: 'SampleLabelSet',
          token: 'jnqpincpienfcpewnfcpewn123'
        },
        query: {},
        params: {},
        value: 0,
        validationErrors: function() {
          return this.body.url ? null : new Error('Invalid url!');
        },
        checkBody: sinon.stub().returns({ notEmpty: reqSpy, isURL: urlSpy })
      };
      const resSpy = sinon.spy();

      const res = {
        status: sinon.stub().returns({ send: sinon.stub().returns({ end: resSpy })})
      };
      await mriController.validatorPost(req, res, () => { /* do nothing */ });
      assert.strictEqual(reqSpy.callCount, 1);
      assert.strictEqual(urlSpy.callCount, 1);
      assert.strictEqual(resSpy.callCount, 0);
      sinon.restore();
    });

    it('should throw errors if validation fails', async function () {
      const reqSpy = sinon.spy();
      const urlSpy = sinon.spy();
      const req = {
        body: {
          atlasName: 'MyAtlas',
          atlasProject: 'Visualisation@',
          atlasLabelSet: 'SampleLabelSet',
          token: 'jnqpincpienfcpewnfcpewn123'
        },
        query: {},
        params: {},
        value: 0,
        validationErrors: function() {
          return this.body.url ? null : new Error('Invalid url!');
        },
        checkBody: sinon.stub().returns({ notEmpty: reqSpy, isURL: urlSpy })
      };
      const resSpy = sinon.spy();

      const res = {
        status: sinon.stub().returns({ send: sinon.stub().returns({ end: resSpy })})
      };
      await mriController.validatorPost(req, res, () => { /* do nothing */ });
      assert.strictEqual(reqSpy.callCount, 1);
      assert.strictEqual(urlSpy.callCount, 1);
      assert.strictEqual(resSpy.callCount, 1);
      sinon.restore();
    });
  });

  describe('MRI function() ', function() {
    it('should return the MRI information when correct input is given', async function() {
      const req = {
        db: db,
        query: {
          url: 'https://s3.amazonaws.com/fcp-indi/data/Projects/ABIDE_Initiative/Outputs/freesurfer/5.1/CMU_a_0050642/mri/T1.mgz'
        },
        dirname,
        headers: {},
        user: {
          username: ''
        },
        session: {
          returnTo: ''
        },
        originalUrl: '',
        isTokenAuthenticated: true,
        tokenUsername: '',
        isAuthenticated: function() {
          return this.isTokenAuthenticated;
        },
        connection: {
          remoteAddress: 'http://localhost:3000'
        }
      };
      const authenticated = sinon.stub(req, 'isAuthenticated').resolves(true);
      const res = {
        render: sinon.spy()
      };
      await mriController.mri(req, res);
      assert.strictEqual(res.render.callCount, 1);
      assert.strictEqual(authenticated.callCount, 2);
      sinon.restore();
    });
  });

  describe('apiMriGet function() ', function() {
    it('should fetch the MRI as directed when the URL is correct', async function() {
      const req = {
        db: db,
        query: {
          url: 'https://s3.amazonaws.com/fcp-indi/data/Projects/ABIDE_Initiative/Outputs/freesurfer/5.1/CMU_a_0050642/mri/T1.mgz',
          download: 'true',
          backups: 'true',
          page: 1
        },
        user: {
          username: ''
        },
        isAuthenticated: function() {
          return Boolean(this.user.username);
        },
        isTokenAuthenticated: false
      };
      const resSpy = sinon.spy();
      const statusSpy = sinon.spy();
      const jsonSpy = sinon.spy();
      const res = {
        send: resSpy,
        status: sinon.stub().returns({ json: statusSpy}),
        json: jsonSpy
      };
      await mriController.apiMriGet(req, res);
      assert.strictEqual(resSpy.callCount, 0);
      assert.strictEqual(statusSpy.callCount, 0);
      assert.strictEqual(jsonSpy.callCount, 1);
      const values = jsonSpy.args;
      assert.ok(values[0][0].source);
      sinon.restore();
    });

    it('should return a paginated list of files if url is empty', async function() {
      const req = {
        db: db,
        query: {
          url: '',
          download: 'true',
          backups: 'true',
          page: 1
        },
        user: {
          username: ''
        },
        isAuthenticated: function() {
          return Boolean(this.user.username);
        },
        isTokenAuthenticated: false
      };
      const resSpy = sinon.spy();
      const statusSpy = sinon.spy();
      const jsonSpy = sinon.spy();
      const res = {
        send: resSpy,
        status: sinon.stub().returns({ json: statusSpy}),
        json: jsonSpy
      };
      await mriController.apiMriGet(req, res);
      assert.strictEqual(jsonSpy.callCount, 1);
      sinon.restore();
    });

    it('should throw an error when the url is invalid', async function() {
      const req = {
        db: db,
        query: {
          url: 'inValidUrl',
          download: 'true',
          backups: 'true',
          page: 1
        },
        user: {
          username: ''
        },
        isAuthenticated: function() {
          return Boolean(this.user.username);
        },
        isTokenAuthenticated: false
      };
      const resSpy = sinon.spy();
      const statusSpy = sinon.spy();
      const jsonSpy = sinon.spy();
      const res = {
        send: resSpy,
        status: sinon.stub().returns({ json: statusSpy }),
        json: jsonSpy
      };
      await mriController.apiMriGet(req, res);
      assert.strictEqual(jsonSpy.callCount, 0);
      assert.strictEqual(statusSpy.callCount, 0);
      assert.strictEqual(resSpy.callCount, 1);
      assert.strictEqual(resSpy.args[0][0], 'Invalid Url!');
      sinon.restore();
    });

    it('should throw an error when the URL is not in DB and downloads set to false', async function() {
      const req = {
        db: db,
        query: {
          url: 'https://s3.amazonaws.com/fcp-indi/data/1234assccdf',
          download: 'false',
          backups: 'true',
          page: 1
        },
        user: {
          username: ''
        },
        isAuthenticated: function() {
          return Boolean(this.user.username);
        },
        isTokenAuthenticated: false
      };
      const resSpy = sinon.spy();
      const statusSpy = sinon.spy();
      const jsonSpy = sinon.spy();
      const res = {
        send: resSpy,
        status: sinon.stub().returns({ json: statusSpy}),
        json: jsonSpy
      };
      await mriController.apiMriGet(req, res);
      assert.strictEqual(statusSpy.callCount, 1);
      sinon.restore();
    });

    it('should ask for page parameter if not provided', async function() {
      const req = {
        db: db,
        query: {
          download: 'true',
          backups: 'true'
        },
        user: {
          username: ''
        },
        isAuthenticated: function() {
          return Boolean(this.user.username);
        },
        isTokenAuthenticated: false
      };
      const resSpy = sinon.spy();
      const jsonSpy = sinon.spy();
      const res = {
        send: resSpy,
        status: sinon.stub().returns({ json: jsonSpy}),
        json: jsonSpy
      };
      await mriController.apiMriGet(req, res);
      assert.strictEqual(resSpy.callCount, 1);
      assert.strictEqual(jsonSpy.callCount, 0);
      assert.strictEqual(resSpy.args[0][0].error, "Provide the parameter 'page'");
      sinon.restore();
    });
  });
});
