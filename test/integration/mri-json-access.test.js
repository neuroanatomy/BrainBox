'use strict';

// POST /mri/json is what the viewer asks for an MRI (and what starts its
// download). Its answer leaves out what the user cannot see, as the MRI page
// does: the layers and text annotations of projects whose annotations are
// hidden from the user. The access of each layer is the user's.

const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');
const F = require('../mri-access-fixtures.js');

const hiddenFilename = 'mri-routes-hidden.nii.gz';

/**
 * Ask for the test brain as the viewer does
 * @param {object} params { cookie, token, variable }
 * @returns {Promise<object>} The response
 */
const postMRIJson = ({ cookie, token, variable } = {}) => {
  const req = chai.request(U.serverURL).post('/mri/json' + (token ? `?token=${token}` : ''));
  if (cookie) {
    req.set('Cookie', cookie);
  }

  return req.type('form').send(variable ? { url: U.localBertURL, var: variable } : { url: U.localBertURL });
};

const hiddenLayer = (body) => body.mri.atlas.find((a) => a.filename === hiddenFilename);
const hiddenNotes = (body) => (body.mri.annotations || {})[F.shortname];

describe('POST /mri/json: the MRI as the user may see it', function () {
  // eslint-disable-next-line no-invalid-this
  this.timeout(U.longTimeout);

  before(async function () {
    await U.waitForTestBrain();
    await F.setUp();
    await U.getNativeDB().collection('mri')
      .updateOne({ source: U.localBertURL, backup: { $exists: false } }, {
        $push: { 'mri.atlas': { filename: hiddenFilename, project: F.shortname, name: 'Hidden layer', type: 'volume', labels: 'foreground.json', access: 'edit' } },
        $set: { [`mri.annotations.${F.shortname}`]: { Note: { type: 'text', data: 'not for everyone' } } }
      });
  });

  after(async function () {
    await U.getNativeDB().collection('mri')
      .updateMany({ source: U.localBertURL }, { $pull: { 'mri.atlas': { filename: hiddenFilename } }, $unset: { [`mri.annotations.${F.shortname}`]: '' } });
    await F.tearDown();
  });

  it('gives an anonymous visitor the MRI, without the hidden layer and text annotations', async function () {
    const res = await postMRIJson();
    assert.equal(res.statusCode, 200);
    assert.isTrue(res.body.success);
    assert.isAbove(res.body.mri.atlas.length, 0, 'the public layers are there');
    assert.isUndefined(hiddenLayer(res.body));
    assert.isUndefined(hiddenNotes(res.body));
  });

  it('gives a logged-in user who is not a collaborator the MRI without them', async function () {
    const res = await postMRIJson({ cookie: F.cookie(F.users.nonmember) });
    assert.equal(res.statusCode, 200);
    assert.isUndefined(hiddenLayer(res.body));
    assert.isUndefined(hiddenNotes(res.body));
  });

  it('filters a single variable asked for too', async function () {
    const res = await postMRIJson({ variable: 'mri/atlas' });
    assert.equal(res.statusCode, 200);
    assert.isArray(res.body);
    assert.isUndefined(res.body.find((a) => a.filename === hiddenFilename));
  });

  it('gives a viewer of the project the layer, with the viewer\'s access', async function () {
    const res = await postMRIJson({ cookie: F.cookie(F.users.viewer) });
    assert.equal(hiddenLayer(res.body).access, 'view');
    assert.isObject(hiddenNotes(res.body));
  });

  it('gives an editor of the project, logged in with a token, the layer with the editor\'s access', async function () {
    const res = await postMRIJson({ token: F.token(F.users.editor) });
    assert.equal(hiddenLayer(res.body).access, 'edit');
    assert.isObject(hiddenNotes(res.body));
  });
});
