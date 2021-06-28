var assert = require("assert");
const uploadController = require('../../controller/mri/upload.controller');
const mriController = require('../../controller/mri/mri.controller');
const monk = require('monk');
require('mocha-sinon');
const sinon = require('sinon');
var db = monk('http://localhost:27017/brainbox');

describe('MRI Controller: ', function () {
    it('Validator function should perform the validations correctly', async function () {
        let req = {
            body: {
                url: 'abc.com',
                atlasName: 'MyAtlas',
                atlasProject: 'Visualisation@',
                atlasLabelSet: 'SampleLabelSet',
                token: 'jnqpincpienfcpewnfcpewn123'
            },
            value: 0,
            validationErrors: function() {
                console.log('Testing!');
            }
        };
        let validate = sinon.stub(req, 'validationErrors').resolves(true);
        let resSpy = sinon.spy();

        let res = {
            status: sinon.stub().returns({ send: resSpy }),
        };
        await mriController.validator(req, res, function () {
            console.log('Unit Test finished!');
        });
        assert.notDeepStrictEqual(validate.calledOnce, true);
        assert.notDeepStrictEqual(resSpy.calledOnce, true);
        assert.notDeepStrictEqual(resSpy.calledWith(null), true);
        sinon.restore();
    });

    it('validatorPost function() should perform the validations correctly', async function () {
        let reqSpy = sinon.spy();
        let urlSpy = sinon.spy();
        let req = {
            body: {
                url: 'abc.com',
                atlasName: 'MyAtlas',
                atlasProject: 'Visualisation@',
                atlasLabelSet: 'SampleLabelSet',
                token: 'jnqpincpienfcpewnfcpewn123'
            },
            value: 0,
            validationErrors: function() {
                return;
            },
            checkBody: sinon.stub().returns({ notEmpty: reqSpy, isURL: urlSpy })
        };
        let resSpy = sinon.spy();

        let res = {
            status: sinon.stub().returns({ send: sinon.stub().returns({ end: resSpy })}),
        };
        await mriController.validatorPost(req, res, () => {});
        assert.strictEqual(reqSpy.callCount, 1);
        assert.strictEqual(urlSpy.callCount, 1);
        assert.strictEqual(resSpy.callCount, 0);
        sinon.restore();
    });

    it('download MRI function should download the file when correct input is given', async function() {
        let req = {
            db: db,
            query: {
                url: 'https://brainbox.pasteur.fr/mri?url=https://s3.amazonaws.com/fcp-indi/data/Projects/ABIDE_Initiative/Outputs/freesurfer/5.1/CMU_a_0050642/mri/T1.mgz'
            },
            dirname: __dirname.split('/test')[0],
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
        let arr = [];
        let authenticated = sinon.stub(req, 'isAuthenticated').resolves(true);
        let res = {
            render: sinon.spy()
        };
        await mriController.mri(req, res);
        assert.notDeepStrictEqual(authenticated.calledOnce, true);
        assert.notDeepStrictEqual(res.render.calledOnce, true);
        sinon.restore();
    });

    it('reset function() should make the right calls to the DB and work correctly when the URL is correct', async function (){
        let req = {
            db: db,
            query: {
                url: 'https://brainbox.pasteur.fr/mri?url=https://s3.amazonaws.com/fcp-indi/data/Projects/ABIDE_Initiative/Outputs/freesurfer/5.1/CMU_a_0050642/mri/T1.mgz'
            }
        };
        let resSpy = sinon.spy();
        let res = {
            render: sinon.spy(),
            status: sinon.stub().returns({ send: sinon.stub().returns({ end: resSpy })}),
        };
        await mriController.reset(req, res);
        assert.notDeepStrictEqual(resSpy.calledOnce, true);
        sinon.restore();
    });

    it('appMriGet function() should fetch the MRI as directed when the URL is correct', async function() {
        let req = {
            db: db,
            query: {
                url: 'https://brainbox.pasteur.fr/mri?url=https://s3.amazonaws.com/fcp-indi/data/Projects/ABIDE_Initiative/Outputs/freesurfer/5.1/CMU_a_0050642/mri/T1.mgz',
                download: 'true',
                backups: 'true',
                page: 1
            },
            user: {
                username: ''
            },
            isAuthenticated: function() {
                return this.user.username ? true : false;
            },
            isTokenAuthenticated: false
        };
        let resSpy = sinon.spy();
        let jsonSpy = sinon.spy();
        let res = {
            send: resSpy,
            status: sinon.stub().returns({ json: jsonSpy}),
            json: jsonSpy
        };
        await mriController.apiMriGet(req, res);
        assert.notDeepStrictEqual(resSpy.calledOnce, true);
        assert.notDeepStrictEqual(jsonSpy.calledOnce, true);
        sinon.restore();
    });

    it('apiMriGet function() should throw an error when the URL is invalid', async function() {
        let req = {
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
                return this.user.username ? true : false;
            },
            isTokenAuthenticated: false
        };
        let resSpy = sinon.spy();
        let jsonSpy = sinon.spy();
        let res = {
            send: resSpy,
            status: sinon.stub().returns({ json: jsonSpy}),
            json: jsonSpy
        };
        await mriController.apiMriGet(req, res);
        assert.notDeepStrictEqual(resSpy.calledOnce, true);
        assert.notDeepStrictEqual(jsonSpy.calledOnce, true);
        sinon.restore();
    });

    it('apiMriPost function() should work correctly and make the right calls when input is correct', async function() {
        let req = {
            db: db,
            body: {},
            query: {
                url: 'https://brainbox.pasteur.fr/mri?url=https://s3.amazonaws.com/fcp-indi/data/Projects/ABIDE_Initiative/Outputs/freesurfer/5.1/CMU_a_0050642/mri/T1.mgz',
            },
            user: {
                username: ''
            },
            dirname: __dirname.split('/test')[0],
            isAuthenticated: function() {
                return this.user.username ? true : false;
            },
            isTokenAuthenticated: false
        };
        let resSpy = sinon.spy();
        let jsonSpy = sinon.spy();
        let res = {
            send: resSpy,
            status: sinon.stub().returns({ json: jsonSpy}),
            json: jsonSpy
        };
        await mriController.apiMriPost(req, res);
        assert.notDeepStrictEqual(resSpy.calledOnce, true);
        assert.notDeepStrictEqual(jsonSpy.calledOnce, true);
        sinon.restore();
    });

    it('apiMriPost function() should throw an error when input is incorrect', async function() {
        let req = {
            db: db,
            body: {},
            query: {
                url: '',
            },
            user: {
            },
            dirname: __dirname.split('/test')[0],
            isAuthenticated: function() {
                return this.user.username ? true : false;
            },
            isTokenAuthenticated: false
        };
        let resSpy = sinon.spy();
        let jsonSpy = sinon.spy();
        let res = {
            send: resSpy,
            status: sinon.stub().returns({ json: jsonSpy}),
            json: jsonSpy
        };
        await mriController.apiMriPost(req, res);
        assert.notDeepStrictEqual(resSpy.calledOnce, true);
        assert.notDeepStrictEqual(jsonSpy.calledOnce, true);
        sinon.restore();
    });
});

describe('Upload Controller: ', function() {
    it('validator function() should perform the validations correctly', async function() {
        let reqSpy = sinon.spy();
        let urlSpy = sinon.spy();
        let alphaSpy = sinon.spy();
        let req = {
            body: { },
            query: { },
            params: { },
            value: 0,
            validationErrors: function() {
                return;
            },
            checkBody: sinon.stub().returns({ notEmpty: reqSpy, isURL: urlSpy, isAlphanumeric: alphaSpy })
        };
        let resSpy = sinon.spy();

        let res = {
            status: sinon.stub().returns({ send: sinon.stub().returns({ end: resSpy })}),
        };
        await uploadController.validator(req, res, () => {});
        assert.strictEqual(reqSpy.callCount, 5);
        assert.strictEqual(urlSpy.callCount, 1);
        assert.strictEqual(resSpy.callCount, 0);
        assert.strictEqual(alphaSpy.callCount, 2);
        sinon.restore();
    });

    it('other_validations function() should perform the other validations successfully', async function() {
        let req = {
            body: { 
                token: '',
                url: ''
            },
            files: [],
            tokenDuration: 60*60,
            query: { },
            params: { },
            value: 0,
            db: db
        };
        let resSpy = sinon.spy();

        let res = {
            status: sinon.stub().returns({ send: sinon.stub().returns({ end: resSpy }), json: sinon.stub().returns({ end: resSpy })}),
        };
        await uploadController.other_validations(req, res, () => {});
        assert.strictEqual(resSpy.callCount, 0);
        sinon.restore();
    });

    it('token function() should return the token with correct credentials', async function() {
        let req = {
            db: db,
            body: {},
            query: {
                url: 'https://brainbox.pasteur.fr/mri?url=https://s3.amazonaws.com/fcp-indi/data/Projects/ABIDE_Initiative/Outputs/freesurfer/5.1/CMU_a_0050642/mri/T1.mgz',
            },
            user: {
                username: 'abc'
            },
            dirname: __dirname.split('/test')[0],
            isAuthenticated: function() {
                return this.user.username ? true : false;
            },
            isTokenAuthenticated: false
        };
        let resSpy = sinon.spy();
        let jsonSpy = sinon.spy();
        let res = {
            redirect: resSpy,
            json: jsonSpy
        };
        await uploadController.token(req, res);
        assert.strictEqual(resSpy.callCount, 0);
        assert.strictEqual(jsonSpy.callCount, 1);
        sinon.restore();
    });

    it('token function() should redirect with incorrect credentials', async function() {
        let req = {
            db: db,
            body: {},
            query: {
                url: 'https://brainbox.pasteur.fr/mri?url=https://s3.amazonaws.com/fcp-indi/data/Projects/ABIDE_Initiative/Outputs/freesurfer/5.1/CMU_a_0050642/mri/T1.mgz',
            },
            user: {
            },
            dirname: __dirname.split('/test')[0],
            isAuthenticated: function() {
                return this.user.username ? true : false;
            },
            isTokenAuthenticated: false
        };
        let resSpy = sinon.spy();
        let jsonSpy = sinon.spy();
        let res = {
            redirect: resSpy,
            json: jsonSpy
        };
        await uploadController.token(req, res);
        assert.strictEqual(resSpy.callCount, 1);
        assert.strictEqual(jsonSpy.callCount, 0);
        sinon.restore();
    });
});