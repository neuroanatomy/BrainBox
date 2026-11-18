/* eslint-disable max-lines */
const assert = require('assert');
const httpMocks = require('node-mocks-http');
const projectController = require('../../controller/project/project.controller');
require('mocha-sinon');
const sinon = require('sinon');
const { Collection } = require('mongodb');
const projectObject = require('../data/model_objects/project');
const { expect } = require('chai');
const _ = require('lodash');
const U = require('../utils.js');
const { AccessControlService, jsonForScript } = require('neuroweblab');

describe('Project Controller: ', function () {
  let nativeDb; // native mongodb

  before(function () {
    nativeDb = U.getNativeDB();
  });

  describe('Validator function() ', function () {
    it('should pass successfully when validations are successful', async function () {
      const req = httpMocks.createRequest({
        params: {
          projectName: 'Braincat'
        }
      });
      const res = httpMocks.createResponse();
      await projectController.validator(req, res, () => { /* do nothing */ });
      assert.strictEqual(res.statusCode, 200);
    });

    it('should throw errors when validations fail', async function () {
      const req = httpMocks.createRequest({
        params: {
        }
      });
      const res = httpMocks.createResponse();
      await projectController.validator(req, res, () => { /* do nothing */ });
      assert.strictEqual(res.statusCode, 400);
      const resData = res._getData();
      assert.strictEqual(resData.error, 'incorrect project name');
      assert(Array.isArray(resData.errors));
      assert.strictEqual(resData.errors[0].msg, 'incorrect project name');
    });
  });

  describe('project function() ', function () {
    before(function (done) {
      const testProject = projectObject;
      nativeDb.collection('project').insertOne(testProject)
        .then(() => done());
    });

    after(function (done) {
      nativeDb.collection('project').deleteMany({ shortname: 'testing' })
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
        nativeDb: nativeDb
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
      expect(success.args[0][1]).to.have.keys(['annotationsAccessLevel', 'loggedUser', 'projectInfo', 'title']);
      // the page's title; the header's is projectInfo.name, and its user loggedUser (nwl-components' Header)
      expect(success.args[0][1].title).to.equal('Unit Test');
      expect(JSON.parse(success.args[0][1].loggedUser)).to.deep.equal({ username: 'anyone' });
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
        nativeDb: nativeDb
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
      nativeDb.collection('project').insertOne(projectObject)
        .then(() => done());
    });

    after(function (done) {
      nativeDb.collection('project').deleteMany({ shortname: 'testing' })
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
        nativeDb: nativeDb
      };
      const success = sinon.spy();
      const failure = sinon.spy();
      const res = {
        status: sinon.stub().returns({ send: failure, json: failure }),
        json: success
      };
      await projectController.apiProject(req, res);
      assert.strictEqual(success.callCount, 1);
      assert.strictEqual(failure.callCount, 0);
      expect(success.args[0][0].username).to.equal('anyone');
      sinon.restore();
    });

    // 404 {error} since 2026-11-11, as the page and the files route (shared suite 1.6; was 200 with an empty body)
    it('should answer 404 with a JSON error with invalid input', async function () {
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
        nativeDb: nativeDb
      };
      const json = sinon.spy();
      const send = sinon.spy();
      const res = {
        status: sinon.stub().returns({ json }),
        send
      };
      await projectController.apiProject(req, res);
      assert.deepStrictEqual(res.status.args, [[404]]);
      assert.strictEqual(json.callCount, 1);
      assert.strictEqual(typeof json.args[0][0].error, 'string');
      assert.strictEqual(send.callCount, 0);
      sinon.restore();
    });

    describe('a member who may not see the collaborators', function () {
      const shortname = 'testing-member-no-collaborators';
      const access = (collaborators, files, annotations) => ({ collaborators, files, annotations });

      before(async function () {
        // a copy of the fixture, without the _id the insert above gave it
        const project = JSON.parse(JSON.stringify(projectObject));
        delete project._id;
        await nativeDb.collection('project').insertOne({
          ...project,
          shortname,
          collaborators: {
            list: [
              { userID: 'anyone', access: access('none', 'none', 'none') },
              { userID: 'member', access: access('none', 'view', 'view') },
              { userID: 'filesonly', access: access('none', 'view', 'none') }
            ]
          },
          files: { list: [{ source: 'https://example.org/a.nii.gz', name: 'a' }] },
          // saved last by a collaborator the members may not see
          modifiedBy: 'hiddencollaborator'
        });
      });

      after(async function () {
        await nativeDb.collection('project').deleteMany({ shortname });
      });

      const getAs = async (username) => {
        const json = sinon.spy();
        const status = sinon.stub().returns({ json: sinon.spy() });
        await projectController.apiProject({
          params: { projectName: shortname },
          query: {},
          user: { username },
          isAuthenticated: () => true,
          nativeDb
        }, { json, status });
        sinon.restore();

        return json.callCount === 1 ? json.args[0][0] : null;
      };

      it('still gets the files and annotations their own access lets them see, without the collaborators', async function () {
        const project = await getAs('member');
        expect(project).to.not.equal(null);
        expect(project.collaborators.list.map((c) => c.userID)).to.deep.equal(['anyone']);
        expect(project.files.list).to.have.lengthOf(1);
        expect(project.annotations.list).to.have.lengthOf(1);
      });

      // the project page's projectInfo, for a user
      const pageAs = async (username) => {
        const render = sinon.spy();
        await projectController.project({
          params: { projectName: shortname },
          user: { username },
          session: {},
          originalUrl: '/project/' + shortname,
          isAuthenticated: () => true,
          nativeDb
        }, { render, status: sinon.stub().returns({ send: sinon.spy() }) });
        sinon.restore();

        return render.callCount === 1 ? JSON.parse(render.args[0][1].projectInfo) : null;
      };

      it('gets a project page without the other collaborators, with the annotations they may see', async function () {
        const projectInfo = await pageAs('member');
        expect(projectInfo).to.not.equal(null);
        expect(projectInfo.collaborators.list.map((c) => c.userID)).to.deep.equal(['anyone']);
        expect(projectInfo.annotations.list).to.have.lengthOf(1);
      });

      it('gets a project page without the annotations when they may not view them', async function () {
        const projectInfo = await pageAs('filesonly');
        expect(projectInfo).to.not.equal(null);
        expect(projectInfo.annotations.list).to.deep.equal([]);
      });

      it('is not told who saved the project last, by the JSON route or the project page', async function () {
        expect(await getAs('member')).to.not.have.property('modifiedBy');
        expect(await pageAs('member')).to.not.have.property('modifiedBy');
      });

      it('is not told who saved the project last by the settings page', async function () {
        const render = sinon.spy();
        await projectController.settings({
          params: { projectName: shortname },
          user: { username: 'member' },
          session: {},
          originalUrl: '/project/' + shortname + '/settings',
          isAuthenticated: () => true,
          nativeDb
        }, { render, status: sinon.stub().returns({ send: sinon.spy() }) });
        sinon.restore();
        expect(render.callCount).to.equal(1);
        expect(JSON.parse(render.args[0][1].projectInfo)).to.not.have.property('modifiedBy');
      });
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
        nativeDb: nativeDb,
        user: {
          username: 'anyone'
        },
        isAuthenticated: function () {
          return Boolean(this.user.username);
        }
      };
      const resSpy = sinon.spy();
      // NeuroWebLab's projectFilesRoute (1.17.0) answers with res.json; an error goes to next
      const res = {
        json: resSpy
      };
      const next = sinon.spy();
      await projectController.apiProjectFiles(req, res, next);
      assert.strictEqual(next.callCount, 0);
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
        nativeDb: nativeDb,
        user: {
          username: 'anyone'
        },
        isAuthenticated: function () {
          return Boolean(this.user.username);
        }
      };
      const resSpy = sinon.spy();
      // NeuroWebLab's projectFilesRoute (1.17.0) answers with res.json; an error goes to next
      const res = {
        json: resSpy
      };
      const next = sinon.spy();
      await projectController.apiProjectFiles(req, res, next);
      assert.strictEqual(next.callCount, 0);
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
        nativeDb: nativeDb,
        user: {
          username: 'anyone'
        },
        isAuthenticated: function () {
          return Boolean(this.user.username);
        }
      };
      const resSpy = sinon.spy();
      // NeuroWebLab's projectFilesRoute (1.17.0) answers with res.json; an error goes to next
      const res = {
        json: resSpy
      };
      const next = sinon.spy();
      await projectController.apiProjectFiles(req, res, next);
      assert.strictEqual(next.callCount, 0);
      assert.strictEqual(resSpy.callCount, 1);
      assert.deepStrictEqual(resSpy.args, [[{ error: 'Provide \'length\'' }]]);
      sinon.restore();
    });
  });

  describe('newProject function() ', function () {
    it('should render the new project screen correctly for an anonymous user', async function () {
      const req = {
        nativeDb: nativeDb,
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
            loggedUser: 'null',
            title: 'BrainBox: New Project'
          }
        ]
      ]);
      assert.strictEqual(resSpy.args.length, 1);
      sinon.restore();
    });

    it('should render the new project page correctly for a logged in user', async function () {
      const req = {
        nativeDb: nativeDb,
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

    after(function (done) {
      // the anyone user should not be removed
      nativeDb.collection('project').deleteMany({
        shortname: 'testing'
      })
        .then(() => done());
    });

    it('should throw error if user is not authenticated', async function () {
      const req = {
        body: {
          data: {
            name: 'Testing'
          }
        },
        nativeDb: nativeDb,
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
        // the project is found by the URL's shortname (shared suite 2.6)
        params: { projectName: projectObject.shortname },
        body: {
          data: projectObject
        },
        isAuthenticated: function () {
          return Boolean(this.user.username);
        },
        nativeDb: nativeDb,
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

    // the settings page sends back the projectInfo it was given, edited (shared suite 2.5, 2.6, 2.18)
    const settingsAs = async (shortname, username) => {
      const render = sinon.spy();
      await projectController.settings({
        params: { projectName: shortname },
        user: { username },
        session: {},
        originalUrl: '/project/' + shortname + '/settings',
        isAuthenticated: () => true,
        nativeDb
      }, { render, status: sinon.stub().returns({ send: sinon.spy() }) });
      sinon.restore();

      return JSON.parse(render.args[0][1].projectInfo);
    };
    const saveAs = async (shortname, username, data) => {
      const json = sinon.spy();
      const send = sinon.spy();
      await projectController.postProject({
        params: { projectName: shortname },
        user: { username },
        body: { data },
        session: {},
        isAuthenticated: () => true,
        nativeDb
      }, { json, status: sinon.stub().returns({ json, send }) });
      sinon.restore();

      return json.args.concat(send.args).map((args) => args[0]);
    };
    const storedProject = (shortname) => nativeDb.collection('project').findOne({ shortname, backup: { $exists: false } });

    describe('what the settings page sends', function () {
      const shortname = 'testing-settings-page';

      after(async function () {
        await nativeDb.collection('project').deleteMany({ shortname });
      });

      it('creates a project with a hyphen in its shortname, owned and last modified by its creator', async function () {
        const page = await settingsAs(shortname, 'foo');
        page.name = 'Settings page';
        page.annotations.list = [{ type: 'volume', name: 'Layer', values: 'foreground.json' }];
        expect(await saveAs(shortname, 'foo', page)).to.deep.equal([{ success: true, message: 'New project inserted' }]);
        const project = await storedProject(shortname);
        expect(project).to.include({ shortname, owner: 'foo', modifiedBy: 'foo' });
        expect(Date.parse(project.modified)).to.be.above(Date.now() - 60000);
        expect(project).to.not.have.property('filesLoaded');
      });

      it('saves it again, keeping the stored owner whatever the page sends', async function () {
        const page = await settingsAs(shortname, 'foo');
        page.name = 'Settings page, saved again';
        page.owner = 'bar';
        const [answer] = await saveAs(shortname, 'foo', page);
        expect(answer).to.include({ success: true });
        expect(await storedProject(shortname)).to.include({ name: 'Settings page, saved again', owner: 'foo', modifiedBy: 'foo' });
      });
    });

    // the page loads the files 100 at a time, and says how many it received (filesLoaded); BrainBox only (2.21)
    describe('the settings page saving its files, loaded in batches', function () {
      const shortname = 'testing-settings-files';
      const sources = [
        'https://example.org/testing-settings-files/0.nii.gz',
        'https://example.org/testing-settings-files/1.nii.gz',
        'https://example.org/testing-settings-files/2.nii.gz'
      ];
      const source = (i) => sources[i];
      // as GET /project/json/:p/files?names=true gives them: the names of the MRI documents
      const loadedFiles = () => [{ source: source(0), name: 'Scan (2019)' }, { source: source(1), name: '' }, { source: source(2), name: '' }];

      beforeEach(async function () {
        await nativeDb.collection('project').deleteMany({ shortname });
        await nativeDb.collection('mri').deleteMany({ source: { $in: sources } });
        await nativeDb.collection('project').insertOne({
          ..._.cloneDeep(_.omit(U.projectTest, ['collaborators'])),
          shortname,
          brainboxURL: '/project/' + shortname,
          owner: 'foo',
          description: 'Stored description',
          collaborators: { list: [{ userID: 'anyone', nickname: 'anyone', access: { collaborators: 'view', annotations: 'edit', files: 'view' } }] },
          files: { list: sources }
        });
        // a name stored before the characters of file names were checked
        await nativeDb.collection('mri').insertOne({ source: source(0), name: 'Scan (2019)', mri: { atlas: [] } });
      });

      after(async function () {
        await nativeDb.collection('project').deleteMany({ shortname });
        await nativeDb.collection('mri').deleteMany({ source: { $in: sources } });
      });

      it('keeps the stored files when the page saves before they all arrived, and saves the rest', async function () {
        const page = await settingsAs(shortname, 'foo');
        page.files.list = loadedFiles().slice(0, 1);
        page.filesLoaded = { count: 1 };
        page.name = 'Saved while loading';
        const [answer] = await saveAs(shortname, 'foo', page);
        expect(answer).to.include({ success: true });
        expect(answer.message).to.include('not been completely loaded');
        expect(answer.message).to.not.include('ignored');
        const project = await storedProject(shortname);
        expect(project.files.list).to.deep.equal(sources);
        expect(project).to.include({ name: 'Saved while loading', description: 'Stored description' });
        expect(project).to.not.have.property('filesLoaded');
      });

      it('saves the complete list, with a stored file name that the checks would refuse (2.14)', async function () {
        const page = await settingsAs(shortname, 'foo');
        page.files.list = loadedFiles().slice(0, 2);
        page.filesLoaded = { count: 3 };
        const [answer] = await saveAs(shortname, 'foo', page);
        expect(answer).to.include({ success: true });
        expect((await storedProject(shortname)).files.list).to.deep.equal(sources.slice(0, 2));
        const mri = await nativeDb.collection('mri').findOne({ source: source(0), backup: { $exists: false } });
        expect(mri.name).to.equal('Scan (2019)');
      });

      it('refuses that name given to another file', async function () {
        const page = await settingsAs(shortname, 'foo');
        page.files.list = loadedFiles();
        page.files.list[1].name = 'Scan (2019)';
        page.filesLoaded = { count: 3 };
        const [answer] = await saveAs(shortname, 'foo', page);
        expect(answer).to.deep.equal({ error: 'Invalid file name "Scan (2019)"' });
        expect((await storedProject(shortname)).files.list).to.deep.equal(sources);
      });
    });

    // rows saved long ago, of a shape or with values that today's checks refuse (2.9, 2.14)
    describe('the settings page saving a project with an old row', function () {
      const shortname = 'testing-old-row';
      // named by nickname only, without collaborators access, of a user removed since
      const oldRow = { nickname: 'testing-gone-user', access: { annotations: 'view', files: 'view' } };

      before(async function () {
        await nativeDb.collection('project').deleteMany({ shortname });
        await nativeDb.collection('project').insertOne({
          ..._.cloneDeep(_.omit(U.projectTest, ['collaborators', 'files'])),
          shortname,
          brainboxURL: '/project/' + shortname,
          owner: 'foo',
          collaborators: { list: [{ userID: 'anyone', nickname: 'anyone', access: { collaborators: 'view', annotations: 'edit', files: 'view' } }, oldRow] },
          files: { list: [] }
        });
      });

      after(async function () {
        await nativeDb.collection('project').deleteMany({ shortname });
      });

      it('saves, keeping the row as it is', async function () {
        const page = await settingsAs(shortname, 'foo');
        page.name = 'Saved with an old row';
        const [answer] = await saveAs(shortname, 'foo', page);
        expect(answer).to.include({ success: true });
        const project = await storedProject(shortname);
        expect(project.name).to.equal('Saved with an old row');
        expect(project.collaborators.list[1]).to.include({ nickname: oldRow.nickname });
        expect(project.collaborators.list[1].access).to.deep.equal(oldRow.access);
      });

      it('checks the row once it is changed', async function () {
        const page = await settingsAs(shortname, 'foo');
        page.collaborators.list[1].access.files = 'edit';
        const [answer] = await saveAs(shortname, 'foo', page);
        // NWL validateProject's text (T002 M13c; was 'Access values are invalid')
        expect(answer).to.deep.equal({ error: 'Collaborator testing-gone-user has invalid access values (allowed: none, view, edit, add, remove)' });
        expect((await storedProject(shortname)).collaborators.list[1].access).to.deep.equal(oldRow.access);
      });
    });

    // strings are sanitised one by one, as text (2.12): "&" was turned into "&amp;" in every field
    describe('the settings page saving sources with "&"', function () {
      const shortname = 'testing-ampersand';
      const sources = [
        'https://example.org/testing-ampersand/scan.nii.gz?a=1&b=2',
        // stored by the old sanitising
        'https://example.org/testing-ampersand/old.nii.gz?a=1&amp;b=2'
      ];
      const added = 'https://example.org/testing-ampersand/new.nii.gz?a=1&b=2';
      const loadedFiles = () => [{ source: sources[0], name: 'Scan' }, { source: sources[1], name: 'Old' }];
      const currentMRI = (source) => nativeDb.collection('mri').findOne({ source, backup: { $exists: false } });

      before(async function () {
        await nativeDb.collection('project').deleteMany({ shortname });
        await nativeDb.collection('mri').deleteMany({ source: { $regex: '^https://example\\.org/testing-ampersand/' } });
        await nativeDb.collection('project').insertOne({
          ..._.cloneDeep(_.omit(U.projectTest, ['collaborators', 'annotations'])),
          shortname,
          brainboxURL: '/project/' + shortname,
          owner: 'foo',
          collaborators: { list: [{ userID: 'anyone', nickname: 'anyone', access: { collaborators: 'view', annotations: 'edit', files: 'view' } }] },
          // a layer named by the old sanitising
          annotations: { list: [{ type: 'volume', name: 'R&amp;D', values: 'foreground.json' }] },
          files: { list: sources }
        });
        await nativeDb.collection('mri').insertMany([
          { source: sources[0], name: 'Scan', mri: { atlas: [] } },
          { source: sources[1], name: 'Old', mri: { atlas: [] } }
        ]);
      });

      after(async function () {
        await nativeDb.collection('project').deleteMany({ shortname });
        await nativeDb.collection('mri').deleteMany({ source: { $regex: '^https://example\\.org/testing-ampersand/' } });
      });

      it('saves the stored sources and layer again unchanged, "&amp;" included', async function () {
        const page = await settingsAs(shortname, 'foo');
        page.files.list = loadedFiles();
        page.filesLoaded = { count: 2 };
        page.name = 'Saved with ampersands';
        // markup anywhere in the body made the old sanitising escape "&" in every field
        page.annotations.list.push({ type: 'text', name: 'Notes <i>new</i>', values: '' });
        const [answer] = await saveAs(shortname, 'foo', page);
        expect(answer).to.include({ success: true });
        const project = await storedProject(shortname);
        expect(project.files.list).to.deep.equal(sources);
        expect(project.annotations.list.map((a) => a.name)).to.deep.equal(['R&amp;D', 'Notes new']);
        expect(await currentMRI(sources[0])).to.include({ name: 'Scan' });
        expect(await currentMRI(sources[1])).to.include({ name: 'Old' });
      });

      it('stores a new source with "&" unchanged', async function () {
        const page = await settingsAs(shortname, 'foo');
        page.files.list = [...loadedFiles(), { source: added, name: 'New <b>scan</b>' }];
        page.filesLoaded = { count: 2 };
        const [answer] = await saveAs(shortname, 'foo', page);
        expect(answer).to.include({ success: true });
        expect((await storedProject(shortname)).files.list).to.deep.equal([...sources, added]);
        expect(await currentMRI(added)).to.include({ source: added, name: 'New scan' });
      });
    });

    // names non-empty, no duplicates ignoring case; BrainBox's layer types (2.10); stored layers as they are (2.14)
    describe('the settings page saving layers', function () {
      const shortname = 'testing-layers';

      beforeEach(async function () {
        await nativeDb.collection('project').deleteMany({ shortname });
        await nativeDb.collection('project').insertOne({
          ..._.cloneDeep(_.omit(U.projectTest, ['collaborators', 'files', 'annotations'])),
          shortname,
          brainboxURL: '/project/' + shortname,
          owner: 'foo',
          collaborators: { list: [{ userID: 'anyone', nickname: 'anyone', access: { collaborators: 'view', annotations: 'edit', files: 'view' } }] },
          // stored before names were checked
          annotations: { list: [{ type: 'volume', name: 'Layer', values: 'foreground.json' }, { type: 'text', name: 'layer', values: '' }] },
          files: { list: [] }
        });
      });

      after(async function () {
        await nativeDb.collection('project').deleteMany({ shortname });
      });

      it('saves the stored layers, named alike, and new text layers', async function () {
        const page = await settingsAs(shortname, 'foo');
        page.annotations.list.push(
          { type: 'text', name: 'Notes', values: '' },
          { type: 'multiple choices', name: 'Quality', values: 'good, bad' },
          { type: 'hidden text', name: 'Hidden', values: '' }
        );
        const [answer] = await saveAs(shortname, 'foo', page);
        expect(answer).to.include({ success: true });
        expect((await storedProject(shortname)).annotations.list.map((a) => a.name)).to.deep.equal(['Layer', 'layer', 'Notes', 'Quality', 'Hidden']);
      });

      it('refuses a layer renamed as another, ignoring case', async function () {
        const page = await settingsAs(shortname, 'foo');
        page.annotations.list[1].name = ' LAYER ';
        const [answer] = await saveAs(shortname, 'foo', page);
        expect(answer).to.have.property('error').that.includes('same name');
        expect((await storedProject(shortname)).annotations.list[1].name).to.equal('layer');
      });

      it('refuses a layer of an unknown type, or without a name', async function () {
        for (const layer of [{ type: 'nosuchtype', name: 'Other', values: '' }, { type: 'volume', name: ' ', values: 'foreground.json' }]) {
          // eslint-disable-next-line no-await-in-loop
          const page = await settingsAs(shortname, 'foo');
          page.annotations.list.push(layer);
          // eslint-disable-next-line no-await-in-loop
          const [answer] = await saveAs(shortname, 'foo', page);
          expect(answer).to.have.property('error');
        }
        expect((await storedProject(shortname)).annotations.list).to.have.length(2);
      });
    });

    // NWL's keepListsWithoutEditRights (1.19.0, T002 M12c) compares the rows on rowKey (2.4, 2.26)
    describe('a collaborator who may only view the layers', function () {
      const shortname = 'testing-layer-display';

      before(async function () {
        await nativeDb.collection('project').deleteMany({ shortname });
        await nativeDb.collection('project').insertOne({
          ..._.cloneDeep(_.omit(U.projectTest, ['collaborators', 'files', 'annotations'])),
          shortname,
          brainboxURL: '/project/' + shortname,
          owner: 'foo',
          collaborators: {
            list: [
              { userID: 'anyone', nickname: 'anyone', access: { collaborators: 'none', annotations: 'none', files: 'none' } },
              { userID: 'bar', nickname: 'bar', access: { collaborators: 'view', annotations: 'view', files: 'edit' } }
            ]
          },
          annotations: { list: [{ type: 'volume', name: 'Layer', values: 'foreground.json', display: 'true' }] },
          files: { list: [] }
        });
      });

      after(async function () {
        await nativeDb.collection('project').deleteMany({ shortname });
      });

      it('is not told a layer change was ignored when only what rowKey ignores (display) changed', async function () {
        const page = await settingsAs(shortname, 'bar');
        page.annotations.list[0].display = 'false';
        const [answer] = await saveAs(shortname, 'bar', page);
        expect(answer).to.include({ success: true });
        expect(answer.message).to.not.include('ignored');
        expect((await storedProject(shortname)).annotations.list[0]).to.include({ name: 'Layer', display: 'false' });
      });
    });

    // NWL's validateProject (1.20.0, T002 M13c) with BrainBox's rules: the stored values are kept as
    // they are (checkStoredFields and checkStoredKeys false), the rights come before the validation
    describe('a stored project with values today\'s checks refuse', function () {
      const shortname = 'testing-stored-values';
      const anyone = { userID: 'anyone', nickname: 'anyone', access: { collaborators: 'view', annotations: 'view', files: 'view' } };
      // stored by an API client: a username that differs from the userID
      const differentKeys = { userID: 'foo', nickname: 'foo', username: 'testing-other-name', access: { collaborators: 'edit', annotations: 'edit', files: 'edit' } };
      const viewer = { userID: 'testing-viewer', nickname: 'testing-viewer', access: { collaborators: 'view', annotations: 'view', files: 'view' } };

      beforeEach(async function () {
        await nativeDb.collection('project').deleteMany({ shortname });
        await nativeDb.collection('project').insertOne({
          ..._.cloneDeep(_.omit(U.projectTest, ['collaborators', 'files', 'annotations'])),
          shortname,
          brainboxURL: '/project/' + shortname,
          owner: 'foo',
          name: 'Stored (before the checks)',
          description: null,
          collaborators: { list: [anyone, differentKeys, viewer] },
          annotations: { list: [{ type: 'volume', name: 'Layer', values: 'foreground.json' }] },
          files: { list: [] }
        });
      });

      after(async function () {
        await nativeDb.collection('project').deleteMany({ shortname: { $in: [shortname, 'testing-no-files-list'] } });
      });

      it('saves what the settings page sends back unchanged, a null description and a name with parentheses included', async function () {
        const page = await settingsAs(shortname, 'foo');
        const [answer] = await saveAs(shortname, 'foo', page);
        expect(answer).to.include({ success: true });
        const project = await storedProject(shortname);
        expect(project).to.include({ name: 'Stored (before the checks)', description: null });
      });

      it('saves a stored row whose username and userID differ, sent back as it is stored', async function () {
        const data = _.omit(await storedProject(shortname), ['_id']);
        const [answer] = await saveAs(shortname, 'foo', data);
        expect(answer).to.include({ success: true });
        expect((await storedProject(shortname)).collaborators.list[1]).to.deep.equal(differentKeys);
      });

      it('refuses a new row whose username and userID differ', async function () {
        const page = await settingsAs(shortname, 'foo');
        page.collaborators.list.push({ userID: 'foo', username: 'testing-viewer', access: { collaborators: 'view', annotations: 'view', files: 'view' } });
        const [answer] = await saveAs(shortname, 'foo', page);
        expect(answer).to.deep.equal({ error: 'Collaborator 4 has a different username (testing-viewer) and userID (foo): they must be equal' });
      });

      it('answers a user who may not save 403, not what is wrong with the document', async function () {
        const page = await settingsAs(shortname, 'foo');
        page.annotations.list.push({ type: 'nosuchtype', name: 'Other', values: '' });
        const [answer] = await saveAs(shortname, 'testing-viewer', page);
        expect(answer).to.include({ success: false });
        expect(answer.error).to.match(/edit rights/);
      });

      it('refuses a new project without a files list with a 400 (was 500)', async function () {
        const [answer] = await saveAs('testing-no-files-list', 'foo', {
          shortname: 'testing-no-files-list',
          collaborators: { list: [anyone] },
          annotations: { list: [{ type: 'volume', name: 'Layer', values: 'foreground.json' }] }
        });
        expect(answer).to.deep.equal({ error: 'The project needs a files list' });
        expect(await storedProject('testing-no-files-list')).to.equal(null);
      });
    });

    // NWL's project versions (1.16.0, T002 M9c): of two current versions (a failure between the two
    // writes of a save), every read takes the newest _id, and a save leaves one
    describe('a project with two current versions', function () {
      const shortname = 'testing-two-current';
      const stored = (name, description) => ({
        ..._.cloneDeep(_.omit(U.projectTest, ['collaborators'])),
        shortname,
        brainboxURL: '/project/' + shortname,
        owner: 'foo',
        name,
        description,
        collaborators: { list: [{ userID: 'anyone', nickname: 'anyone', access: { collaborators: 'view', annotations: 'view', files: 'view' } }] },
        files: { list: [] }
      });
      const versions = () => nativeDb.collection('project').find({ shortname })
        .sort({ _id: 1 })
        .toArray();
      // the first updateMany of this project's versions fails; the stub counts the failures
      const failFirstMarking = () => {
        const { updateMany } = Collection.prototype;
        const stub = { failed: 0 };
        sinon.stub(Collection.prototype, 'updateMany').callsFake(function (filter, ...rest) {
          // eslint-disable-next-line no-invalid-this
          if (this.collectionName === 'project' && filter && filter.shortname === shortname && stub.failed === 0) {
            stub.failed += 1;

            return Promise.reject(new Error('updateMany failed'));
          }

          // eslint-disable-next-line no-invalid-this
          return updateMany.call(this, filter, ...rest);
        });

        return stub;
      };

      beforeEach(async function () {
        await nativeDb.collection('project').deleteMany({ shortname });
        // the newest _id second
        await nativeDb.collection('project').insertOne(stored('Older', 'Older description'));
        await nativeDb.collection('project').insertOne(stored('Newer', 'Newer description'));
      });

      after(async function () {
        await nativeDb.collection('project').deleteMany({ shortname });
      });

      it('gives the newest in the project page, its JSON and the settings page', async function () {
        const request = {
          params: { projectName: shortname },
          user: { username: 'foo' },
          query: {},
          session: {},
          originalUrl: '/project/' + shortname,
          isAuthenticated: () => true,
          nativeDb
        };
        const render = sinon.spy();
        const json = sinon.spy();
        const failure = sinon.spy();
        await projectController.project(request, { render, status: sinon.stub().returns({ send: failure }) });
        await projectController.apiProject(request, { json, status: sinon.stub().returns({ send: failure, json: failure }) });
        sinon.restore();
        expect(failure.callCount).to.equal(0);
        expect(render.args[0][1].title).to.equal('Newer');
        expect(json.args[0][0].name).to.equal('Newer');
        expect((await settingsAs(shortname, 'foo')).name).to.equal('Newer');
      });

      it('saves over the newest, and leaves one current version', async function () {
        const page = await settingsAs(shortname, 'foo');
        // a field the page does not send is kept from the stored project: the newest
        delete page.description;
        page.name = 'Saved';
        const [answer] = await saveAs(shortname, 'foo', page);
        expect(answer).to.include({ success: true });
        const all = await versions();
        expect(all).to.have.length(3);
        expect(all.slice(0, 2).map((v) => v.backup)).to.deep.equal([true, true]);
        expect(all[2]).to.not.have.property('backup');
        expect(all[2]).to.include({ name: 'Saved', description: 'Newer description', modifiedBy: 'foo' });
      });

      // insert, then mark the others backup: a failure between the two leaves two current versions, not none
      it('keeps the version saved when marking the others backup fails', async function () {
        await nativeDb.collection('project').deleteMany({ shortname, name: 'Older' });
        const page = await settingsAs(shortname, 'foo');
        page.name = 'Saved';
        const stub = failFirstMarking();
        const json = sinon.spy();
        try {
          await projectController.postProject({
            params: { projectName: shortname },
            user: { username: 'foo' },
            body: { data: page },
            session: {},
            isAuthenticated: () => true,
            nativeDb
          }, { json, status: sinon.stub().returns({ json, send: json }) });
        } finally {
          sinon.restore();
        }
        expect(stub.failed).to.equal(1);
        const currents = (await versions()).filter((v) => !('backup' in v));
        expect(currents.map((v) => v.name)).to.deep.equal(['Newer', 'Saved']);
        const [newest] = await nativeDb.collection('project')
          .find({ shortname, backup: { $exists: false } })
          .sort({ _id: -1 })
          .limit(1)
          .toArray();
        expect(newest).to.include({ name: 'Saved', modifiedBy: 'foo' });
      });
    });
  });

  describe('deleteProject function() ', function () {
    before(function (done) {
      nativeDb.collection('project').insertOne(projectObject)
        .then(() => done());
    });

    after(function (done) {
      nativeDb.collection('project').deleteMany({ shortname: 'testing' })
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
        nativeDb: nativeDb,
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
      assert.deepStrictEqual(res.status.args, [[404]]);
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
        nativeDb: nativeDb
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
      nativeDb.collection('project').insertOne(projectObject)
        .then(() => done());
    });

    after(function (done) {
      nativeDb.collection('project').deleteMany({ shortname: 'testing' })
        .then(() => done());
    });

    it('should work correctly with valid input', async function () {
      const req = {
        user: {
          username: 'foo'
        },
        nativeDb: nativeDb,
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

  // projectInfo goes into an inline <script> (project.mustache, projectSettings.mustache): a
  // project name with `</script>` must not close it
  describe('projectInfo in the project and settings pages', function () {
    const hostileName = '</script><img src=x onerror=alert(1)><!--';

    before(async function () {
      const doc = { ..._.cloneDeep(projectObject), shortname: 'scriptname', name: hostileName };
      delete doc._id;
      await nativeDb.collection('project').insertOne(doc);
    });

    after(async function () {
      await nativeDb.collection('project').deleteMany({ shortname: 'scriptname' });
    });

    const pageContext = async function (page) {
      const req = {
        user: { username: 'foo' },
        nativeDb: nativeDb,
        isAuthenticated: function () { return Boolean(this.user.username); },
        originalUrl: '',
        session: {},
        params: { projectName: 'scriptname' }
      };
      const render = sinon.spy();
      await projectController[page](req, { render, status: sinon.stub().returns({ send: sinon.spy() }) });
      sinon.restore();

      return render.args[0][1];
    };

    for (const page of ['project', 'settings']) {
      it(`${page} page: no < or > in projectInfo, and the name survives`, async function () {
        const { projectInfo } = await pageContext(page);
        expect(projectInfo).to.not.match(/[<>]/u);
        expect(JSON.parse(projectInfo).name).to.equal(hostileName);
      });
    }
  });

  // T002 M7c: the project JSON, project page and settings page hide through NWL visibleProject
  describe('what a visitor sees, through NWL visibleProject (M7c)', function () {
    const access = (collaborators, files, annotations) => ({ collaborators, files, annotations });

    describe('an anyone row with only a username', function () {
      const shortname = 'm7c-anyone-username';

      before(async function () {
        await nativeDb.collection('project').insertOne({
          name: 'M7c',
          shortname,
          owner: 'm7cowner',
          created: '2026-11-17T00:00:00.000Z',
          collaborators: {
            list: [
              { username: 'anyone', access: access('none', 'none', 'none') },
              { userID: 'm7cmember', access: access('none', 'view', 'view') },
              { userID: 'm7chidden', access: access('view', 'view', 'view') }
            ]
          },
          files: { list: [] },
          annotations: { list: [] }
        });
      });

      after(async function () {
        await nativeDb.collection('project').deleteMany({ shortname });
      });

      it('is kept for a visitor who may not view the collaborators', async function () {
        const json = sinon.spy();
        await projectController.apiProject({
          params: { projectName: shortname },
          query: {},
          user: { username: 'm7cmember' },
          isAuthenticated: () => true,
          nativeDb
        }, { json, status: sinon.stub().returns({ json: sinon.spy() }) });
        sinon.restore();
        expect(json.callCount).to.equal(1);
        expect(json.args[0][0].collaborators.list).to.deep.equal([{ username: 'anyone', access: access('none', 'none', 'none') }]);
      });
    });

    // the settings page's projectInfo, byte for byte as before M7c, for each kind of visitor
    describe('the settings page\'s projectInfo', function () {
      const shortname = 'm7c-settings';
      const stored = () => ({
        name: 'M7c settings',
        shortname,
        owner: 'm7cowner',
        created: '2026-11-17T00:00:00.000Z',
        collaborators: {
          list: [
            { userID: 'anyone', access: access('none', 'view', 'none') },
            { userID: 'm7ccollab', access: access('view', 'view', 'view') },
            { userID: 'm7cmember', access: access('none', 'view', 'view') }
          ]
        },
        files: { list: [{ source: 'https://example.org/m7c-a.nii.gz', name: 'a' }, { source: 'https://example.org/m7c-b.nii.gz', name: 'b' }] },
        annotations: { list: [{ type: 'volume', name: 'Layer', values: 'layer.json', display: 'true' }] },
        modifiedBy: 'm7ccollab'
      });

      before(async function () {
        await nativeDb.collection('project').insertOne(stored());
      });

      after(async function () {
        await nativeDb.collection('project').deleteMany({ shortname });
      });

      // the settings page's filter before M7c (controller/project/project.controller.js, e37e5fd)
      const asBeforeM7c = async (loggedUser) => {
        const json = stored();
        json.files.list = [];
        json.filesLoaded = { count: 0 };
        const filteredJSON = _.cloneDeep(json);
        if (AccessControlService.canViewCollaborators(json, loggedUser)) {
          const names = await Promise.all(filteredJSON.collaborators.list.map((c) => nativeDb.collection('user')
            .findOne({ nickname: c.userID, backup: { $exists: false } }, { projection: { name: 1, _id: 0 } })));
          names.forEach((found, j) => {
            filteredJSON.collaborators.list[j].username = filteredJSON.collaborators.list[j].userID;
            filteredJSON.collaborators.list[j].name = found ? found.name : '';
          });
        } else {
          filteredJSON.collaborators.list = json.collaborators.list.filter((c) => c.userID === 'anyone');
          delete filteredJSON.modifiedBy;
        }
        if (!AccessControlService.canViewAnnotations(json, loggedUser)) {
          filteredJSON.annotations.list = [];
        }

        return jsonForScript(filteredJSON);
      };

      const settingsFor = async (username) => {
        const render = sinon.spy();
        await projectController.settings({
          params: { projectName: shortname },
          user: username ? { username } : null,
          session: {},
          originalUrl: '/project/' + shortname + '/settings',
          isAuthenticated: () => Boolean(username),
          nativeDb
        }, { render, status: sinon.stub().returns({ send: sinon.spy() }) });
        sinon.restore();
        expect(render.callCount).to.equal(1);

        return render.args[0][1].projectInfo;
      };

      for (const [kind, username] of [
        ['the owner', 'm7cowner'],
        ['a collaborator who may view the collaborators', 'm7ccollab'],
        ['a collaborator who may not view the collaborators', 'm7cmember'],
        ['a logged-in stranger, with anyone\'s rights', 'm7cstranger'],
        ['a logged-out visitor', null]
      ]) {
        it(`is unchanged for ${kind}`, async function () {
          expect(await settingsFor(username)).to.equal(await asBeforeM7c(username || 'anonymous'));
        });
      }
    });
  });

  describe('apiProjectAll function() ', function () {
    it('should ask for page parameter if not provided', async function () {
      const req = {
        user: {
          username: 'foo'
        },
        nativeDb: nativeDb,
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
      // NeuroWebLab's projectListRoute (1.17.0) answers with res.json
      await projectController.apiProjectAll(req, res);
      assert.strictEqual(sendSpy.callCount, 0);
      assert.strictEqual(jsonSpy.callCount, 1);
      assert.deepStrictEqual(jsonSpy.args, [[{ error: 'Provide the parameter \'page\'' }]]);
      sinon.restore();
    });

    it('should send the files correctly with valid input', async function () {
      const req = {
        user: {
          username: 'foo'
        },
        nativeDb: nativeDb,
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
      const next = sinon.spy();
      await projectController.apiProjectAll(req, res, next);
      assert.strictEqual(next.callCount, 0);
      assert.strictEqual(sendSpy.callCount, 0);
      assert.strictEqual(jsonSpy.callCount, 1);
      sinon.restore();
    });
  });
});
