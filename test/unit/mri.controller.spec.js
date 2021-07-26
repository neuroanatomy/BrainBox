var assert = require("assert");
const mriController = require('../../controller/mri/mri.controller');
const monk = require('monk');
require('mocha-sinon');
const sinon = require('sinon');
var db = monk('localhost:27017/brainbox');

describe('MRI Controller: ', function () {
    
    describe('Validator function() ', function() {
        it('should perform the validations correctly', async function () {
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
                    if(req.body.atlasProject) 
                      return null;
                    else 
                    return new Error('Body has validation errors!');
                }
            };
            let resSpy = sinon.spy();
            let res = {
                status: sinon.stub().returns({ send: resSpy }),
            };
            await mriController.validator(req, res, () => {});
            assert.strictEqual(resSpy.callCount, 0);
            sinon.restore();
        });

        it('should throw error if validation fails.', async function() {
            let req = {
                body: {
                    atlasName: 'MyAtlas',
                    atlasLabelSet: 'SampleLabelSet',
                    token: 'jnqpincpienfcpewnfcpewn123'
                },
                query: {},
                value: 0,
                validationErrors: function() {
                    if(this.body.atlasProject) 
                      return null;
                    else 
                      return new Error('Body has validation errors!');
                }
            };
            let resSpy = sinon.spy();
            let res = {
                status: sinon.stub().returns({ send: sinon.stub().returns({ end: resSpy })}),
            };
            await mriController.validator(req, res, () => {});
            assert.strictEqual(resSpy.callCount, 1);
            sinon.restore();
        });
    });
    

    describe('validatorPost function() ', function () {
        it('should perform the validations correctly', async function () {
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
                query: {},
                params: {},
                value: 0,
                validationErrors: function() {
                    return this.body.url ? null : new Error('Invalid url!');
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

        it('should throw errors if validation fails', async function () {
            let reqSpy = sinon.spy();
            let urlSpy = sinon.spy();
            let req = {
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
            let resSpy = sinon.spy();
    
            let res = {
                status: sinon.stub().returns({ send: sinon.stub().returns({ end: resSpy })}),
            };
            await mriController.validatorPost(req, res, () => {});
            assert.strictEqual(reqSpy.callCount, 1);
            assert.strictEqual(urlSpy.callCount, 1);
            assert.strictEqual(resSpy.callCount, 1);
            sinon.restore();
        });
    });

    describe('MRI function() ', function() {
        it('should return the MRI information when correct input is given', async function() {
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
            assert.strictEqual(res.render.callCount, 1);
            assert.strictEqual(authenticated.callCount, 2);
            sinon.restore();
        });
    });

    describe('apiMriGet function() ', function() {
        it('should fetch the MRI as directed when the URL is correct', async function() {
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
            let statusSpy = sinon.spy();
            let jsonSpy = sinon.spy();
            let res = {
                send: resSpy,
                status: sinon.stub().returns({ json: statusSpy}),
                json: jsonSpy
            };
            await mriController.apiMriGet(req, res);
            assert.strictEqual(resSpy.callCount, 0);
            assert.strictEqual(statusSpy.callCount, 0);
            assert.strictEqual(jsonSpy.callCount, 1);
            const values = jsonSpy.args;
            assert.notStrictEqual(values[0][0].source, undefined);
            sinon.restore();
        });
    
        it('should throw an error when the URL is invalid', async function() {
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
            assert.strictEqual(resSpy.callCount, 0);
            assert.strictEqual(jsonSpy.callCount, 1);
            assert.strictEqual(jsonSpy.args[0][0].length, 0);
            sinon.restore();
        });    

        it('should ask for page parameter if not provided', async function() {
            let req = {
                db: db,
                query: {
                    download: 'true',
                    backups: 'true',
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
            assert.strictEqual(resSpy.callCount, 1);
            assert.strictEqual(jsonSpy.callCount, 0);
            assert.strictEqual(resSpy.args[0][0].error, "Provide the parameter 'page'");
            sinon.restore();
        });
    });
    
    describe('apiMriPost function() ', function() {
        it('should work correctly and make the right calls when input is correct', async function() {
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
            assert.strictEqual(resSpy.callCount, 0);
            assert.strictEqual(jsonSpy.callCount, 1);
            assert.notStrictEqual(jsonSpy.args, [[{ success: 'downloading', cur: 0, len: 1 }]]);
            sinon.restore();
        });
    
        it('should throw an error when input is incorrect', async function() {
            let req = {
                db: db,
                body: {},
                query: {
                    url: ''
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
            let statusSpy = sinon.spy();
            let jsonSpy = sinon.spy();
            let res = {
                send: resSpy,
                status: sinon.stub().returns({ json: statusSpy}),
                json: jsonSpy
            };
            await mriController.apiMriPost(req, res);
            assert.strictEqual(jsonSpy.callCount, 1);
            assert.strictEqual(statusSpy.callCount, 0);
            sinon.restore();
        });
    });
});
