'use strict';

const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const _ = require('lodash');
const U = require('../utils.js');

describe('TESTING THE /project ROUTE', function () {
  // eslint-disable-next-line no-invalid-this
  this.timeout(U.longTimeout);

  before(async function () {
    // add one MRI
    await U.waitForTestBrain();
  });

  describe('Get project information', function () {
    it('get("/") should return status 200', async function () {
      const res = await chai.request(U.serverURL)
        .get('/');
      assert.equal(res.statusCode, 200);
    });

    it('get("/project/json/") should get an error message requesting page', async function () {
      const { body } = await chai.request(U.serverURL).get('/project/json/');
      const expected = { error: 'Provide the parameter \'page\'' };
      assert.deepEqual(body, expected);
    });

    it('get("/project/json?page=0") should return an array', async function () {
      const { body } = await chai.request(U.serverURL).get('/project/json?page=0')
        .query({ page: 0 });
      assert(Array.isArray(body));
    });

    it('get("/project/json/test") should return status 200', async function () {
      const res = await chai.request(U.serverURL).get(`/project/json/${U.projectTest.shortname}`);
      assert.equal(res.statusCode, 200);
    });

    it('get("/project/json/test") should return an object with appropriate keys', async function () {
      const { body } = await chai.request(U.serverURL).get(`/project/json/${U.projectTest.shortname}`);
      const expectedKeys = [
        'name', 'shortname', 'url', 'brainboxURL', 'created', 'owner',
        'collaborators', 'files', 'annotations', 'description',
        'modified', 'modifiedBy'
      ];
      assert.hasAllKeys(body, expectedKeys);
    });

    it('get("/project/json/test/files") should return an array with >=1 file', async function () {
      const { body } = await chai.request(U.serverURL)
        .get(`/project/json/${U.projectTest.shortname}/files`)
        .query({ start: 0, length: 10 });
      assert.isArray(body);
      assert.isAtLeast(body.length, 1);
    });

    it('get("/project/json/test/files") should return objects with appropriate keys', async function () {
      const { body } = await chai.request(U.serverURL)
        .get(`/project/json/${U.projectTest.shortname}/files`)
        .query({ start: 0, length: 10 });
      // only the first mri was fetched, dim info can be missing for the others
      const expectedKeys1 = [
        'filename', 'success', 'source', 'url', 'included',
        'dim', 'pixdim', 'voxel2world', 'worldOrigin',
        'owner', 'mri', 'modified', 'modifiedBy', 'name'
      ];
      const expectedKeys2 = [
        'source', 'url', 'included',
        'owner', 'mri', 'modified', 'modifiedBy', 'name'
      ];
      // console.log(body);
      assert.isArray(body);
      assert.containsAllKeys(body[0], expectedKeys1);
      for (let i = 1; i < 5; i++) {
        assert.containsAllKeys(body[i], expectedKeys2);
      }
    });

    it('get("/project/json/test/files") should return only sources and names if required', async function () {
      const { body } = await chai.request(U.serverURL)
        .get(`/project/json/${U.projectTest.shortname}/files`)
        .query({ start: 0, length: 10, names: true });
      assert.isArray(body);
      assert.hasAllKeys(body[0], ['source', 'name']);
    });

    it('Remove test MRI from db and disk', async function () {
      // remove the MRI
      const res = await chai.request(U.serverURL).get('/mri/json')
        .query({
          url: U.localBertURL
        });
      const { body } = res;
      const dirPath = './public' + body.url;
      await U.removeMRI({ dirPath, srcURL: U.localBertURL });
    });
  });

  describe('Saving the files of a project', function () {
    const shortname = 'filesguardtest';
    const source = (i) => `https://example.org/filesguardtest/${i}.nii.gz`;
    const files = (n) => Array.from({ length: n }, (_x, i) => ({ source: source(i), name: '' }));
    const project = (n) => ({
      ..._.cloneDeep(U.projectTest),
      shortname,
      brainboxURL: `/project/${shortname}`,
      files: { list: files(n) }
    });
    const save = (data) => chai.request(U.serverURL).post(`/project/json/${shortname}?token=${U.testToken}foo`)
      .send({ data });
    const storedSources = async () => (await U.queryProject(shortname)).files.list;

    beforeEach(async function () {
      await U.removeProject(shortname);
      const res = await U.insertProject(project(5));
      assert.isTrue(res.body.success, JSON.stringify(res.body));
    });

    after(async function () {
      await U.removeProject(shortname);
    });

    it('saves the files sent when the request does not say how many were loaded', async function () {
      const res = await save(project(2));
      assert.isTrue(res.body.success);
      assert.deepEqual(await storedSources(), [source(0), source(1)]);
    });

    it('saves the files sent when the client had received the whole list', async function () {
      const res = await save({ ...project(2), filesLoaded: 5 });
      assert.isTrue(res.body.success);
      assert.notInclude(res.body.message, 'files');
      assert.deepEqual(await storedSources(), [source(0), source(1)]);
    });

    it('keeps the stored files, and saves the rest, when the client had not received the whole list', async function () {
      const res = await save({ ...project(2), description: 'changed', filesLoaded: 2 });
      assert.isTrue(res.body.success);
      assert.include(res.body.message, 'files');
      const stored = await U.queryProject(shortname);
      assert.deepEqual(stored.files.list, files(5).map((f) => f.source));
      assert.strictEqual(stored.description, 'changed');
    });

    it('does not store the number of files loaded', async function () {
      await save({ ...project(5), filesLoaded: 5 });
      assert.notProperty(await U.queryProject(shortname), 'filesLoaded');
    });

    it('gives the settings page the number of files to load, and none of the files', async function () {
      const res = await chai.request(U.serverURL).get(`/project/${shortname}/settings`);
      assert.equal(res.statusCode, 200);
      const projectInfo = JSON.parse(res.text.match(/const project = (.*);\n/)[1]);
      assert.deepEqual(projectInfo.files.list, []);
      assert.strictEqual(projectInfo.filesLoaded, 0);
      assert.match(res.text, /const filesTotal = 5;/);
    });
  });
});
