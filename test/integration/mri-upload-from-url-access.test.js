'use strict';

// POST /mri/upload-from-url receives an MRI file the browser downloaded itself,
// for a source that blocks the server's download. Anyone may give the file of
// an MRI that has none yet (the first download, by any visitor), but replacing
// the image of an MRI that has one is for its owner, or for a user who may
// edit the files of a project that lists it.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');
const F = require('../mri-access-fixtures.js');
const { isMriOwner } = require('../../controller/mri/mri-access.js');

const brainFile = path.join(__dirname, '../../public/test_data/bert_brain.nii.gz');
const otherFile = path.join(__dirname, '../data/bert_aseg.nii.gz');
const fileHash = async (file) => crypto.createHash('md5').update(await fs.promises.readFile(file))
  .digest('hex');
const dataDir = (source) => path.join(__dirname, '../../public/data', crypto.createHash('md5').update(source)
  .digest('hex'));

/**
 * Upload a file as the MRI of a source
 * @param {object} params { source, file, cookie, forwardedFor (an X-Forwarded-For header) }
 * @returns {Promise<object>} The response
 */
const uploadFromURL = ({ source = U.localBertURL, file, cookie, forwardedFor }) => {
  const req = chai.request(U.serverURL).post('/mri/upload-from-url');
  if (cookie) {
    req.set('Cookie', cookie);
  }
  if (forwardedFor) {
    req.set('X-Forwarded-For', forwardedFor);
  }

  return req.field('url', source)
    .attach('mriFile', file, path.basename(source));
};

const firstSource = U.testDataURL + '/test_data/mri-routes-first-upload.nii.gz';
const listedSource = U.testDataURL + '/test_data/mri-routes-listed-not-downloaded.nii.gz';
const forgedSource = U.testDataURL + '/test_data/mri-routes-forged-owner.nii.gz';
const proxiedSource = U.testDataURL + '/test_data/mri-routes-proxied-owner.nii.gz';
const loggedInSource = U.testDataURL + '/test_data/mri-routes-logged-in-owner.nii.gz';
const ownerSources = [forgedSource, proxiedSource, loggedInSource];

describe('POST /mri/upload-from-url: who may give an MRI its image', function () {
  // eslint-disable-next-line no-invalid-this
  this.timeout(U.longTimeout);

  let brainPath, mri, originalOwner;

  /**
   * Try to replace the test brain's image with another file, as a user
   * @param {string|null} username The user, null for an anonymous visitor
   * @returns {Promise<object>} { res, imageChanged, documentChanged }
   */
  const replaceImage = async (username) => {
    const before = await fileHash(brainPath);
    const { modified } = await F.storedMRI();
    const res = await uploadFromURL({ file: otherFile, cookie: username && F.cookie(username) });

    return {
      res,
      imageChanged: (await fileHash(brainPath)) !== before,
      documentChanged: (await F.storedMRI()).modified !== modified
    };
  };

  before(async function () {
    await U.waitForTestBrain();
    await F.setUp();
    mri = await F.storedMRI();
    originalOwner = mri.owner;
    await U.getNativeDB().collection('mri')
      .updateOne({ source: U.localBertURL, backup: { $exists: false } }, { $set: { owner: F.users.mriowner } });
    brainPath = path.join(__dirname, '../../public', mri.url, mri.filename);
  });

  after(async function () {
    // in case a refused upload was applied: the test brain back as it was
    await fs.promises.copyFile(brainFile, brainPath);
    const db = U.getNativeDB();
    await db.collection('mri').updateOne(
      { source: U.localBertURL, backup: { $exists: false } },
      { $set: { owner: originalOwner, filename: mri.filename, dim: mri.dim, pixdim: mri.pixdim, voxel2world: mri.voxel2world, worldOrigin: mri.worldOrigin } }
    );
    await U.removeMRI({ dirPath: dataDir(firstSource), srcURL: firstSource });
    await U.removeMRI({ dirPath: dataDir(listedSource), srcURL: listedSource });
    for (const source of ownerSources) {
      // eslint-disable-next-line no-await-in-loop
      await U.removeMRI({ dirPath: dataDir(source), srcURL: source });
    }
    await F.tearDown();
  });

  describe('an MRI that already has its image', function () {
    it('is refused to an anonymous visitor (401), and nothing changes', async function () {
      const { res, imageChanged, documentChanged } = await replaceImage(null);
      assert.equal(res.statusCode, 401);
      assert.isString(res.body.error);
      assert.isFalse(imageChanged, 'the image file must not change');
      assert.isFalse(documentChanged, 'the MRI document must not change');
    });

    it('is refused to a logged-in user who is not a collaborator (403), and nothing changes', async function () {
      const { res, imageChanged, documentChanged } = await replaceImage(F.users.nonmember);
      assert.equal(res.statusCode, 403);
      assert.isString(res.body.error);
      assert.isFalse(imageChanged, 'the image file must not change');
      assert.isFalse(documentChanged, 'the MRI document must not change');
    });

    it('is refused to a collaborator who may only view the project\'s files (403), and nothing changes', async function () {
      const { res, imageChanged, documentChanged } = await replaceImage(F.users.viewer);
      assert.equal(res.statusCode, 403);
      assert.isFalse(imageChanged, 'the image file must not change');
      assert.isFalse(documentChanged, 'the MRI document must not change');
    });

    it('is accepted from a collaborator who may edit the files of a project listing it', async function () {
      const res = await uploadFromURL({ file: brainFile, cookie: F.cookie(F.users.editor) });
      assert.equal(res.statusCode, 200);
      assert.isTrue(res.body.success);
      assert.equal((await F.storedMRI()).modifiedBy, F.users.editor);
    });

    it('is accepted from the MRI\'s owner', async function () {
      const res = await uploadFromURL({ file: brainFile, cookie: F.cookie(F.users.mriowner) });
      assert.equal(res.statusCode, 200);
      const stored = await F.storedMRI();
      assert.equal(stored.modifiedBy, F.users.mriowner);
      assert.equal(stored.owner, F.users.mriowner, 'the owner is kept');
      assert.deepEqual(stored.mri.atlas.map((a) => a.filename), mri.mri.atlas.map((a) => a.filename), 'the layers are kept');
    });
  });

  describe('an MRI without its image yet (first download)', function () {
    it('accepts the image of an MRI not in the database from an anonymous visitor', async function () {
      const res = await uploadFromURL({ source: firstSource, file: brainFile });
      assert.equal(res.statusCode, 200);
      assert.isTrue(res.body.success);
      const stored = await F.storedMRI(firstSource);
      assert.deepEqual(stored.dim, mri.dim);
      assert.lengthOf(stored.mri.atlas, 1);
    });

    it('accepts the image of an MRI a project lists but nobody opened yet, from an anonymous visitor', async function () {
      const hash = crypto.createHash('md5').update(listedSource)
        .digest('hex');
      // as the project settings page creates it
      await U.getNativeDB().collection('mri')
        .insertOne({ source: listedSource, url: `/data/${hash}/`, owner: 'foo', name: 'listed', mri: { atlas: [{ name: 'Default', filename: 'Atlas.nii.gz', access: 'edit', type: 'volume', labels: 'foreground.json' }] } });
      const res = await uploadFromURL({ source: listedSource, file: brainFile });
      assert.equal(res.statusCode, 200);
      const stored = await F.storedMRI(listedSource);
      assert.deepEqual(stored.dim, mri.dim);
      assert.equal(stored.owner, 'foo');
      assert.equal(stored.name, 'listed');
    });
  });

  describe('the owner of an MRI added by its first upload', function () {
    it('is not the username an anonymous visitor sends as X-Forwarded-For', async function () {
      const res = await uploadFromURL({ source: forgedSource, file: brainFile, forwardedFor: F.users.mriowner });
      assert.equal(res.statusCode, 200);
      const stored = await F.storedMRI(forgedSource);
      assert.notEqual(stored.owner, F.users.mriowner);
      assert.match(stored.owner, /^ip:/);
      assert.isFalse(isMriOwner(stored, F.users.mriowner));
      assert.equal(stored.modifiedBy, stored.owner);
    });

    it('is the address the proxy added, for an anonymous visitor behind it', async function () {
      // as Apache forwards it: what the client sent, then the client's address
      const res = await uploadFromURL({ source: proxiedSource, file: brainFile, forwardedFor: `${F.users.mriowner}, 203.0.113.7` });
      assert.equal(res.statusCode, 200);
      assert.equal((await F.storedMRI(proxiedSource)).owner, 'ip:203.0.113.7');
    });

    it('is the logged-in user, whatever X-Forwarded-For says', async function () {
      const res = await uploadFromURL({ source: loggedInSource, file: brainFile, cookie: F.cookie(F.users.editor), forwardedFor: F.users.mriowner });
      assert.equal(res.statusCode, 200);
      const stored = await F.storedMRI(loggedInSource);
      assert.equal(stored.owner, F.users.editor);
      assert.isTrue(isMriOwner(stored, F.users.editor));
    });
  });
});
