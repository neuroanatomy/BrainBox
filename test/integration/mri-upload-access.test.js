'use strict';

// POST /mri/upload adds a volume annotation layer to an MRI, in a project,
// for the user of an upload token (scripts use it). The user needs to be able
// to edit the project's annotations: the project must exist, the layer gets
// the user's access to them, and a layer with the same name and project is
// replaced only by such a user.

const fs = require('fs');
const path = require('path');
const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');
const F = require('../mri-access-fixtures.js');

const atlasFile = path.join(__dirname, '../data/bert_aseg.nii.gz');

// Another project's layer and text annotations, hidden from everyone but its owner
const otherShortname = 'mriuploadotherhidden';
const otherFilename = 'mri-upload-other-hidden.nii.gz';
const otherProject = {
  name: otherShortname,
  shortname: otherShortname,
  owner: 'foo',
  collaborators: { list: [{ userID: 'anyone', nickname: 'anyone', username: 'anyone', access: { collaborators: 'none', annotations: 'none', files: 'view' } }] },
  files: { list: [U.localBertURL] },
  annotations: { list: [] }
};

/**
 * Upload a layer for the test brain with a user's token
 * @param {object} params { username, project, name }
 * @returns {Promise<object>} The response
 */
const upload = ({ username, project = F.shortname, name = 'Hidden layer' }) => chai.request(U.serverURL).post('/mri/upload')
  .field('url', U.localBertURL)
  .field('atlasName', name.replace(/[^A-Za-z0-9]/g, ''))
  .field('atlasProject', project)
  .field('atlasLabelSet', 'foreground.json')
  .field('token', F.token(username))
  .attach('atlas', atlasFile);

/**
 * The test brain's layers in the test project
 * @returns {Promise<Array>} The layers
 */
const projectLayers = async () => (await F.storedMRI()).mri.atlas.filter((a) => a.project === F.shortname);

describe('POST /mri/upload: who may add or replace a layer with a token', function () {
  // eslint-disable-next-line no-invalid-this
  this.timeout(U.longTimeout);

  let mri;

  before(async function () {
    await U.waitForTestBrain();
    await F.setUp();
    const db = U.getNativeDB();
    await db.collection('project').deleteMany({ shortname: otherShortname });
    await db.collection('project').insertOne({ ...otherProject });
    await db.collection('mri').updateOne({ source: U.localBertURL, backup: { $exists: false } }, {
      $push: { 'mri.atlas': { filename: otherFilename, project: otherShortname, name: 'Other', type: 'volume', labels: 'foreground.json', access: 'edit' } },
      $set: { [`mri.annotations.${otherShortname}`]: { Note: { type: 'text', data: 'not for everyone' } } }
    });
    mri = await F.storedMRI();
  });

  after(async function () {
    const layers = await projectLayers();
    await U.getNativeDB().collection('mri')
      .updateMany({ source: U.localBertURL }, {
        $pull: { 'mri.atlas': { project: { $in: [F.shortname, 'nosuchprojectmriroutes', otherShortname] } } },
        $unset: { [`mri.annotations.${otherShortname}`]: '' }
      });
    await U.getNativeDB().collection('project')
      .deleteMany({ shortname: otherShortname });
    for (const layer of layers) {
      // eslint-disable-next-line no-await-in-loop
      await fs.promises.rm(path.join(__dirname, '../../public', mri.url, layer.filename), { force: true });
    }
    await F.tearDown();
  });

  it('refuses a project that does not exist (404)', async function () {
    const res = await upload({ username: F.users.editor, project: 'nosuchprojectmriroutes' });
    assert.equal(res.statusCode, 404);
    assert.isString(res.body.error);
    assert.isUndefined((await F.storedMRI()).mri.atlas.find((a) => a.project === 'nosuchprojectmriroutes'));
  });

  it('refuses a logged-in user who cannot see the project\'s annotations (403)', async function () {
    const res = await upload({ username: F.users.nonmember });
    assert.equal(res.statusCode, 403);
    assert.isString(res.body.error);
    assert.lengthOf(await projectLayers(), 0);
  });

  it('refuses a collaborator who may only view the project\'s annotations (403)', async function () {
    const res = await upload({ username: F.users.viewer });
    assert.equal(res.statusCode, 403);
    assert.lengthOf(await projectLayers(), 0);
  });

  it('adds the layer of a collaborator who may edit the project\'s annotations, with that access', async function () {
    const res = await upload({ username: F.users.editor });
    assert.equal(res.statusCode, 200);
    const layers = await projectLayers();
    assert.lengthOf(layers, 1);
    assert.equal(layers[0].owner, F.users.editor);
    assert.equal(layers[0].access, 'edit');
  });

  it('answers the uploader the MRI without the layers and text annotations hidden from them', async function () {
    const res = await upload({ username: F.users.editor });
    assert.equal(res.statusCode, 200);
    const layer = res.body.mri.atlas.find((a) => a.project === F.shortname);
    assert.equal(layer.access, 'edit', 'the new layer, with the uploader\'s access');
    assert.isUndefined(res.body.mri.atlas.find((a) => a.filename === otherFilename), 'no hidden layer');
    assert.notProperty(res.body.mri.annotations || {}, otherShortname, 'no hidden text annotations');
    const stored = await F.storedMRI();
    assert.isDefined(stored.mri.atlas.find((a) => a.filename === otherFilename), 'the hidden layer is still stored');
  });

  it('does not let a viewer replace that layer (403), which is kept', async function () {
    const [before] = await projectLayers();
    const res = await upload({ username: F.users.viewer });
    assert.equal(res.statusCode, 403);
    const layers = await projectLayers();
    assert.lengthOf(layers, 1);
    assert.equal(layers[0].filename, before.filename);
  });

  it('lets the project\'s owner replace it, with the owner\'s access to the project', async function () {
    const [before] = await projectLayers();
    const res = await upload({ username: 'foo' });
    assert.equal(res.statusCode, 200);
    const layers = await projectLayers();
    assert.lengthOf(layers, 1);
    assert.notEqual(layers[0].filename, before.filename);
    assert.equal(layers[0].owner, 'foo');
    assert.equal(layers[0].access, 'remove');
  });
});
