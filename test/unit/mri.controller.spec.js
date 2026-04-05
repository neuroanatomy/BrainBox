/* eslint-disable max-lines */
const { assert } = require('chai');
const httpMocks = require('node-mocks-http');
const MriController = require('../../controller/mri/mri.controller');
// const atlasMakerServer = require('../../controller/atlasmakerServer/atlasmakerServer');
require('mocha-sinon');
const sinon = require('sinon');
const U = require('../utils');
const dirname = require('path').resolve(__dirname, '../..');

let db, mriController, nativeDb;

describe('MRI Controller: ', function () {
  before(function () {
    db = U.getDB();
    nativeDb = U.getNativeDB();
    mriController = new MriController(db, nativeDb);
  });

  describe('Validator function() ', function () {
    it('should perform the validations correctly', async function () {
      const req = httpMocks.createRequest({
        body: {
          url: 'https://example.com/brain.nii.gz',
          atlasName: 'MyAtlas',
          atlasProject: 'Visualisation@',
          atlasLabelSet: 'SampleLabelSet',
          token: 'jnqpincpienfcpewnfcpewn123'
        },
        value: 0
      });
      const res = httpMocks.createResponse();
      await mriController.validator(req, res, () => { /* do nothing */ });
      assert.strictEqual(res.statusCode, 200);
    });

    it('should reject an invalid URL', function () {
      const req = httpMocks.createRequest({
        body: {},
        query: { url: 'not-a-valid-url' },
        value: 0
      });
      const res = httpMocks.createResponse();
      let nextCalled = false;
      mriController.validator(req, res, () => { nextCalled = true; });
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(nextCalled, false);
    });

    it('should pass when url is absent (optional)', function () {
      const req = httpMocks.createRequest({
        body: {},
        query: {},
        value: 0
      });
      const res = httpMocks.createResponse();
      let nextCalled = false;
      mriController.validator(req, res, () => { nextCalled = true; });
      assert.strictEqual(nextCalled, true);
      assert.strictEqual(res.statusCode, 200);
    });
  });


  describe('validatorPost function() ', function () {
    it('should perform the validations correctly', async function () {
      const req = httpMocks.createRequest({
        body: {
          url: 'abc.com',
          atlasName: 'MyAtlas',
          atlasProject: 'Visualisation@',
          atlasLabelSet: 'SampleLabelSet',
          token: 'jnqpincpienfcpewnfcpewn123'
        },
        query: {},
        params: {},
        value: 0
      });

      const res = httpMocks.createResponse();
      await mriController.validatorPost(req, res, () => { /* do nothing */ });
      assert.strictEqual(res.statusCode, 200);
    });

    it('should throw errors if validation fails', async function () {
      const req = httpMocks.createRequest({
        body: {
          atlasName: 'MyAtlas',
          atlasProject: 'Visualisation@',
          atlasLabelSet: 'SampleLabelSet',
          token: 'jnqpincpienfcpewnfcpewn123'
        },
        query: {},
        params: {},
        value: 0
      });

      // const res = {
      //   status: sinon.stub().returns({ send: sinon.stub().returns({ end: resSpy }) })
      // };
      const res = httpMocks.createResponse();
      await mriController.validatorPost(req, res, () => { /* do nothing */ });
      assert.strictEqual(res.statusCode, 403);
    });
  });

  describe('MRI function() ', function () {
    it('should return the MRI information when correct input is given', async function () {
      const req = {
        db,
        nativeDb,
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
        isAuthenticated: function () {
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

  describe('apiMriGet function() ', function () {
    it('should fetch the MRI as directed when the URL is correct', async function () {
      const req = {
        db,
        nativeDb,
        query: {
          url: 'https://s3.amazonaws.com/fcp-indi/data/Projects/ABIDE_Initiative/Outputs/freesurfer/5.1/CMU_a_0050642/mri/T1.mgz',
          download: 'true',
          backups: 'true',
          page: 1
        },
        user: {
          username: ''
        },
        isAuthenticated: function () {
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
      assert.strictEqual(resSpy.callCount, 0);
      assert.strictEqual(statusSpy.callCount, 0);
      assert.strictEqual(jsonSpy.callCount, 1);
      const values = jsonSpy.args;
      assert.ok(values[0][0].source);
      assert.notProperty(values[0][0], '_id', 'API response must not include _id');
      sinon.restore();
    });

    it('should return a paginated list of files if url is empty', async function () {
      const req = {
        db,
        nativeDb,
        query: {
          url: '',
          download: 'true',
          backups: 'true',
          page: 1
        },
        user: {
          username: ''
        },
        isAuthenticated: function () {
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
      assert.strictEqual(jsonSpy.callCount, 1);
      sinon.restore();
    });

    it('should throw an error when the url is invalid', async function () {
      const req = {
        db,
        nativeDb,
        query: {
          url: 'inValidUrl',
          download: 'true',
          backups: 'true',
          page: 1
        },
        user: {
          username: ''
        },
        isAuthenticated: function () {
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

    it('should throw an error when the URL is not in DB and downloads set to false', async function () {
      const req = {
        db,
        nativeDb,
        query: {
          url: 'https://s3.amazonaws.com/fcp-indi/data/1234assccdf',
          download: 'false',
          backups: 'true',
          page: 1
        },
        user: {
          username: ''
        },
        isAuthenticated: function () {
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
      assert.strictEqual(statusSpy.callCount, 1);
      sinon.restore();
    });

    it('should ask for page parameter if not provided', async function () {
      const req = {
        db,
        nativeDb,
        query: {
          download: 'true',
          backups: 'true'
        },
        user: {
          username: ''
        },
        isAuthenticated: function () {
          return Boolean(this.user.username);
        },
        isTokenAuthenticated: false
      };
      const resSpy = sinon.spy();
      const jsonSpy = sinon.spy();
      const res = {
        send: resSpy,
        status: sinon.stub().returns({ json: jsonSpy }),
        json: jsonSpy
      };
      await mriController.apiMriGet(req, res);
      assert.strictEqual(resSpy.callCount, 1);
      assert.strictEqual(jsonSpy.callCount, 0);
      assert.strictEqual(resSpy.args[0][0].error, 'Provide the parameter \'page\'');
      sinon.restore();
    });
  });

  describe('apiMriPost function() ', function () {
    after(async function () {
      // await db.get('mri').remove({ source: U.localBertURL });
      await nativeDb.collection('mri').deleteMany({ source: U.localBertURL });
    });

    // eslint-disable-next-line max-statements
    it('should work correctly and make the right calls when input is correct', async function () {
      const req = {
        db,
        nativeDb,
        body: {},
        query: {
          url: U.localBertURL
        },
        user: {
          username: ''
        },
        headers: {
          'x-forwarded-for': U.userFoo.nickname
        },
        dirname,
        isAuthenticated: function () {
          return Boolean(this.user.username);
        },
        isTokenAuthenticated: false
      };
      console.log(req.dirname);
      const resSpy = sinon.spy();
      const jsonSpy = sinon.spy();
      const res = {
        send: resSpy,
        status: sinon.stub().returns({ json: jsonSpy }),
        json: jsonSpy
      };
      // atlasMakerServer.dataDirectory = __dirname.split('/test')[0] + '/public';
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        await mriController.apiMriPost(req, res);

        if (jsonSpy.args[jsonSpy.callCount - 1][0].success !== 'downloading') {
          break;
        }

        // eslint-disable-next-line no-await-in-loop
        await U.delay(U.shortTimeout);
      }
      // atlasMakerServer.dataDirectory = '';
      assert.strictEqual(resSpy.callCount, 0);
      assert.isAtLeast(jsonSpy.callCount, 1);
      assert.strictEqual(jsonSpy.args[jsonSpy.callCount - 1][0].success, true);
      assert.strictEqual(jsonSpy.args[jsonSpy.callCount - 1][0].source, U.localBertURL);
      assert.notProperty(jsonSpy.args[jsonSpy.callCount - 1][0], '_id', 'API response must not include _id');
      sinon.restore();
    }).timeout(U.longTimeout);

    it('should throw an error when input is incorrect', async function () {
      const req = {
        db,
        nativeDb,
        body: {},
        query: {
          url: 'invalidUrl'
        },
        user: {
        },
        dirname: __dirname.split('/test')[0],
        isAuthenticated: function () {
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
      await mriController.apiMriPost(req, res);
      assert.strictEqual(resSpy.callCount, 1);
      assert.strictEqual(resSpy.args[0][0], 'Invalid URL!');
      assert.strictEqual(jsonSpy.callCount, 0);
      assert.strictEqual(statusSpy.callCount, 0);
      sinon.restore();
    });

    it('should reject a download when remote server returns HTML instead of a binary file', async function () {
      const htmlErrorURL = U.serverURL + '/test_data/html_error_page.nii.gz';
      const makeReq = () => ({
        db,
        nativeDb,
        body: {},
        query: { url: htmlErrorURL },
        user: { username: '' },
        headers: { 'x-forwarded-for': U.userFoo.nickname },
        dirname,
        isAuthenticated: function () { return Boolean(this.user.username); },
        isTokenAuthenticated: false
      });

      // first call starts the download
      const jsonSpy1 = sinon.spy();
      await mriController.apiMriPost(makeReq(), {
        send: sinon.spy(),
        status: sinon.stub().returns({ json: sinon.spy() }),
        json: jsonSpy1
      });
      assert.strictEqual(jsonSpy1.args[0][0].success, 'downloading');

      // wait for the download to fail
      await U.delay(U.shortTimeout);

      // second call should report the failure with 403
      const jsonSpy2 = sinon.spy();
      const statusStub2 = sinon.stub().returns({ json: jsonSpy2 });
      await mriController.apiMriPost(makeReq(), {
        send: sinon.spy(),
        status: statusStub2,
        json: jsonSpy2
      });
      assert.isTrue(statusStub2.calledWith(403), 'should return 403 for failed download');
      const errorMsg = jsonSpy2.args[0][0].error;
      assert.isString(errorMsg);
      assert.include(errorMsg, 'HTML instead of a binary file');

      // cleanup
      await nativeDb.collection('mri').deleteMany({ source: htmlErrorURL });
      sinon.restore();
    }).timeout(U.longTimeout);
  });
});
