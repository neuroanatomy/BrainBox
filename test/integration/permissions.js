/* eslint-disable max-lines */
'use strict';

const chai = require('chai');
var {assert, expect} = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');
const puppeteer = require('puppeteer');
const _ = require('lodash');

describe('TESTING PERMISSIONS', function () {
  const forbiddenStatusCodes = [403, 401];
  let cookies = [];
  let token = '';
  let agent;

  before(async function () {
    agent = chai.request.agent(U.getServer());
    await U.insertUser(U.userBar);
    await agent.post('/localSignup')
      .send(U.testingCredentials);
    let res = await agent.post('/localLogin').redirects(0)
      .send(U.testingCredentials);
    expect(res).to.have.cookie('connect.sid');
    cookies = U.parseCookies(res.headers['set-cookie'][0]);

    res = await agent.get('/token');
    assert.exists(res.body.token);
    assert.isNotEmpty(res.body.token);
    ({ token } = res.body);
  });

  after(function () {
    U.removeUser(U.testingCredentials.username);
    U.removeUser(U.userBar.nickname);
  });

  const get = function (url, userStatus) {
    switch (userStatus) {
    case 'logged':
      return agent.get(url);
    case 'token':
      return chai.request(U.serverURL).get(url)
        .query({ token });
    default:
      return chai.request(U.serverURL).get(url);
    }
  };

  const post = function (url, userStatus) {
    switch (userStatus) {
    case 'logged':
      return agent.post(url);
    case 'token':
      return chai.request(U.serverURL).post(`${url}?token=${token}`);
    default:
      return chai.request(U.serverURL).post(url);
    }
  };

  const del = function (url, userStatus) {
    switch (userStatus) {
    case 'logged':
      return agent.del(url).query({ token });
    case 'token':
      return chai.request(U.serverURL).del(url)
        .query({ token });
    default:
      return chai.request(U.serverURL).del(url);
    }
  };

  describe('Test basic unprivileged access', function() {

    ['unlogged', 'logged'].forEach((userStatus) => {

      it(`Disallows accessing a private project (${userStatus})`, async function () {
        const res = await get('/project/' + U.privateProjectTest.shortname, userStatus);
        assert.oneOf(res.statusCode, forbiddenStatusCodes);
      });

      it(`Disallows accessing a private project settings (${userStatus})`, async function () {
        const res = await get('/project/' + U.privateProjectTest.shortname + '/settings', userStatus);
        assert.oneOf(res.statusCode, forbiddenStatusCodes);
      });

      it(`Disallows accessing a private project using JSON api (${userStatus})`, async function () {
        const res = await get('/project/json/' + U.privateProjectTest.shortname, userStatus);
        assert.oneOf(res.statusCode, forbiddenStatusCodes);
      });

      it(`Disallows accessing a private project files (${userStatus})`, async function () {
        const res = await get('/project/json/' + U.privateProjectTest.shortname + '/files?start=0&length=20', userStatus);
        assert.oneOf(res.statusCode, forbiddenStatusCodes);
      });

      it(`Disallows updating a private project (${userStatus})`, async function () {
        const res = await post('/project/json/' + U.privateProjectTest.shortname, userStatus)
          .send({data: U.privateProjectTest});
        assert.oneOf(res.statusCode, forbiddenStatusCodes);
      });

      it(`Disallows deleting a private project (${userStatus})`, async function () {
        const res = await del('/project/json/' + U.privateProjectTest.shortname, userStatus);
        assert.oneOf(res.statusCode, forbiddenStatusCodes);
      });
    });
  });

  // eslint-disable-next-line max-statements
  describe('Test specific edit / add / remove permissions of logged users', function() {

    const projects = {};
    const setupProjectWithAccess = (access, name) => {
      const project = U.createProjectWithPermission(name, access);
      projects[project.name] = project;
      U.insertProject(project);
    };

    before(function () {
      ['none', 'view'].forEach((access) => {
        setupProjectWithAccess(
          { collaborators: access, files: 'edit' },
          `collaborators${access}filesedit`
        );
        setupProjectWithAccess(
          { collaborators: 'edit', files: access },
          `collaboratorseditfiles${access}`
        );
      });
      ['edit', 'add', 'remove'].forEach((access) => {
        setupProjectWithAccess(
          { collaborators: access, files: 'none' },
          `collaborators${access}filesnone`
        );
        setupProjectWithAccess(
          { collaborators: access, files: 'edit' },
          `collaborators${access}filesedit`
        );
        setupProjectWithAccess(
          { collaborators: 'edit', files: access },
          `collaboratorseditfiles${access}`
        );
      });
      ['none', 'view', 'add', 'edit', 'remove'].forEach((access) => {
        setupProjectWithAccess(
          { collaborators: 'edit', files: 'edit', annotations: access },
          `collaboratorseditfileseditannotations${access}`
        );
      });

    });

    after(function() {
      Object.keys(projects).forEach((shortname) => {
        U.removeProject(shortname);
      });

    });

    // eslint-disable-next-line max-statements
    ['logged', 'token'].forEach((userStatus) => {

      it(`Checks that collaborators cannot edit a project if files is set to none (${userStatus})`, async function() {
        const project = _.cloneDeep(projects.collaboratorseditfilesnone);
        const res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.oneOf(res.statusCode, forbiddenStatusCodes);
      });

      it(`Checks that collaborators cannot remove a project if files  is set to none (${userStatus})`, async function () {

        const project = _.cloneDeep(projects.collaboratorsremovefilesnone);
        const res = await del('/project/json/' + project.shortname, userStatus);
        assert.oneOf(res.statusCode, forbiddenStatusCodes);

      });

      it(`Checks that collaborators can edit a project if files is set to add (${userStatus})`, async function () {
        const project = _.cloneDeep(projects.collaboratorseditfilesadd);
        const res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.equal(res.statusCode, 200);
      });

      it(`Checks that collaborators can edit a project if files is set to edit (${userStatus})`, async function () {
        const project = _.cloneDeep(projects.collaboratorseditfilesedit);
        const res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.equal(res.statusCode, 200);
      });

      it(`Checks that collaborators can edit a project if files is set to remove (${userStatus})`, async function () {
        const project = _.cloneDeep(projects.collaboratorseditfilesremove);
        const res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.equal(res.statusCode, 200);
      });

      it(`Checks that collaborators cannot add project collaborators if set to none or view (${userStatus})`, async function () {
        let project = _.cloneDeep(projects.collaboratorsnonefilesedit);
        let initialProjectState = _.cloneDeep(project);
        project.collaborators.list.push({
          userID: 'foo',
          access: {
            collaborators: 'edit',
            annotations: 'edit',
            files: 'edit'
          },
          username: 'foo',
          name: 'Foo'
        });

        let res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.equal(res.statusCode, 200);
        let fromDb = await U.queryProject(project.shortname);
        assert.equal(fromDb.collaborators.list.length, initialProjectState.collaborators.list.length);

        project = _.cloneDeep(projects.collaboratorsviewfilesedit);
        initialProjectState = _.cloneDeep(project);
        project.collaborators.list.push({
          userID: 'foo',
          access: {
            collaborators: 'edit',
            annotations: 'edit',
            files: 'edit'
          },
          username: 'foo',
          name: 'Foo'
        });
        res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.equal(res.statusCode, 200);
        fromDb = await U.queryProject(project.shortname);
        assert.equal(fromDb.collaborators.list.length, initialProjectState.collaborators.list.length);

      });

      it(`Checks that collaborators cannot remove project collaborators if set to none (${userStatus})`, async function () {
        const project = _.cloneDeep(projects.collaboratorsnonefilesedit);
        const initialProjectState = _.cloneDeep(project);
        project.collaborators.list.splice(1, 1);

        const res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.equal(res.statusCode, 200);
        const fromDb = await U.queryProject(project.shortname);
        assert.equal(fromDb.collaborators.list.length, initialProjectState.collaborators.list.length);
      });

      it(`Checks that collaborators cannot remove project collaborators if set to view (${userStatus})`, async function() {
        const project = _.cloneDeep(projects.collaboratorsviewfilesedit);
        const initialProjectState = _.cloneDeep(project);
        project.collaborators.list.splice(1, 1);

        const res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.equal(res.statusCode, 200);
        const fromDb = await U.queryProject(project.shortname);
        assert.equal(fromDb.collaborators.list.length, initialProjectState.collaborators.list.length);
      });

      it(`Checks that collaborators cannot remove project collaborators if set to add (${userStatus})`, async function() {
        const project = _.cloneDeep(projects.collaboratorsaddfilesedit);
        const initialProjectState = _.cloneDeep(project);
        project.collaborators.list.splice(1, 1);

        const res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.equal(res.statusCode, 200);
        const fromDb = await U.queryProject(project.shortname);
        assert.equal(fromDb.collaborators.list.length, initialProjectState.collaborators.list.length);
      });

      it(`Checks that collaborators can add project collaborators if set to add or remove (${userStatus})`, async function () {
        let project = projects.collaboratorsaddfilesedit;
        let initialProjectState = _.cloneDeep(project);
        project.collaborators.list.push({
          userID: 'foo',
          access: {
            collaborators: 'edit',
            annotations: 'edit',
            files: 'edit'
          },
          username: 'foo',
          name: 'Foo'
        });

        let res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.equal(res.statusCode, 200);
        // check that collaborators got modified
        let projectFromDB = await U.queryProject(project.shortname);
        assert.isAbove(projectFromDB.collaborators.list.length, initialProjectState.collaborators.list.length);

        project = projects.collaboratorsremovefilesedit;
        initialProjectState = _.cloneDeep(project);
        project.collaborators.list.push({
          userID: 'foo',
          access: {
            collaborators: 'edit',
            annotations: 'edit',
            files: 'edit'
          },
          username: 'foo',
          name: 'Foo'
        });
        res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.equal(res.statusCode, 200);
        projectFromDB = await U.queryProject(project.shortname);
        assert.isAbove(projectFromDB.collaborators.list.length, initialProjectState.collaborators.list.length);
      });

      it(`Checks that collaborators can remove project collaborators if set to remove (${userStatus})`, async function() {
        const project = _.cloneDeep(projects.collaboratorsremovefilesedit);
        const initialProjectState = _.cloneDeep(project);
        project.collaborators.list.splice(1, 1);

        const res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.equal(res.statusCode, 200);
        const projectFromDB = await U.queryProject(project.shortname);
        assert.isBelow(projectFromDB.collaborators.list.length, initialProjectState.collaborators.list.length);
      });


      it(`Checks that collaborators cannot add project annotations if set to none (${userStatus})`, async function () {
        const project = _.cloneDeep(projects.collaboratorseditfileseditannotationsnone);
        const initialProjectState = _.cloneDeep(project);
        project.annotations.list.push({
          type: 'text',
          name: 'Annotation name',
          values: null
        });
        const res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.equal(res.statusCode, 200);
        const fromDb = await U.queryProject(project.shortname);
        assert.equal(fromDb.collaborators.list.length, initialProjectState.collaborators.list.length);
      });

      it(`Checks that collaborators cannot add project annotations if set to view (${userStatus})`, async function() {
        const project = _.cloneDeep(projects.collaboratorseditfileseditannotationsview);
        const initialProjectState = _.cloneDeep(project);
        project.annotations.list.push({
          type: 'text',
          name: 'Annotation name',
          values: null
        });
        const res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.equal(res.statusCode, 200);
        const fromDb = await U.queryProject(project.shortname);
        assert.equal(fromDb.collaborators.list.length, initialProjectState.collaborators.list.length);
      });

      it(`Checks that collaborators can add project annotations if set to add or remove (${userStatus})`, async function() {
        let project = projects.collaboratorseditfileseditannotationsadd;
        let initialProjectState = _.cloneDeep(project);
        project.annotations.list.push({
          type: 'text',
          name: 'Annotation name',
          values: null
        });
        let res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.equal(res.statusCode, 200);
        let projectFromDB = await U.queryProject(project.shortname);
        assert.isAbove(projectFromDB.annotations.list.length, initialProjectState.annotations.list.length);

        project = projects.collaboratorseditfileseditannotationsremove;
        initialProjectState = _.cloneDeep(project);
        project.annotations.list.push({
          type: 'text',
          name: 'Annotation name',
          values: null
        });
        res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.equal(res.statusCode, 200);
        projectFromDB = await U.queryProject(project.shortname);
        assert.isAbove(projectFromDB.annotations.list.length, initialProjectState.annotations.list.length);
      });

      it(`Checks that collaborators cannot remove project annotations if set to none (${userStatus})`, async function() {
        const project = _.cloneDeep(projects.collaboratorseditfileseditannotationsnone);
        const initialProjectState = _.cloneDeep(project);
        project.annotations.list.splice(0, 1);

        const res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.equal(res.statusCode, 200);
        const fromDb = await U.queryProject(project.shortname);
        assert.equal(fromDb.collaborators.list.length, initialProjectState.collaborators.list.length);
      });

      it(`Checks that collaborators cannot remove project annotations if set to view (${userStatus})`, async function() {
        const project = _.cloneDeep(projects.collaboratorseditfileseditannotationsview);
        const initialProjectState = _.cloneDeep(project);
        project.annotations.list.splice(0, 1);

        const res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.equal(res.statusCode, 200);
        const fromDb = await U.queryProject(project.shortname);
        assert.equal(fromDb.collaborators.list.length, initialProjectState.collaborators.list.length);
      });

      it(`Checks that collaborators cannot remove project annotations if set to add (${userStatus})`, async function() {
        const project = _.cloneDeep(projects.collaboratorseditfileseditannotationsadd);
        const initialProjectState = _.cloneDeep(project);
        project.annotations.list.splice(0, 1);

        const res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.equal(res.statusCode, 200);
        const fromDb = await U.queryProject(project.shortname);
        assert.equal(fromDb.collaborators.list.length, initialProjectState.collaborators.list.length);
      });


      it(`Checks that collaborators cannot add project files if set to none or view (${userStatus})`, async function() {
        let project = _.cloneDeep(projects.collaboratorseditfilesnone);
        project.files.list.push({source: 'https://zenodo.org/record/44855/files/MRI-n4.nii.gz', name: 'MRI-n4.nii.gz'});
        let res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.oneOf(res.statusCode, forbiddenStatusCodes);

        project = _.cloneDeep(projects.collaboratorseditfilesview);
        project.files.list.push({source: 'https://zenodo.org/record/44855/files/MRI-n4.nii.gz', name: 'MRI-n4.nii.gz'});
        res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.oneOf(res.statusCode, forbiddenStatusCodes);
      });

      it(`Checks that collaborators can add project files if set to add or remove (${userStatus})`, async function() {
        let project = _.cloneDeep(projects.collaboratorseditfilesadd);
        let initialProjectState = _.cloneDeep(project);
        project.files.list.push({source: 'https://zenodo.org/record/44855/files/MRI-n4.nii.gz', name: 'MRI-n4.nii.gz'});
        let res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.equal(res.statusCode, 200);
        let projectFromDB = await U.queryProject(project.shortname);
        assert.isAbove(projectFromDB.files.list.length, initialProjectState.files.list.length);

        project = _.cloneDeep(projects.collaboratorseditfilesremove);
        initialProjectState = _.cloneDeep(project);
        project.files.list.push({source: 'https://zenodo.org/record/44855/files/MRI-n4.nii.gz', name: 'MRI-n4.nii.gz'});
        res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.equal(res.statusCode, 200);
        projectFromDB = await U.queryProject(project.shortname);
        assert.isAbove(projectFromDB.files.list.length, initialProjectState.files.list.length);
      });

      it(`Checks that collaborators cannot remove project files if set to none (${userStatus})`, async function() {
        const project = _.cloneDeep(projects.collaboratorseditfilesnone);
        project.files.list.splice(0, 1);

        const res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.oneOf(res.statusCode, forbiddenStatusCodes);
      });

      it(`Checks that collaborators cannot remove project files if set to view (${userStatus})`, async function() {
        const project = _.cloneDeep(projects.collaboratorseditfilesview);
        project.files.list.splice(0, 1);

        const res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.oneOf(res.statusCode, forbiddenStatusCodes);
      });

      it(`Checks that collaborators cannot remove project files if set to add (${userStatus})`, async function() {
        let project = U.createProjectWithPermission('permissionTest', { files: 'add' });
        projects.permissionTest = project;
        U.insertProject(project);

        const initialProjectState = _.cloneDeep(project);
        project = _.cloneDeep(project);
        project.files.list.splice(0, 1);

        const res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.equal(res.statusCode, 200);
        const projectFromDB = await U.queryProject(project.shortname);
        assert.equal(projectFromDB.files.list.length, initialProjectState.files.list.length);
      });

      it(`Checks that collaborators can remove project files if set to remove (${userStatus})`, async function() {
        const project = _.cloneDeep(projects.collaboratorseditfilesremove);
        const initialProjectState = _.cloneDeep(project);
        project.files.list.splice(0, 1);

        const res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.equal(res.statusCode, 200);
        const projectFromDB = await U.queryProject(project.shortname);
        assert.isBelow(projectFromDB.files.list.length, initialProjectState.files.list.length);
      });

      describe('Test view permissions of logged users', function() {
        let browser, page;

        before(async function() {
          browser = await puppeteer.launch({ headless: true, ignoreHTTPSErrors: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
          page = await browser.newPage();
          page.setCookie(...cookies);
        });

        after(function() {
          browser.close();
        });

        it(`Check that collaborators cannot see other collaborators if not permitted (${userStatus})`, async function () {
          const project = _.cloneDeep(projects.collaboratorsnonefilesedit);
          const response = await page.goto(U.serverURL + '/project/' + project.shortname + '/settings');
          assert.equal(response.status(), 200);
          await page.waitForSelector('#access tbody');
          const contributorsTableLength = (await page.$$('#access tbody tr')).length;
          assert.equal(contributorsTableLength, 1); // 'anyone' only
        }).timeout(U.longTimeout);

        it(`Check that collaborators cannot see other collaborators if not permitted using JSON API (${userStatus})`, async function () {
          const project = _.cloneDeep(projects.collaboratorsnonefilesedit);
          const res = await get('/project/json/' + project.shortname, userStatus);
          assert.equal(res.body.collaborators.list.length, 1);
        });

        it(`Check that collaborators cannot see other annotations if not permitted (${userStatus})`, async function () {
          const project = _.cloneDeep(projects.collaboratorseditfileseditannotationsnone);
          const response = await page.goto(U.serverURL + '/project/' + project.shortname + '/settings');
          assert.equal(response.status(), 200);
          await page.waitForSelector('#annotations tbody');
          const annotationsTableLength = (await page.$$('#annotations tbody tr')).length;
          assert.equal(annotationsTableLength, 1); // placeholder
        }).timeout(U.longTimeout);

      });

    });
  });


});
