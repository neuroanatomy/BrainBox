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
      const res = await save({ ...project(2), filesLoaded: { count: 5 } });
      assert.isTrue(res.body.success);
      assert.notInclude(res.body.message, 'files');
      assert.deepEqual(await storedSources(), [source(0), source(1)]);
    });

    it('keeps the stored files, and saves the rest, when the client had not received the whole list', async function () {
      const res = await save({ ...project(2), description: 'changed', filesLoaded: { count: 2 } });
      assert.isTrue(res.body.success);
      assert.include(res.body.message, 'files');
      const stored = await U.queryProject(shortname);
      assert.deepEqual(stored.files.list, files(5).map((f) => f.source));
      assert.strictEqual(stored.description, 'changed');
    });

    it('does not store the number of files loaded', async function () {
      await save({ ...project(5), filesLoaded: { count: 5 } });
      assert.notProperty(await U.queryProject(shortname), 'filesLoaded');
    });

    it('gives the settings page the number of files to load, and none of the files', async function () {
      const res = await chai.request(U.serverURL).get(`/project/${shortname}/settings`);
      assert.equal(res.statusCode, 200);
      const projectInfo = JSON.parse(res.text.match(/const project = (.*);\n/)[1]);
      assert.deepEqual(projectInfo.files.list, []);
      assert.deepEqual(projectInfo.filesLoaded, { count: 0 });
      assert.match(res.text, /const filesTotal = 5;/);
    });
  });

  // eslint-disable-next-line max-statements
  describe('Changing the label set of a volume layer', function () {
    const shortname = 'labelsetchangetest';
    const otherProject = 'labelsetchangeother';
    const sources = [
      'https://example.org/labelsetchangetest/1.nii.gz',
      'https://example.org/labelsetchangetest/2.nii.gz',
      'https://example.org/labelsetchangetest/3.nii.gz'
    ];
    const layer = (name, values) => ({ type: 'volume', values, display: 'true', name });
    const project = (annotations) => ({
      ..._.cloneDeep(U.projectTest),
      shortname,
      brainboxURL: `/project/${shortname}`,
      files: { list: sources.map((source) => ({ source, name: '' })) },
      annotations: { list: annotations }
    });
    const atlas = (projectName, name, labels) => ({
      name,
      project: projectName,
      type: 'volume',
      filename: `${projectName}-${name}.nii.gz`,
      labels,
      owner: 'foo',
      access: 'edit'
    });
    const save = (data) => chai.request(U.serverURL).post(`/project/json/${shortname}?token=${U.testToken}foo`)
      .send({ data });
    const currentMRI = (source) => U.getNativeDB().collection('mri')
      .findOne({ source, backup: { $exists: false } });
    const atlasOf = (mri, projectName, name) => mri.mri.atlas.find((a) => a.project === projectName && a.name === name);

    beforeEach(async function () {
      await U.removeProject(shortname);
      await U.getNativeDB().collection('mri')
        .deleteMany({ source: { $in: sources } });
      const res = await U.insertProject(project([layer('Regions', 'freestyle.json'), layer('Mask', 'foreground.json')]));
      assert.isTrue(res.body.success, JSON.stringify(res.body));
      // the first two MRIs were opened in the project: their atlases were created with the
      // project's label sets. The first one is also in another project, with a layer of the same name
      await U.getNativeDB().collection('mri')
        .insertMany([
          {
            source: sources[0],
            url: '/data/labelsetchangetest0/',
            mri: { atlas: [atlas(shortname, 'Regions', 'freestyle.json'), atlas(shortname, 'Mask', 'foreground.json'), atlas(otherProject, 'Regions', 'freestyle.json')] }
          },
          {
            source: sources[1],
            url: '/data/labelsetchangetest1/',
            mri: { atlas: [atlas(shortname, 'Regions', 'freestyle.json')] }
          },
          { source: sources[2], url: '/data/labelsetchangetest2/', mri: { atlas: [] } }
        ]);
    });

    after(async function () {
      await U.removeProject(shortname);
      await U.getNativeDB().collection('mri')
        .deleteMany({ source: { $in: sources } });
    });

    it('gives the new label set to the layer\'s atlas in each MRI of the project', async function () {
      const res = await save(project([layer('Regions', 'cerebellum.json'), layer('Mask', 'foreground.json')]));
      assert.isTrue(res.body.success, JSON.stringify(res.body));
      assert.strictEqual((await U.queryProject(shortname)).annotations.list[0].values, 'cerebellum.json');
      for (const source of sources.slice(0, 2)) {
        // eslint-disable-next-line no-await-in-loop
        const mri = await currentMRI(source);
        assert.strictEqual(atlasOf(mri, shortname, 'Regions').labels, 'cerebellum.json', source);
      }
    });

    it('changes neither the other layers nor the layers of the same name in other projects', async function () {
      await save(project([layer('Regions', 'cerebellum.json'), layer('Mask', 'foreground.json')]));
      const mri = await currentMRI(sources[0]);
      assert.strictEqual(atlasOf(mri, shortname, 'Mask').labels, 'foreground.json');
      assert.strictEqual(atlasOf(mri, otherProject, 'Regions').labels, 'freestyle.json');
      assert.lengthOf(mri.mri.atlas, 3);
    });

    it('keeps the previous version of each MRI changed as a backup, and does not touch the others', async function () {
      await save(project([layer('Regions', 'cerebellum.json'), layer('Mask', 'foreground.json')]));
      const versions = await U.getNativeDB().collection('mri')
        .find({ source: sources[0] })
        .toArray();
      assert.lengthOf(versions, 2);
      const backup = versions.find((v) => v.backup);
      assert.strictEqual(atlasOf(backup, shortname, 'Regions').labels, 'freestyle.json');
      assert.lengthOf(await U.getNativeDB().collection('mri')
        .find({ source: sources[2] })
        .toArray(), 1);
    });

    it('does not create a new version of the MRIs when no label set changed', async function () {
      await save(project([layer('Regions', 'freestyle.json'), layer('Mask', 'foreground.json')]));
      assert.lengthOf(await U.getNativeDB().collection('mri')
        .find({ source: { $in: sources } })
        .toArray(), 3);
    });

    it('does not give the atlases a label set that does not exist', async function () {
      await save(project([layer('Regions', '../../cfg.json'), layer('Mask', 'foreground.json')]));
      const mri = await currentMRI(sources[0]);
      assert.strictEqual(atlasOf(mri, shortname, 'Regions').labels, 'freestyle.json');
    });
  });
});
