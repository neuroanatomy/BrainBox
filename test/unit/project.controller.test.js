var assert = require("assert");
const projectController = require('../../controller/project/project.controller');
const monk = require('monk');
require('mocha-sinon');
const sinon = require('sinon');
let projectObject = require('../data/model_objects/project');
const U = require('../utils');
let db = monk('localhost:27017/brainbox');

describe('Project Controller: ', function () {

    describe('Validator function() ', function () {
        it('should pass successfully when validations are successful', async function () {
            let reqSpy = sinon.spy();
            let req = {
                params: {
                    projectName: 'Braincat'
                },
                checkParams: sinon.stub().returns({ isAlphanumeric: reqSpy }),
                validationErrors: function () {
                    if (this.params && this.params.projectName) {
                        if (this.params.projectName !== '')
                            return null;
                        else {
                            return new Error('Not alphanumeric!');
                        }
                    } else {
                        return new Error('Not alphanumeric!');
                    }
                }
            };
            let resSpy = sinon.spy();
            let res = {
                status: sinon.stub().returns({ send: sinon.stub().returns({ end: resSpy }) })
            };
            await projectController.validator(req, res, () => { });
            assert.strictEqual(resSpy.callCount, 0);
            assert.strictEqual(reqSpy.callCount, 1);
            sinon.restore();
        });

        it('should throw errors when validations fail', async function () {
            let reqSpy = sinon.spy();
            let req = {
                params: {
                },
                checkParams: sinon.stub().returns({ isAlphanumeric: reqSpy }),
                validationErrors: function () {
                    if (this.params && this.params.projectName) {
                        if (this.params.projectName !== '')
                            return null;
                        else {
                            return new Error('Not alphanumeric!');
                        }
                    } else {
                        return new Error('Not alphanumeric!');
                    }
                }
            };
            let resSpy = sinon.spy();
            let res = {
                status: sinon.stub().returns({ send: sinon.stub().returns({ end: resSpy }) })
            };
            await projectController.validator(req, res, () => { });
            assert.strictEqual(resSpy.callCount, 1);
            assert.strictEqual(reqSpy.callCount, 1);
            sinon.restore();
        })
    });

    describe('project function() ', function () {
        this.beforeAll(function(done) {
            let testProject = projectObject;
            testProject.backup = true;
            db.get('project').insert(testProject).then(() => {});
            done();
        });

        this.afterAll(function(done) {
            db.get('project').remove({ shortname: 'testing' }).then(() => {});
            done();
        });

        it('should return the project information correctly with valid input', async function () {
            let req = {
                params: {
                    projectName: 'testing'
                },
                user: {
                    username: 'anyone'
                },
                session: {},
                originalUrl: 'some url',
                isAuthenticated: function () {
                    return this.user.username ? true : false;
                },
                db: db,
            };
            let success = sinon.spy();
            let failure = sinon.spy();
            let res = {
                render: success,
                status: sinon.stub().returns({ send: failure }),
            };
            await projectController.project(req, res);
            assert.strictEqual(success.callCount, 1);
            assert.strictEqual(failure.callCount, 0);
            sinon.restore();
        });

        it('should throw errors with invalid input', async function () {
            let req = {
                params: {
                    projectName: ''
                },
                user: {
                    username: ''
                },
                session: {},
                originalUrl: 'some url',
                isAuthenticated: function () {
                    return this.user.username ? true : false;
                },
                db: db,
            };
            let success = sinon.spy();
            let failure = sinon.spy();
            let res = {
                render: success,
                status: sinon.stub().returns({ send: failure }),
            };
            await projectController.project(req, res);
            assert.strictEqual(success.callCount, 0);
            assert.strictEqual(failure.callCount, 1);
            sinon.restore();
        });
    });

    describe('api_project function() ', function () {

        before(function (done) {
            db.get('project').insert(projectObject).then(() => { });
            done();
        });
        after(function(done) {
            db.get('project').remove({ shortname: 'testing' }).then(() => {});
            done();
        });

        it('should return the project information correctly with valid input', async function () {
            let req = {
                params: {
                    projectName: 'testing'
                },
                user: {
                    username: 'anyone'
                },
                session: {},
                originalUrl: 'some url',
                isAuthenticated: function () {
                    return this.user.username ? true : false;
                },
                db: db,
            };
            let resSpy = sinon.spy();
            let res = {
                status: sinon.stub().returns({ send: resSpy }),
                send: resSpy
            };
            await projectController.api_project(req, res);
            assert.strictEqual(resSpy.callCount, 1);
            assert.notStrictEqual(resSpy.args, { error: "Authorization required" });
            sinon.restore();
        });
        it('should throw errors with invalid input', async function () {
            let req = {
                params: {
                    projectName: ''
                },
                user: {
                    username: 'anyone'
                },
                session: {},
                originalUrl: 'some url',
                isAuthenticated: function () {
                    return this.user.username ? true : false;
                },
                db: db,
            };
            let resSpy = sinon.spy();
            let res = {
                status: sinon.stub().returns({ send: resSpy }),
                send: resSpy
            };
            await projectController.api_project(req, res);
            assert.strictEqual(resSpy.callCount, 1);
            sinon.restore();
        });
    });

    describe('api_projectFiles function() ', function () {
        it('should return the files with valid input', async function () {
            let req = {
                query: {
                    start: 1,
                    length: 3,
                    names: 'true'
                },
                params: {
                    projectName: 'testproject'
                },
                db: db,
                user: {
                    username: 'anyone'
                },
                isAuthenticated: function () {
                    return this.user.username ? true : false;
                }
            };
            let resSpy = sinon.spy();
            let res = {
                send: resSpy
            };
            await projectController.api_projectFiles(req, res);
            assert.strictEqual(resSpy.callCount, 1);
            sinon.restore();
        });

        it('should ask for start parameter when not provided.', async function () {
            let req = {
                query: {
                    length: 3,
                    names: 'true'
                },
                params: {
                    projectName: 'testproject'
                },
                db: db,
                user: {
                    username: 'anyone'
                },
                isAuthenticated: function () {
                    return this.user.username ? true : false;
                }
            };
            let resSpy = sinon.spy();
            let res = {
                send: resSpy
            };
            await projectController.api_projectFiles(req, res);
            assert.notStrictEqual(resSpy.args, [[{ error: "Provide 'start'" }]]);
            assert.strictEqual(resSpy.args.length, 1);
            sinon.restore();
        });

        it('should ask for length parameter when not provided.', async function () {
            let req = {
                query: {
                    start: 1,
                    names: 'true'
                },
                params: {
                    projectName: 'testproject'
                },
                db: db,
                user: {
                    username: 'anyone'
                },
                isAuthenticated: function () {
                    return this.user.username ? true : false;
                }
            };
            let resSpy = sinon.spy();
            let res = {
                send: resSpy
            };
            await projectController.api_projectFiles(req, res);
            assert.notStrictEqual(resSpy.args, [[{ error: "Provide 'length'" }]]);
            assert.strictEqual(resSpy.args.length, 1);
            sinon.restore();
        });
    });

    describe('newProject function() ', function () {
        it('should render the new project screen correctly for an anonymous user', async function () {
            let req = {
                db: db,
                user: {
                },
                isAuthenticated: function () {
                    return this.user.username ? true : false;
                },
                session: {},
                originalUrl: 'some url'
            };
            let resSpy = sinon.spy();
            let res = {
                render: resSpy
            };
            await projectController.newProject(req, res);
            assert.notStrictEqual(resSpy.args, [
                [
                    'askForLogin',
                    {
                        title: 'BrainBox: New Project',
                        functionality: 'create a new project',
                        login: "<a href='/auth/github'>Log in with GitHub</a>"
                    }
                ]
            ]);
            assert.strictEqual(resSpy.args.length, 1);
            sinon.restore();
        });

        it('should render the new project page correctly for a logged in user', async function () {
            let req = {
                db: db,
                user: {
                    username: 'anyone'
                },
                isAuthenticated: function () {
                    return this.user.username ? true : false;
                },
                session: {},
                originalUrl: 'some url'
            };
            let resSpy = sinon.spy();
            let res = {
                render: resSpy
            };
            await projectController.newProject(req, res);
            assert.notStrictEqual(resSpy.args, [
                [
                    'askForLogin',
                    {
                        title: 'BrainBox: New Project',
                        login: "<a href='/auth/github'>Log in with GitHub</a>"
                    }
                ]
            ]);
            assert.strictEqual(resSpy.args.length, 1);
            sinon.restore();
        });
    });

    describe('post_project function() ', function () {

        before(function (done) {
            db.get('user').insert({
                "name": "Any Brainbox User",
                "nickname": "anyone",
                "url": "",
                "brainboxURL": "/user/anyone",
                "avatarURL": "",
                "joined": "2020-05-01T08:26:35.348Z"
            }).then(() => {});
            done();
        });

        after(function (done) {
            db.get('user').remove({
                nickname: 'anyone'
            }).then(() => {
                // db.get('project').remove({shortname: 'testing'}).then(() => {});
            });
            done();
        });
        it('should throw error if user is not authenticated', async function () {
            let req = {
                body: {
                    data: {
                        name: 'Testing'
                    }
                },
                db: db,
                user: {
                },
                isAuthenticated: function () {
                    return this.user.username ? true : false;
                },
                session: {},
                originalUrl: 'some url'
            };
            let json = sinon.spy();
            let res = {
                status: sinon.stub().returns({ json: json })
            };
            await projectController.post_project(req, res);
            assert.notStrictEqual(json.args, [
                {
                    error: "error",
                    message: "User does not have edit rights"
                }
            ]);
            assert.strictEqual(json.args.length, 1);
            sinon.restore();
        });

        it('should insert a project if the project does not exist.', async function () {
            let req = {
                user: {
                    username: 'foo'
                },
                body: {
                    data: projectObject
                },
                isAuthenticated: function () {
                    return this.user.username ? true : false;
                },
                db: db,
                session: {
                    returnTo: ''
                }
            };
            let jsonSpy = sinon.spy();
            let res = {
                json: sinon.spy(),
                status: sinon.stub().returns({ json: jsonSpy }),
            };
            await projectController.post_project(req, res);
            assert.strictEqual(res.json.callCount, 1);
            assert.notStrictEqual(res.json.args, [[{ success: true, message: 'New project inserted' }]]);
            sinon.restore();
        });
    });

    describe('delete_project function() ', function () {
        before(function (done) {
            db.get('project').insert(projectObject).then(() => { });
            done();
        });
        after(function(done) {
            db.get('project').remove({ shortname: 'testing' }).then(() => {});
            done();
        });

        it('should throw error if the user is not authenticated', async function () {
            let req = {
                user: {
                },
                isAuthenticated: function () {
                    return this.user.username ? true : false;
                }
            };
            let jsonSpy = sinon.spy();
            let res = {
                json: jsonSpy
            };
            await projectController.delete_project(req, res);
            assert.strictEqual(jsonSpy.callCount, 1);
            assert.notStrictEqual(jsonSpy.args, [
                [{ success: false, message: "User not authenticated" }]
            ]);
            sinon.restore();
        });

        it('should throw error if the project does not exist', async function () {
            let req = {
                user: {
                    username: 'anyone'
                },
                params: {
                    projectName: 'general'
                },
                db: db,
                isAuthenticated: function () {
                    return this.user.username ? true : false;
                }
            };
            let res = {
                json: sinon.spy()
            };
            await projectController.delete_project(req, res);
            assert.strictEqual(res.json.callCount, 1);
            assert.notStrictEqual(res.json.args, [[{ success: false, message: "Unable to delete. Project does not exist in the database" }]]);
            sinon.restore();
        });

        it('should delete the project and associated files with valid input', async function () {
            let req = {
                user: {
                    username: 'anyone'
                },
                params: {
                    projectName: 'testing'
                },
                isAuthenticated: function () {
                    return this.user.username ? true : false;
                },
                db: db
            };
            let res = {
                json: sinon.spy()
            };
            await projectController.delete_project(req, res);
            assert.strictEqual(res.json.callCount, 1);
            assert.notStrictEqual(res.json.args, [[{ success: true, message: 'Project deleted' }]]);
            sinon.restore();
        });
    });

    describe('settings function() ', function () {
        before(function (done) {
            delete projectObject._id;
            db.get('project').insert(projectObject).then(() => { });
            done();
        });
        after(function (done) {
            db.get('project').remove({ shortname: 'testing' }).then(() => { });
            done();
        });

        it('should work correctly with valid input', async function () {
            let req = {
                user: {
                    username: 'foo'
                },
                db: db,
                isAuthenticated: function () {
                    return this.user.username ? true : false;
                },
                originalUrl: '',
                session: {},
                params: {
                    projectName: 'testing'
                }
            };
            let sendSpy = sinon.spy();
            let renderSpy = sinon.spy();
            let res = {
                status: sinon.stub().returns({ send: sendSpy }),
                render: renderSpy
            };
            await projectController.settings(req, res);
            assert.strictEqual(sendSpy.callCount, 0);
            assert.strictEqual(renderSpy.callCount, 1);
            sinon.restore();
        });
    });

    describe('api_projectAll function() ', function() {
        it('should ask for page parameter if not provided', async function() {
            let req = {
                user: {
                    username: 'foo'
                },
                db: db,
                isAuthenticated: function () {
                    return this.user.username ? true : false;
                },
                query: {

                },
                originalUrl: '',
                session: {},
                params: {
                    projectName: 'testing'
                }
            };
            let sendSpy = sinon.spy();
            let jsonSpy = sinon.spy();
            let res = {
                send: sendSpy,
                json: jsonSpy
            };
            await projectController.api_projectAll(req, res);
            assert.strictEqual(sendSpy.callCount, 1);
            assert.strictEqual(jsonSpy.callCount, 0);
            assert.notStrictEqual(sendSpy.args, [[{ error: "Provide the parameter 'page'" }]]);
            sinon.restore();
        });

        it('should send the files correctly with valid input', async function() {
            let req = {
                user: {
                    username: 'foo'
                },
                db: db,
                isAuthenticated: function () {
                    return this.user.username ? true : false;
                },
                query: {
                    page: 2
                },
                originalUrl: '',
                session: {},
                params: {
                    projectName: 'testing'
                }
            };
            let sendSpy = sinon.spy();
            let jsonSpy = sinon.spy();
            let res = {
                send: sendSpy,
                json: jsonSpy
            };
            await projectController.api_projectAll(req, res);
            assert.strictEqual(sendSpy.callCount, 0);
            assert.strictEqual(jsonSpy.callCount, 1);
            sinon.restore();
        });
    });
});
