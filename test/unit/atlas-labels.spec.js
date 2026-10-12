'use strict';

const chai = require('chai');
const { assert } = chai;
const U = require('../utils.js');
const { isLabelset, changedLabelsets, setLayerLabelset } = require('../../controller/project/atlas-labels.js');
const { syncAtlasLabelsets } = require('../../bin/sync-atlas-labelsets.js');

const PROJECT = 'atlaslabelsunit';
const OTHER = 'atlaslabelsunitother';
const SOURCES = ['https://example.org/atlaslabelsunit/1.nii.gz', 'https://example.org/atlaslabelsunit/2.nii.gz'];
const layer = (name, values, type = 'volume') => ({ type, name, values });
const atlas = (project, name, labels) => ({ project, name, labels, type: 'volume', filename: `${project}-${name}.nii.gz` });

describe('UNIT TESTING controller/project/atlas-labels.js', function () {
  let nativeDb;
  const versions = (source) => nativeDb.collection('mri').find({ source })
    .toArray();
  const current = (source) => nativeDb.collection('mri').findOne({ source, backup: { $exists: false } });

  before(function () {
    nativeDb = U.getNativeDB();
  });

  beforeEach(async function () {
    await nativeDb.collection('mri').deleteMany({ source: { $in: SOURCES } });
    await U.removeProject(PROJECT);
    await nativeDb.collection('mri').insertMany([
      { source: SOURCES[0], mri: { atlas: [atlas(PROJECT, 'Regions', 'freestyle.json'), atlas(OTHER, 'Regions', 'freestyle.json')] } },
      { source: SOURCES[1], mri: { atlas: [atlas(PROJECT, 'Regions', 'cerebellum.json'), atlas(PROJECT, 'Mask', 'foreground.json')] } }
    ]);
  });

  after(async function () {
    await nativeDb.collection('mri').deleteMany({ source: { $in: SOURCES } });
    await U.removeProject(PROJECT);
  });

  describe('isLabelset', function () {
    it('accepts the files of public/labels/', function () {
      assert.isTrue(isLabelset('freestyle.json'));
      assert.isTrue(isLabelset('cerebellum.json'));
    });

    it('refuses other strings, paths and values', function () {
      for (const values of ['nothere.json', '../../cfg.json', 'labels/freestyle.json', 'freestyle', '', null, 3, {}]) {
        assert.isFalse(isLabelset(values), String(values));
      }
    });
  });

  describe('changedLabelsets', function () {
    it('lists the volume layers, matched by name, whose label set changed', function () {
      const before = { list: [layer('A', 'freestyle.json'), layer('B', 'foreground.json'), layer('T', 'x', 'text')] };
      const after = { list: [layer('B', 'foreground.json'), layer('A', 'cerebellum.json'), layer('T', 'y', 'text'), layer('New', 'cerebrum.json')] };
      assert.deepEqual(changedLabelsets(before, after), [{ name: 'A', from: 'freestyle.json', values: 'cerebellum.json' }]);
    });

    it('copes with missing lists', function () {
      assert.deepEqual(changedLabelsets(null, { list: [layer('A', 'freestyle.json')] }), []);
      assert.deepEqual(changedLabelsets({ list: [layer('A', 'freestyle.json')] }, {}), []);
    });
  });

  describe('setLayerLabelset', function () {
    it('only reports in a dry run', async function () {
      const changed = await setLayerLabelset(nativeDb, { project: PROJECT, name: 'Regions', values: 'cerebellum.json', username: 'foo', dryRun: true });
      assert.deepEqual(changed, [{ source: SOURCES[0], from: ['freestyle.json'] }]);
      assert.lengthOf(await versions(SOURCES[0]), 1);
    });

    it('saves a new version of the MRIs whose atlas has another label set', async function () {
      await setLayerLabelset(nativeDb, { project: PROJECT, name: 'Regions', values: 'cerebellum.json', username: 'foo' });
      const mri = await current(SOURCES[0]);
      assert.deepEqual(mri.mri.atlas.map((a) => a.labels), ['cerebellum.json', 'freestyle.json']);
      assert.strictEqual(mri.mri.atlas[0].modifiedBy, 'foo');
      assert.lengthOf(await versions(SOURCES[0]), 2);
      assert.lengthOf(await versions(SOURCES[1]), 1);
    });

    it('refuses an unknown label set', async function () {
      let error;
      try {
        await setLayerLabelset(nativeDb, { project: PROJECT, name: 'Regions', values: '../x.json', username: 'foo' });
      } catch (err) {
        error = err;
      }
      assert.instanceOf(error, Error);
      assert.lengthOf(await versions(SOURCES[0]), 1);
    });
  });

  describe('bin/sync-atlas-labelsets.js', function () {
    beforeEach(async function () {
      await nativeDb.collection('project').insertOne({
        shortname: PROJECT,
        annotations: { list: [layer('Regions', 'cerebellum.json'), layer('Mask', 'foreground.json'), layer('Gone', 'gone.json')] }
      });
    });

    it('reports the atlases to change, and the unknown label sets, without changing anything', async function () {
      const report = await syncAtlasLabelsets(nativeDb, { shortname: PROJECT });
      assert.deepEqual(report, [
        { project: PROJECT, name: 'Regions', values: 'cerebellum.json', unknown: false, mris: [{ source: SOURCES[0], from: ['freestyle.json'] }] },
        { project: PROJECT, name: 'Gone', values: 'gone.json', unknown: true, mris: [] }
      ]);
      assert.lengthOf(await versions(SOURCES[0]), 1);
    });

    it('changes them with apply', async function () {
      await syncAtlasLabelsets(nativeDb, { shortname: PROJECT, apply: true });
      const mri = await current(SOURCES[0]);
      assert.deepEqual(mri.mri.atlas.map((a) => a.labels), ['cerebellum.json', 'freestyle.json']);
      assert.strictEqual(mri.modifiedBy, 'sync-atlas-labelsets');
      assert.deepEqual(await syncAtlasLabelsets(nativeDb, { shortname: PROJECT }), [{ project: PROJECT, name: 'Gone', values: 'gone.json', unknown: true, mris: [] }]);
    });
  });
});
