var assert = require("assert");
const uploadController = require('../../controller/mri/upload.controller');
const monk = require('monk');
require('mocha-sinon');
const sinon = require('sinon');
var db = monk('localhost:27017/brainbox');
const U = require('../utils');

describe('Upload Controller: ', function() {

    describe('Validator function() ', function() {
        it('should perform the validations correctly', async function() {
            let reqSpy = sinon.spy();
            let urlSpy = sinon.spy();
            let alphaSpy = sinon.spy();
            let req = {
                body: { 
                    url: 'abc',
                    atlasName: '',
                    atlasProject: '',
                    atlasLabelSet: '',
                    token: ''
                },
                query: { },
                params: { },
                value: 0,
                validationErrors: function() {
                    if(!this.body.url)
                      return new Error('Validations failed!');
                    else 
                      return null;
                },
                checkBody: sinon.stub().returns({ notEmpty: reqSpy, isURL: urlSpy, isAlphanumeric: alphaSpy })
            };
            let resSpy = sinon.spy();
            let sendStub = sinon.stub().returns({ end: resSpy });
            let res = {
                status: sinon.stub().returns({ send: sendStub }),
            };
            await uploadController.validator(req, res, () => {});
            assert.strictEqual(reqSpy.callCount, 5);
            assert.strictEqual(urlSpy.callCount, 1);
            assert.strictEqual(resSpy.callCount, 0);
            assert.strictEqual(alphaSpy.callCount, 2);
            sinon.restore();
        });

        it('should throw errors if any validation fails', async function() {
            let reqSpy = sinon.spy();
            let urlSpy = sinon.spy();
            let alphaSpy = sinon.spy();
            let req = {
                body: { 
                    url: '',
                    token: ''
                },
                query: { },
                params: { },
                value: 0,
                validationErrors: function() {
                    if(!this.body.atlasLabelSet || !this.body.url || !this.body.atlasName || !this.body.atlasProject || !this.body.token)
                      return new Error('Validations failed!');
                    else 
                      return null;
                },
                checkBody: sinon.stub().returns({ notEmpty: reqSpy, isURL: urlSpy, isAlphanumeric: alphaSpy })
            };
            let resSpy = sinon.spy();
            let sendStub = sinon.stub().returns({ end: resSpy });
            let res = {
                status: sinon.stub().returns({ send: sendStub }),
            };
            await uploadController.validator(req, res, () => {});
            assert.strictEqual(reqSpy.callCount, 5);
            assert.strictEqual(urlSpy.callCount, 1);
            assert.strictEqual(resSpy.callCount, 1);
            assert.strictEqual(alphaSpy.callCount, 2);
            sinon.restore();
        });
    });
    

    describe('other_validations function() ', function() {
        it('should perform the other validations successfully', async function() {
            let req = {
                body: { 
                    token: U.testToken + 'foo',
                    url: ''
                },
                files: [],
                tokenDuration: 2 * (1000 * 3600),
                query: { },
                params: { },
                value: 0,
                db: db
            };
            let resSpy = sinon.spy();
            let jsonSpy = sinon.spy();
            let sendStub = sinon.stub().returns({ end: resSpy });
            let res = {
                status: sinon.stub().returns({ send: sendStub, json: sinon.stub().returns({ end: jsonSpy })}),
            };
            await uploadController.other_validations(req, res, () => {});
            assert.strictEqual(jsonSpy.callCount, 1);
            assert.strictEqual(resSpy.callCount, 0);
            sinon.restore();
        });

        it('should not accept a token that has expired.', async function () {
            let req = {
                body: { 
                    token: U.testToken + 'foo',
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
            let jsonSpy = sinon.spy();
            let sendStub = sinon.stub().returns({ end: resSpy });
            let res = {
                status: sinon.stub().returns({ send: sendStub, json: sinon.stub().returns({ end: jsonSpy })}),
            };
            await uploadController.other_validations(req, res, () => {});
            assert.strictEqual(jsonSpy.callCount, 0);
            assert.strictEqual(resSpy.callCount, 1);
            assert.strictEqual(sendStub.args[0][0], 'ERROR: Token expired');
            sinon.restore();
        });

        it('should throw an error if the token is invalid', async function () {
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
            let jsonSpy = sinon.spy();
            let sendStub = sinon.stub().returns({ end: resSpy });
            let res = {
                status: sinon.stub().returns({ send: sendStub, json: sinon.stub().returns({ end: jsonSpy })}),
            };
            await uploadController.other_validations(req, res, () => {});
            assert.strictEqual(jsonSpy.callCount, 0);
            assert.strictEqual(resSpy.callCount, 1);
            assert.strictEqual(sendStub.args[0][0], 'ERROR: Cannot find token');
            sinon.restore();
        });
    });
    
    describe('token function() ', function() {
        it('should return the token with correct credentials', async function() {
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
    
        it('should redirect with incorrect credentials', async function() {
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
});