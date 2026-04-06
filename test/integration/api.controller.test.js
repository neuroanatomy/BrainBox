'use strict';

const chai = require('chai');
const {assert} = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');

describe('TESTING THE /api ROUTE', function () {
  it('GET /api/getLabelsets/ should return the list of labels', async function () {
    const { body } = await chai.request(U.serverURL).get('/api/getLabelsets');
    assert.isArray(body);
    assert.isNotEmpty(body);
    body.forEach((item) => assert.containsAllKeys(item, ['name', 'source']));
  });

  it('GET /api/userNameQuery/ without any parameter should return status 400', async function () {
    const res = await chai.request(U.serverURL).get('/api/userNameQuery');
    assert.equal(res.statusCode, 400);
  });

  it('GET /api/userNameQuery/ with a q parameter should return a list of users', async function () {
    const res = await chai.request(U.serverURL).get('/api/userNameQuery?q=foo');
    assert.equal(res.statusCode, 200);
    assert.isArray(res.body);
    assert.isNotEmpty(res.body);
    res.body.forEach((item) => assert.containsAllKeys(item, ['name', 'nickname']));
  });

  it('GET /api/getAtlasBackups/ without any parameter should return status 400', async function () {
    const res = await chai.request(U.serverURL).get('/api/getAtlasBackups');
    assert.equal(res.statusCode, 400);
  });

  it('GET /api/getAtlasBackups/ with right parameters should return a list of atlas backups', async function () {
    const testSource = U.projectTest.files.list[0].source;
    const testProject = U.projectTest.shortname;
    const testAtlasName = 'Default';

    // insert a test MRI with an atlas referencing the test project
    const nativeDb = U.getNativeDB();
    await nativeDb.collection('mri').insertOne({
      source: testSource,
      url: '/data/testhash/',
      mri: {
        atlas: [
          {
            name: testAtlasName,
            project: testProject,
            filename: 'Atlas.nii.gz',
            created: (new Date()).toJSON(),
            modified: (new Date()).toJSON(),
            access: 'edit',
            type: 'volume',
            labels: 'foreground.json'
          }
        ]
      }
    });

    const res = await chai.request(U.serverURL)
      .get('/api/getAtlasBackups')
      .query({ source: testSource, atlasProject: testProject, atlasName: testAtlasName });
    assert.equal(res.statusCode, 200);
    assert.isArray(res.body);
    assert.isNotEmpty(res.body);
    res.body.forEach((item) => assert.property(item, 'filename'));

    // cleanup
    await nativeDb.collection('mri').deleteMany({ source: testSource, url: '/data/testhash/' });
  });

  it('POST /api/log/ should return the total annotation length', async function () {
    const [, {source}] = U.projectTest.files.list;
    const atlas = 'Atlas.nii.gz';
    const length1 = (await chai.request(U.serverURL).post('/api/log')
      .send({
        key: 'annotationLength',
        value: {
          source,
          atlas,
          length:10
        }
      })).body.length;
    const length2 = (await chai.request(U.serverURL).post('/api/log')
      .send({
        key: 'annotationLength',
        value: {
          source,
          atlas,
          length:20
        }
      })).body.length;
    assert.equal(length2 - length1, 20);
  });
});
