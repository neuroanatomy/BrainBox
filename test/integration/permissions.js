'use strict';

const chai = require('chai');
var {assert, expect} = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');
const {server} = require('../../app');
const puppeteer = require('puppeteer');

describe('TESTING PERMISSIONS', function () {
  const forbiddenStatusCodes = [403, 401];
  const agent = chai.request.agent(server);
  let cookies = [];
  let token = '';

  const get = function(url, logged) {
    if (logged) {
      return agent.get(url).query({ token });
    }

    return chai.request(U.serverURL).get(url);
  };

  const post = function(url, logged) {
    if (logged) {
      return agent.post(`${url}?token=${token}`);
    }

    return chai.request(U.serverURL).post(url);
  };

  const del = function(url, logged) {
    if (logged) {
      return agent.del(url).query({ token });
    }

    return chai.request(U.serverURL).del(url);
  };

  before(async function () {
    await U.insertUser(U.userBar);
    try {
      await agent.post('/localSignup')
        .send(U.testingCredentials)
        .timeout(1000); // FIXME: (in nwl)works but hangs indefinitely
    } catch(_e) {
      //
    }
    let res = await agent.post('/localLogin').redirects(0)
      .send(U.testingCredentials);
    expect(res).to.have.cookie('connect.sid');
    cookies = U.parseCookies(res.headers['set-cookie'][0]);

    res = await agent.get('/token');
    assert.exists(res.body.token);
    assert.isNotEmpty(res.body.token);
    token = res.body.token;
  });

  after(function () {
    U.removeUser(U.testingCredentials.username);
    U.removeUser(U.userBar.nickname);
  });

  describe('Test basic unprivileged access', function() {

    ['unlogged', 'logged'].forEach((userStatus) => {

      const logged = userStatus === 'logged';

      it(`Disallows accessing a private project (${userStatus})`, async function () {
        const res = await get('/project/' + U.privateProjectTest.shortname, logged);
        assert.oneOf(res.statusCode, forbiddenStatusCodes);
      });

      it(`Disallows accessing a private project settings (${userStatus})`, async function () {
        const res = await get('/project/' + U.privateProjectTest.shortname + '/settings', logged);
        assert.oneOf(res.statusCode, forbiddenStatusCodes);
      });

      it(`Disallows accessing a private project using JSON api (${userStatus})`, async function () {
        const res = await get('/project/json/' + U.privateProjectTest.shortname, logged);
        assert.oneOf(res.statusCode, forbiddenStatusCodes);
      });

      it(`Disallows accessing a private project files (${userStatus})`, async function () {
        const res = await get('/project/json/' + U.privateProjectTest.shortname + '/files?start=0&length=20', logged);
        assert.oneOf(res.statusCode, forbiddenStatusCodes);
      });

      it(`Disallows updating a private project (${userStatus})`, async function () {
        const res = await post('/project/json/' + U.privateProjectTest.shortname, logged)
          .send({data: U.privateProjectTest});
        assert.oneOf(res.statusCode, forbiddenStatusCodes);
      });

      it(`Disallows deleting a private project (${userStatus})`, async function () {
        const res = await del('/project/json/' + U.privateProjectTest.shortname, logged);
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
      ["none", "view"].forEach((access) => {
        setupProjectWithAccess(
          { collaborators: access, files: 'edit' },
          `collaborators${access}filesedit`
        );
        setupProjectWithAccess(
          { collaborators: 'edit', files: access },
          `collaboratorseditfiles${access}`
        );
      });
      ["edit", "add", "remove"].forEach((access) => {
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
      ["none", "view", "add", "edit", "remove"].forEach((access) => {
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

    it('Checks that collaborators cannot edit a project if files have a lower access value', async function() {
      const project = projects.collaboratorseditfilesnone;
      const res = await post('/project/json/' + project.shortname, true)
        .send({data: project});
      assert.oneOf(res.statusCode, forbiddenStatusCodes);
    });

    it('Checks that collaborators cannot remove a project if files have a lower access value', async function() {
      const project = projects.collaboratorsremovefilesnone;
      const res = await del('/project/json/' + project.shortname, true);
      assert.oneOf(res.statusCode, forbiddenStatusCodes);
    });

    it('Checks that collaborators can edit a project if files have an equal access value', async function() {
      const project = projects.collaboratorseditfilesedit;
      const res = await post('/project/json/' + project.shortname, true)
        .send({data: project});
      assert.equal(res.statusCode, 200);
    });

    it('Checks that collaborators can edit a project if files have a superior access value', async function() {
      const project = projects.collaboratorseditfilesremove;
      const res = await post('/project/json/' + project.shortname, true)
        .send({data: project});
      assert.equal(res.statusCode, 200);
    });

    it('Checks that collaborators cannot add project collaborators if set to none or view', async function() {
      let project = projects.collaboratorsnonefilesedit;
      project.collaborators.list.push({
        userID: "foo",
        access: {
          collaborators: "edit",
          annotations: "edit",
          files: "edit"
        },
        username: "foo",
        name: "Foo"
      });

      let res = await post('/project/json/' + project.shortname, true)
        .send({data: project});
      assert.oneOf(res.statusCode, forbiddenStatusCodes);

      project = projects.collaboratorsviewfilesedit;
      project.collaborators.list.push({
        userID: "foo",
        access: {
          collaborators: "edit",
          annotations: "edit",
          files: "edit"
        },
        username: "foo",
        name: "Foo"
      });
      res = await post('/project/json/' + project.shortname, true)
        .send({data: project});
      assert.oneOf(res.statusCode, forbiddenStatusCodes);
    });

    it('Checks that collaborators can add project collaborators if set to add or remove', async function() {
      let project = projects.collaboratorsaddfilesedit;
      project.collaborators.list.push({
        userID: "foo",
        access: {
          collaborators: "edit",
          annotations: "edit",
          files: "edit"
        },
        username: "foo",
        name: "Foo"
      });

      let res = await post('/project/json/' + project.shortname, true)
        .send({data: project});
      assert.equal(res.statusCode, 200);

      project = projects.collaboratorsremovefilesedit;
      project.collaborators.list.push({
        userID: "foo",
        access: {
          collaborators: "edit",
          annotations: "edit",
          files: "edit"
        },
        username: "foo",
        name: "Foo"
      });
      res = await post('/project/json/' + project.shortname, true)
        .send({data: project});
      assert.equal(res.statusCode, 200);
    });


    it('Checks that collaborators cannot add project annotations if set to none or view', async function() {
      let project = projects.collaboratorseditfileseditannotationsnone;
      project.annotations.list.push({
        type: "text",
        name: "Annotation name",
        values: null
      });
      let res = await post('/project/json/' + project.shortname, true)
        .send({data: project});
      assert.oneOf(res.statusCode, forbiddenStatusCodes);

      project = projects.collaboratorseditfileseditannotationsview;
      project.annotations.list.push({
        type: "text",
        name: "Annotation name",
        values: null
      });
      res = await post('/project/json/' + project.shortname, true)
        .send({data: project});
      assert.oneOf(res.statusCode, forbiddenStatusCodes);
    });

    it('Checks that collaborators can add project annotations if set to add or remove', async function() {
      let project = projects.collaboratorseditfileseditannotationsadd;
      project.annotations.list.push({
        type: "text",
        name: "Annotation name",
        values: null
      });
      let res = await post('/project/json/' + project.shortname, true)
        .send({data: project});
      assert.equal(res.statusCode, 200);

      project = projects.collaboratorseditfileseditannotationsremove;
      project.annotations.list.push({
        type: "text",
        name: "Annotation name",
        values: null
      });
      res = await post('/project/json/' + project.shortname, true)
        .send({data: project});
      assert.equal(res.statusCode, 200);
    });


    it('Checks that collaborators cannot add project files if set to none or view', async function() {
      let project = projects.collaboratorseditfilesnone;
      project.files.list.push({source: "https://zenodo.org/record/44855/files/MRI-n4.nii.gz", name: "MRI-n4.nii.gz"});
      let res = await post('/project/json/' + project.shortname, true)
        .send({data: project});
      assert.oneOf(res.statusCode, forbiddenStatusCodes);

      project = projects.collaboratorseditfilesview;
      project.files.list.push({source: "https://zenodo.org/record/44855/files/MRI-n4.nii.gz", name: "MRI-n4.nii.gz"});
      res = await post('/project/json/' + project.shortname, true)
        .send({data: project});
      assert.oneOf(res.statusCode, forbiddenStatusCodes);
    });

    it('Checks that collaborators can add project files if set to add or remove', async function() {
      let project = projects.collaboratorseditfilesadd;
      project.files.list.push({source: "https://zenodo.org/record/44855/files/MRI-n4.nii.gz", name: "MRI-n4.nii.gz"});
      let res = await post('/project/json/' + project.shortname, true)
        .send({data: project});
      assert.equal(res.statusCode, 200);

      project = projects.collaboratorseditfilesremove;
      project.files.list.push({source: "https://zenodo.org/record/44855/files/MRI-n4.nii.gz", name: "MRI-n4.nii.gz"});
      res = await post('/project/json/' + project.shortname, true)
        .send({data: project});
      assert.equal(res.statusCode, 200);
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

      it('Check that collaborators cannot see other collaborators if not permitted', async function () {
        const project = projects.collaboratorsnonefilesedit;
        const response = await page.goto(U.serverURL + '/project/' + project.shortname + '/settings');
        assert.equal(response.status(), 200);
        await page.waitForSelector('#access tbody');
        const contributorsTableLength = (await page.$$('#access tbody tr')).length;
        assert.equal(contributorsTableLength, 1); // 'anyone' only
      }).timeout(U.longTimeout);

      it('Check that collaborators cannot see other collaborators if not permitted using JSON API', async function () {
        const project = projects.collaboratorsnonefilesedit;
        const res = await get('/project/json/' + project.shortname, true);
        assert.equal(res.body.collaborators.list.length, 1);
      });

      it('Check that collaborators cannot see other annotations if not permitted', async function () {
        const project = projects.collaboratorseditfileseditannotationsnone;
        const response = await page.goto(U.serverURL + '/project/' + project.shortname + '/settings');
        assert.equal(response.status(), 200);
        await page.waitForSelector('#annotations tbody');
        const annotationsTableLength = (await page.$$('#annotations tbody tr')).length;
        assert.equal(annotationsTableLength, 1); // placeholder
      }).timeout(U.longTimeout);

    });

  });


});
