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

  describe('mriEmbed / apiMriLayers (embed access control): ', function () {
    const publicEmbedURL = 'https://example.com/embed-public-brain.nii.gz';
    const privateEmbedURL = 'https://example.com/embed-private-brain.nii.gz';
    const publicEmbedProject = 'embedpublicproject';
    const privateEmbedProject = 'embedprivateproject';
    // nativeDb is only populated by the outer before() hook once the suite
    // starts running, so build the request object lazily per test rather
    // than capturing it at describe-time (when it is still undefined).
    const makeAnonReq = (query) => ({ nativeDb, query: query || {}, user: { username: '' }, isAuthenticated: () => false });
    // The embed routes set a frame-ancestors header before anything else, so
    // the response mock needs res.set as well as status/render.
    const makeRenderRes = () => ({ status: sinon.spy(), render: sinon.spy(), set: sinon.spy() });

    before(async function () {
      await nativeDb.collection('project').insertOne({
        name: 'Embed Public Project',
        shortname: publicEmbedProject,
        owner: 'foo',
        collaborators: {
          list: [
            {
              userID: 'anyone',
              username: 'anyone',
              nickname: 'anyone',
              access: { collaborators: 'view', annotations: 'view', files: 'view' }
            }
          ]
        },
        files: { list: [] },
        annotations: { list: [] }
      });
      await nativeDb.collection('project').insertOne({
        name: 'Embed Private Project',
        shortname: privateEmbedProject,
        owner: 'foo',
        collaborators: {
          list: [
            {
              userID: 'anyone',
              username: 'anyone',
              nickname: 'anyone',
              access: { collaborators: 'none', annotations: 'none', files: 'none' }
            }
          ]
        },
        files: { list: [] },
        annotations: { list: [] }
      });
      await nativeDb.collection('mri').insertOne({
        source: publicEmbedURL,
        name: 'Public Embed Brain',
        url: '/data/embedpublic/',
        mri: { atlas: [{ name: 'Default', project: publicEmbedProject, filename: 'Atlas.nii.gz', labels: 'foreground.json' }] }
      });
      await nativeDb.collection('mri').insertOne({
        source: privateEmbedURL,
        name: 'Private Embed Brain',
        url: '/data/embedprivate/',
        mri: { atlas: [{ name: 'Default', project: privateEmbedProject, filename: 'Atlas.nii.gz', labels: 'foreground.json' }] }
      });
    });

    after(async function () {
      await nativeDb.collection('project').deleteMany({ shortname: { $in: [publicEmbedProject, privateEmbedProject] } });
      await nativeDb.collection('mri').deleteMany({ source: { $in: [publicEmbedURL, privateEmbedURL] } });
      await nativeDb.collection('embedWsTicket').deleteMany({ mriSource: { $in: [publicEmbedURL, privateEmbedURL] } });
    });

    describe('apiMriLayers function() ', function () {
      it('should return 400 when no url is provided', async function () {
        const req = makeAnonReq();
        const statusSpy = sinon.spy();
        const jsonSpy = sinon.spy();
        const res = { status: sinon.stub().returns({ json: statusSpy }), json: jsonSpy };
        await mriController.apiMriLayers(req, res);
        assert.isTrue(res.status.calledWith(400));
        assert.strictEqual(jsonSpy.callCount, 0);
      });

      it('should return 404 when the MRI is not in the DB', async function () {
        const req = makeAnonReq({ url: 'https://example.com/embed-no-such-brain.nii.gz' });
        const statusSpy = sinon.spy();
        const jsonSpy = sinon.spy();
        const res = { status: sinon.stub().returns({ json: statusSpy }), json: jsonSpy };
        await mriController.apiMriLayers(req, res);
        assert.isTrue(res.status.calledWith(404));
        assert.strictEqual(jsonSpy.callCount, 0);
      });

      it('should return 403 for a private MRI when the caller has no access', async function () {
        const req = makeAnonReq({ url: privateEmbedURL });
        const statusSpy = sinon.spy();
        const jsonSpy = sinon.spy();
        const res = { status: sinon.stub().returns({ json: statusSpy }), json: jsonSpy };
        await mriController.apiMriLayers(req, res);
        assert.isTrue(res.status.calledWith(403));
        assert.strictEqual(jsonSpy.callCount, 0);
      });

      it('should return 200 with the layer list for a public MRI', async function () {
        const req = makeAnonReq({ url: publicEmbedURL });
        const jsonSpy = sinon.spy();
        const res = { status: sinon.stub().returns({ json: sinon.spy() }), json: jsonSpy };
        await mriController.apiMriLayers(req, res);
        assert.strictEqual(jsonSpy.callCount, 1);
        const [[{ layers }]] = jsonSpy.args;
        assert.strictEqual(layers.length, 1);
        assert.strictEqual(layers[0].project, publicEmbedProject);
        assert.strictEqual(layers[0].name, 'Default');
      });
    });

    describe('mriEmbed function() ', function () {
      it('should render an error with 400 when no url is provided', async function () {
        const req = makeAnonReq();
        const res = makeRenderRes();
        await mriController.mriEmbed(req, res);
        assert.isTrue(res.status.calledWith(400));
        assert.strictEqual(res.render.callCount, 1);
        assert.strictEqual(res.render.args[0][0], 'embedError');
      });

      it('should render an error with 404 when the MRI is not in the DB', async function () {
        const req = makeAnonReq({ url: 'https://example.com/embed-no-such-brain.nii.gz' });
        const res = makeRenderRes();
        await mriController.mriEmbed(req, res);
        assert.isTrue(res.status.calledWith(404));
        assert.strictEqual(res.render.args[0][0], 'embedError');
      });

      it('should render an error with 403 for a private MRI when the caller has no access', async function () {
        const req = makeAnonReq({ url: privateEmbedURL });
        const res = makeRenderRes();
        await mriController.mriEmbed(req, res);
        assert.isTrue(res.status.calledWith(403));
        assert.strictEqual(res.render.args[0][0], 'embedError');
      });

      it('should render the embed viewer with a fresh embedWsTicket for a public MRI', async function () {
        const req = makeAnonReq({ url: publicEmbedURL });
        const res = makeRenderRes();
        await mriController.mriEmbed(req, res);
        assert.strictEqual(res.status.callCount, 0);
        assert.strictEqual(res.render.callCount, 1);
        assert.strictEqual(res.render.args[0][0], 'mriEmbed');
        const [[, locals]] = res.render.args;
        const ticket = JSON.parse(locals.embedWsTicket);
        assert.isString(ticket);

        const stored = await nativeDb.collection('embedWsTicket').findOne({ token: ticket });
        assert.strictEqual(stored.mriSource, publicEmbedURL);
        assert.strictEqual(stored.dirname, '/data/embedpublic/');
      });

      it('should declare itself framable', async function () {
        const req = makeAnonReq({ url: publicEmbedURL });
        const res = makeRenderRes();
        await mriController.mriEmbed(req, res);
        assert.isTrue(res.set.calledWith('Content-Security-Policy', 'frame-ancestors *'));
      });

      it('should reflect only the query parameters the viewer understands', async function () {
        const req = makeAnonReq({ url: publicEmbedURL, view: 'cor', slice: '90', evil: 'dropme' });
        const res = makeRenderRes();
        await mriController.mriEmbed(req, res);
        const [[, locals]] = res.render.args;
        const params = JSON.parse(locals.params);
        assert.deepStrictEqual(Object.keys(params).sort(), ['slice', 'url', 'view']);
        assert.notProperty(params, 'evil');
      });

      it('should not let a query parameter break out of the inline script', async function () {
        const payload = '</script><img src=x onerror=alert(1)>';
        // `view` is whitelisted, so this is reflected: it must come back escaped
        // rather than dropped, which is what protects the MRI metadata too.
        const req = makeAnonReq({ url: publicEmbedURL, view: payload });
        const res = makeRenderRes();
        await mriController.mriEmbed(req, res);
        const [[, locals]] = res.render.args;
        assert.notInclude(locals.params.toLowerCase(), '</script');
        assert.notInclude(locals.params, '<');
        assert.notInclude(locals.params, '>');
        // ...and still means exactly what it said
        assert.strictEqual(JSON.parse(locals.params).view, payload);
      });
    });

    describe('mriRender3D function() ', function () {
      it('should render an error with 400 when no url is provided', async function () {
        const req = makeAnonReq();
        const res = makeRenderRes();
        await mriController.mriRender3D(req, res);
        assert.isTrue(res.status.calledWith(400));
        assert.strictEqual(res.render.args[0][0], 'embedError');
      });

      it('should render an error with 404 when the MRI is not in the DB', async function () {
        const req = makeAnonReq({ url: 'https://example.com/embed-no-such-brain.nii.gz' });
        const res = makeRenderRes();
        await mriController.mriRender3D(req, res);
        assert.isTrue(res.status.calledWith(404));
        assert.strictEqual(res.render.args[0][0], 'embedError');
      });

      it('should return 403 for a private MRI, like the embed itself', async function () {
        const req = makeAnonReq({ url: privateEmbedURL });
        const res = makeRenderRes();
        await mriController.mriRender3D(req, res);
        assert.isTrue(res.status.calledWith(403));
        assert.strictEqual(res.render.args[0][0], 'embedError');
      });

      it('should render the annotation path for a public MRI', async function () {
        const req = makeAnonReq({ url: publicEmbedURL });
        const res = makeRenderRes();
        await mriController.mriRender3D(req, res);
        assert.strictEqual(res.status.callCount, 0);
        assert.strictEqual(res.render.args[0][0], 'mriRender3D');
        const [[, locals]] = res.render.args;
        assert.strictEqual(JSON.parse(locals.path), '/data/embedpublic/Atlas.nii.gz');
      });

      it('should ignore an atlas filename that is not one of this brain\'s layers', async function () {
        const req = makeAnonReq({ url: publicEmbedURL, atlas: '../../../etc/passwd' });
        const res = makeRenderRes();
        await mriController.mriRender3D(req, res);
        const [[, locals]] = res.render.args;
        assert.strictEqual(JSON.parse(locals.path), '/data/embedpublic/Atlas.nii.gz');
      });
    });
  });
});
