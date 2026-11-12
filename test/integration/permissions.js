/* eslint-disable max-lines */
'use strict';

const chai = require('chai');
const {assert, expect} = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');
const puppeteer = require('puppeteer');
const _ = require('lodash');

describe('TESTING PERMISSIONS', function () {
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

  describe('Test basic unprivileged access', function() {

    describe('Disallow seeing private project annotations on MRI pages', function() {
      let browser, page;

      before(async function() {
        const project = U.createProjectWithPermission('testwithprivateannotation', { files: 'none' });
        project.files.list = [{ source: U.testDataURL + '/test_data/bert_brain.nii.gz', name: 'Bert'}];
        project.collaborators.list.find((c) => c.userID === 'anyone').access.files = 'none';
        await U.insertProject(project);

        browser = await puppeteer.launch({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        page = await browser.newPage();
        await U.blockExternalRequests(page);
      });

      it('Do not let see private annotations on a MRI page', async function() {
        const response = await page.goto(`${U.serverURL}/mri?file=${U.testDataURL}/test_data/bert_brain.nii.gz`);
        assert.equal(response.status(), 200);
        await page.waitForSelector('#annotations');
        const annotationsTableLength = (await page.$$('#annotations tbody tr')).length;
        assert.equal(annotationsTableLength, 0);
      });

      after(function() {
        browser.close();
        U.removeProject('testwithprivateannotation');
      });
    });
  });

  // eslint-disable-next-line max-statements
  describe('Test specific edit / add / remove permissions of logged users', function() {

    const projects = {};
    const setupProjectWithAccess = function (access, name) {
      const project = U.createProjectWithPermission(name, access);
      projects[project.name] = project;

      return U.insertProject(project);
    };

    before(async function () {
      await Promise.all([
        setupProjectWithAccess({ collaborators: 'none', files: 'edit' }, 'collaboratorsnonefilesedit'),
        setupProjectWithAccess({ collaborators: 'view', files: 'edit' }, 'collaboratorsviewfilesedit'),
        setupProjectWithAccess({ collaborators: 'remove', files: 'edit' }, 'collaboratorsremovefilesedit'),
        setupProjectWithAccess({ collaborators: 'edit', files: 'remove' }, 'collaboratorseditfilesremove'),
        ...['none', 'view', 'remove'].map((access) => setupProjectWithAccess(
          { collaborators: 'edit', files: 'edit', annotations: access },
          `collaboratorseditfileseditannotations${access}`
        ))
      ]);
    });

    after(async function() {
      await Promise.all(Object.keys(projects).map((shortname) =>
        U.removeProject(shortname)
      ));

    });

    // eslint-disable-next-line max-statements
    for (const userStatus of ['logged', 'token']) {

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

      // the add level: shared suite 2.3 (a collaborator with add adds rows)
      it(`Checks that collaborators can add project collaborators if set to remove (${userStatus})`, async function () {
        const project = projects.collaboratorsremovefilesedit;
        const initialProjectState = _.cloneDeep(project);
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
        const res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.equal(res.statusCode, 200);
        const projectFromDB = await U.queryProject(project.shortname);
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

      // the add level: shared suite 2.3 (a collaborator with add adds layers)
      it(`Checks that collaborators can add project annotations if set to remove (${userStatus})`, async function() {
        const project = projects.collaboratorseditfileseditannotationsremove;
        const initialProjectState = _.cloneDeep(project);
        // one name per run: the project is shared by the runs, and a layer named as another is refused (shared suite 2.10)
        project.annotations.list.push({
          type: 'text',
          name: `Annotation name (${userStatus})`,
          values: null
        });
        const res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.equal(res.statusCode, 200);
        const projectFromDB = await U.queryProject(project.shortname);
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

      // the add level: shared suite 2.3 (a collaborator with add adds files)
      it(`Checks that collaborators can add project files if set to remove (${userStatus})`, async function() {
        const project = _.cloneDeep(projects.collaboratorseditfilesremove);
        const initialProjectState = _.cloneDeep(project);
        project.files.list.push({source: 'https://zenodo.org/record/44855/files/MRI-n4.nii.gz', name: 'MRI-n4.nii.gz'});
        const res = await post('/project/json/' + project.shortname, userStatus)
          .send({data: project});
        assert.equal(res.statusCode, 200);
        const projectFromDB = await U.queryProject(project.shortname);
        assert.isAbove(projectFromDB.files.list.length, initialProjectState.files.list.length);
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

      // `cookies` is filled by the root before() hook; it must be read when this suite's hooks run, not when the loop runs
      // eslint-disable-next-line no-loop-func
      describe('Test view permissions of logged users', function() {
        let browser, page;

        before(async function() {
          browser = await puppeteer.launch({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
          page = await browser.newPage();
          await U.blockExternalRequests(page);
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

        it(`Check that collaborators cannot see other annotations if not permitted (${userStatus})`, async function () {
          const project = _.cloneDeep(projects.collaboratorseditfileseditannotationsnone);
          const response = await page.goto(U.serverURL + '/project/' + project.shortname + '/settings');
          assert.equal(response.status(), 200);
          await page.waitForSelector('#annotations tbody');
          const annotationsTableLength = (await page.$$('#annotations tbody tr')).length;
          assert.equal(annotationsTableLength, 1); // placeholder
        }).timeout(U.longTimeout);

      });

    }
  });


});
