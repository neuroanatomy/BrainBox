/* eslint-disable max-lines */
const assert = require('assert');
const projectController = require('../../controller/project/project.controller');
require('mocha-sinon');
const sinon = require('sinon');
const projectObject = require('../data/model_objects/project');
const { expect } = require('chai');
const U = require('../utils.js');

describe('Project Controller: ', function () {
  let db;
  before(function () {
    db = U.getDB();
  });

  describe('Validator function() ', function () {
    it('should pass successfully when validations are successful', async function () {
      const reqSpy = sinon.spy();
      const req = {
        params: {
          projectName: 'Braincat'
        },
        checkParams: sinon.stub().returns({ isAlphanumeric: reqSpy }),
        validationErrors: function () {
          if (this.params && this.params.projectName) {
            if (this.params.projectName !== '') { return null; }

            return new Error('Not alphanumeric!');

          }

          return new Error('Not alphanumeric!');

        }
      };
      const resSpy = sinon.spy();
      const res = {
        status: sinon.stub().returns({ send: sinon.stub().returns({ end: resSpy }) })
      };
      await projectController.validator(req, res, () => { /* do nothing */ });
      assert.strictEqual(resSpy.callCount, 0);
      assert.strictEqual(reqSpy.callCount, 1);
      sinon.restore();
    });

    it('should throw errors when validations fail', async function () {
      const reqSpy = sinon.spy();
      const req = {
        params: {
        },
        checkParams: sinon.stub().returns({ isAlphanumeric: reqSpy }),
        validationErrors: function () {
          if (this.params && this.params.projectName) {
            if (this.params.projectName !== '') { return null; }

            return new Error('Not alphanumeric!');

          }

          return new Error('Not alphanumeric!');

        }
      };
      const resSpy = sinon.spy();
      const res = {
        status: sinon.stub().returns({ send: sinon.stub().returns({ end: resSpy }) })
      };
      await projectController.validator(req, res, () => { /* do nothing */ });
      assert.strictEqual(resSpy.callCount, 1);
      assert.strictEqual(reqSpy.callCount, 1);
      sinon.restore();
    });
  });

  describe('project function() ', function () {
    before(function(done) {
      const testProject = projectObject;
      db.get('project').insert(testProject)
        .then(() => done());
    });

    after(function(done) {
      db.get('project').remove({ shortname: 'testing' })
        .then(() => done());
    });

    it('should return the project information correctly with valid input', async function () {
      const req = {
        params: {
          projectName: 'testing'
        },
        user: {
          username: 'anyone'
        },
        session: {},
        originalUrl: 'some url',
        isAuthenticated: function () {
          return Boolean(this.user.username);
        },
        db: db
      };
      const success = sinon.spy();
      const failure = sinon.spy();
      const res = {
        render: success,
        status: sinon.stub().returns({ send: failure })
      };
      await projectController.project(req, res);
      assert.strictEqual(success.callCount, 1);
      assert.strictEqual(failure.callCount, 0);
      assert.strictEqual(success.args[0].length, 2);
      assert.strictEqual(success.args[0][0], 'project');
      expect(success.args[0][1]).to.have.keys(['annotationsAccessLevel', 'loggedUser', 'projectInfo', 'projectName', 'title']);
      expect(success.args[0][1].title).to.equal('Unit Test');
      const projectInfo = JSON.parse(success.args[0][1].projectInfo);
      expect(projectInfo).to.deep.include({
        name: 'Unit Test',
        shortname: 'testing',
        owner: 'foo'
      });
      sinon.restore();
    });

    it('should throw errors with invalid input', async function () {
      const req = {
        params: {
          projectName: ''
        },
        user: {
          username: ''
        },
        session: {},
        originalUrl: 'some url',
        isAuthenticated: function () {
          return Boolean(this.user.username);
        },
        db: db
      };
      const success = sinon.spy();
      const failure = sinon.spy();
      const res = {
        render: success,
        status: sinon.stub().returns({ send: failure })
      };
      await projectController.project(req, res);
      assert.strictEqual(success.callCount, 0);
      assert.strictEqual(failure.callCount, 1);
      sinon.restore();
    });
  });

  describe('apiProject function() ', function () {

    before(function (done) {
      db.get('project').insert(projectObject)
        .then(() => done());
    });
    after(function(done) {
      db.get('project').remove({ shortname: 'testing' })
        .then(() => done());
    });

    it('should return the requested project information with valid input', async function () {
      const req = {
        params: {
          projectName: 'testing'
        },
        user: {
          username: 'anyone'
        },
        query: {
          var: 'collaborators/list/0'
        },
        isAuthenticated: function () {
          return Boolean(this.user.username);
        },
        db: db
      };
      const success = sinon.spy();
      const failure = sinon.spy();
      const res = {
        status: sinon.stub().returns({ send: failure }),
        json: success
      };
      await projectController.apiProject(req, res);
      assert.strictEqual(success.callCount, 1);
      assert.strictEqual(failure.callCount, 0);
      expect(success.args[0][0].username).to.equal('anyone');
      sinon.restore();
    });

    it('should return nothing with invalid input', async function () {
      const req = {
        params: {
          projectName: ''
        },
        user: {
          username: 'anyone'
        },
        session: {},
        originalUrl: 'some url',
        isAuthenticated: function () {
          return Boolean(this.user.username);
        },
        db: db
      };
      const resSpy = sinon.spy();
      const res = {
        send: resSpy
      };
      await projectController.apiProject(req, res);
      assert.strictEqual(resSpy.callCount, 1);
      expect(resSpy.args[0]).to.have.lengthOf(0);
      sinon.restore();
    });
  });

  describe('apiProjectFiles function() ', function () {
    it('should return the files with valid input', async function () {
      const req = {
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
          return Boolean(this.user.username);
        }
      };
      const resSpy = sinon.spy();
      const res = {
        send: resSpy
      };
      await projectController.apiProjectFiles(req, res);
      assert.strictEqual(resSpy.callCount, 1);
      expect(resSpy.args[0][0]).to.have.lengthOf(3);
      resSpy.args[0][0].forEach((i) => expect(i).to.have.keys('source', 'name'));
      sinon.restore();
    });

    it('should ask for start parameter when not provided.', async function () {
      const req = {
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
          return Boolean(this.user.username);
        }
      };
      const resSpy = sinon.spy();
      const res = {
        send: resSpy
      };
      await projectController.apiProjectFiles(req, res);
      assert.strictEqual(resSpy.callCount, 1);
      assert.deepStrictEqual(resSpy.args, [[{ error: 'Provide \'start\'' }]]);
      sinon.restore();
    });

    it('should ask for length parameter when not provided.', async function () {
      const req = {
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
          return Boolean(this.user.username);
        }
      };
      const resSpy = sinon.spy();
      const res = {
        send: resSpy
      };
      await projectController.apiProjectFiles(req, res);
      assert.strictEqual(resSpy.callCount, 1);
      assert.deepStrictEqual(resSpy.args, [[{ error: 'Provide \'length\'' }]]);
      sinon.restore();
    });
  });

  describe('newProject function() ', function () {
    it('should render the new project screen correctly for an anonymous user', async function () {
      const req = {
        db: db,
        user: {
        },
        isAuthenticated: function () {
          return Boolean(this.user.username);
        },
        session: {},
        originalUrl: 'some url'
      };
      const resSpy = sinon.spy();
      const res = {
        render: resSpy
      };
      await projectController.newProject(req, res);
      assert.deepStrictEqual(resSpy.args, [
        [
          'askForLogin',
          {
            functionality: 'create a new project',
            login: '<a href=\'/auth/github\'>Log in with GitHub</a>',
            title: 'BrainBox: New Project'
          }
        ]
      ]);
      assert.strictEqual(resSpy.args.length, 1);
      sinon.restore();
    });

    it('should render the new project page correctly for a logged in user', async function () {
      const req = {
        db: db,
        user: {
          username: 'anyone'
        },
        isAuthenticated: function () {
          return Boolean(this.user.username);
        },
        session: {},
        originalUrl: 'some url'
      };
      const resSpy = sinon.spy();
      const res = {
        render: resSpy
      };
      await projectController.newProject(req, res);
      assert.deepStrictEqual(resSpy.args, [
        [
          'projectNew',
          {
            loggedUser: '{"username":"anyone"}',
            title: 'BrainBox: New Project'
          }
        ]
      ]);
      assert.strictEqual(resSpy.args.length, 1);
      sinon.restore();
    });
  });

  describe('postProject function() ', function () {

    // should not be useful since anyone user should already exists
    // before(function (done) {
    //   db.get('user').insert({
    //     'name': 'Any Brainbox User',
    //     'nickname': 'anyone',
    //     'url': '',
    //     'brainboxURL': '/user/anyone',
    //     'avatarURL': '',
    //     'joined': '2020-05-01T08:26:35.348Z'
    //   })
    //     .then(() => done());
    // });

    after(function (done) {
      // anyone user should not be removed
      // db.get('user').remove({
      //   nickname: 'anyone'
      // })
      //   .then(() => {
      db.get('project').remove({
        shortname: 'testing'
      })
        .then(() => done());
      // });
    });
    it('should throw error if user is not authenticated', async function () {
      const req = {
        body: {
          data: {
            name: 'Testing'
          }
        },
        db: db,
        user: {
        },
        isAuthenticated: function () {
          return Boolean(this.user.username);
        },
        session: {},
        originalUrl: 'some url'
      };
      const json = sinon.spy();
      const res = {
        status: sinon.stub().returns({ json: json })
      };
      await projectController.postProject(req, res);
      assert.strictEqual(json.callCount, 1);
      expect(json.args[0][0]).to.include.key('error');
      sinon.restore();
    });

    it('should insert a project if the project does not exist.', async function () {
      const req = {
        user: {
          username: 'foo'
        },
        body: {
          data: projectObject
        },
        isAuthenticated: function () {
          return Boolean(this.user.username);
        },
        db: db,
        session: {
          returnTo: ''
        }
      };
      const jsonSpy = sinon.spy();
      const res = {
        json: sinon.spy(),
        status: sinon.stub().returns({ json: jsonSpy })
      };
      await projectController.postProject(req, res);
      assert.strictEqual(res.json.callCount, 1);
      assert.deepStrictEqual(res.json.args, [[{ success: true, message: 'New project inserted' }]]);
      sinon.restore();
    });
  });

  describe('deleteProject function() ', function () {
    before(function (done) {
      db.get('project').insert(projectObject)
        .then(() => done());
    });
    after(function(done) {
      db.get('project').remove({ shortname: 'testing' })
        .then(() => done());
    });

    it('should throw error if the user is not authenticated', async function () {
      const req = {
        user: {
        },
        isAuthenticated: function () {
          return Boolean(this.user.username);
        }
      };
      const jsonSpy = sinon.spy();
      const res = {
        status: sinon.stub().returns({ json: jsonSpy }),
        json: jsonSpy
      };
      await projectController.deleteProject(req, res);
      assert.strictEqual(jsonSpy.callCount, 1);
      assert.deepStrictEqual(jsonSpy.args, [[{ success: false, message: 'User not authenticated' }]]);
      sinon.restore();
    });

    it('should throw error if the project does not exist', async function () {
      const req = {
        user: {
          username: 'anyone'
        },
        params: {
          projectName: 'general'
        },
        db: db,
        isAuthenticated: function () {
          return Boolean(this.user.username);
        }
      };
      const jsonSpy = sinon.spy();
      const res = {
        json: jsonSpy,
        status: sinon.stub().returns({ json: jsonSpy })
      };
      await projectController.deleteProject(req, res);
      assert.strictEqual(res.status.callCount, 1);
      assert.deepStrictEqual(res.status.args, [[500]]);
      assert.strictEqual(jsonSpy.callCount, 1);
      assert.deepStrictEqual(jsonSpy.args, [[{ success: false, message: 'Unable to delete. Project does not exist in the database' }]]);
      sinon.restore();
    });

    it('should delete the project and associated files with valid input', async function () {
      const req = {
        user: {
          username: 'anyone'
        },
        params: {
          projectName: 'testing'
        },
        isAuthenticated: function () {
          return Boolean(this.user.username);
        },
        db: db
      };
      const res = {
        json: sinon.spy()
      };
      await projectController.deleteProject(req, res);
      assert.strictEqual(res.json.callCount, 1);
      assert.deepStrictEqual(res.json.args, [[{ success: true, message: 'Project deleted' }]]);
      sinon.restore();
    });
  });

  describe('settings function() ', function () {
    before(function (done) {
      delete projectObject._id;
      db.get('project').insert(projectObject)
        .then(() => done());
    });
    after(function (done) {
      db.get('project').remove({ shortname: 'testing' })
        .then(() => done());
    });

    it('should work correctly with valid input', async function () {
      const req = {
        user: {
          username: 'foo'
        },
        db: db,
        isAuthenticated: function () {
          return Boolean(this.user.username);
        },
        originalUrl: '',
        session: {},
        params: {
          projectName: 'testing'
        }
      };
      const sendSpy = sinon.spy();
      const renderSpy = sinon.spy();
      const res = {
        status: sinon.stub().returns({ send: sendSpy }),
        render: renderSpy
      };
      await projectController.settings(req, res);
      assert.strictEqual(sendSpy.callCount, 0);
      assert.strictEqual(renderSpy.callCount, 1);
      sinon.restore();
    });
  });

  describe('apiProjectAll function() ', function() {
    it('should ask for page parameter if not provided', async function() {
      const req = {
        user: {
          username: 'foo'
        },
        db: db,
        isAuthenticated: function () {
          return Boolean(this.user.username);
        },
        query: {

        },
        originalUrl: '',
        session: {},
        params: {
          projectName: 'testing'
        }
      };
      const sendSpy = sinon.spy();
      const jsonSpy = sinon.spy();
      const res = {
        send: sendSpy,
        json: jsonSpy
      };
      await projectController.apiProjectAll(req, res);
      assert.strictEqual(sendSpy.callCount, 1);
      assert.strictEqual(jsonSpy.callCount, 0);
      assert.deepStrictEqual(sendSpy.args, [[{ error: 'Provide the parameter \'page\'' }]]);
      sinon.restore();
    });

    it('should send the files correctly with valid input', async function() {
      const req = {
        user: {
          username: 'foo'
        },
        db: db,
        isAuthenticated: function () {
          return Boolean(this.user.username);
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
      const sendSpy = sinon.spy();
      const jsonSpy = sinon.spy();
      const res = {
        send: sendSpy,
        json: jsonSpy
      };
      await projectController.apiProjectAll(req, res);
      assert.strictEqual(sendSpy.callCount, 0);
      assert.strictEqual(jsonSpy.callCount, 1);
      sinon.restore();
    });
  });
});
