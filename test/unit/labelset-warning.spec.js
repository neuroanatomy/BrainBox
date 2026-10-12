const { assert } = require('chai');
const { changedVolumeLabelsets, layerWarning, labelsetWarning } = require('../../view/shared/labelsetWarning');

const layer = (name, values, type = 'volume') => ({ type, name, values });
const check = (unlabelled, extra = {}) => ({
  layer: 'Regions',
  values: 'cerebellum.json',
  labelset: { name: 'Cerebellum: 28 segments', count: 28, max: 28 },
  atlases: 4,
  annotated: 3,
  used: [1, 2, 30, 40],
  unlabelled,
  ...extra
});

describe('Label set warning (view/shared/labelsetWarning.js)', function () {
  describe('changedVolumeLabelsets', function () {
    it('lists the volume layers, matched by name, whose label set changed', function () {
      const before = [layer('A', 'freestyle.json'), layer('B', 'foreground.json'), layer('T', '', 'text')];
      const after = [layer('B', 'foreground.json'), layer('A', 'cerebellum.json'), layer('T', 'x', 'text'), layer('New', 'cerebrum.json')];
      assert.deepEqual(changedVolumeLabelsets(before, after), [{ name: 'A', values: 'cerebellum.json' }]);
    });

    it('copes with missing lists', function () {
      assert.deepEqual(changedVolumeLabelsets(null, [layer('A', 'freestyle.json')]), []);
      assert.deepEqual(changedVolumeLabelsets([layer('A', 'freestyle.json')], null), []);
    });
  });

  describe('layerWarning', function () {
    it('says nothing when every value used has a label', function () {
      assert.isNull(layerWarning(check([])));
      assert.isNull(layerWarning(null));
    });

    it('names the layer, the largest value used, the label set and the values without a label', function () {
      const text = layerWarning(check([30, 40]));
      assert.include(text, 'Layer "Regions" already has annotations, in 3 MRIs, that use values up to 40.');
      assert.include(text, 'The label set "Cerebellum: 28 segments" has 28 labels (values up to 28)');
      assert.include(text, 'the annotation values 30, 40 will no longer show as separate colours');
    });

    it('shortens a long list of values', function () {
      const many = Array.from({ length: 15 }, (_x, i) => i + 30);
      assert.include(layerWarning(check(many, { used: many })), '30, 31, 32, 33, 34, 35, 36, 37, 38, 39 and 5 more');
    });
  });

  describe('labelsetWarning', function () {
    it('asks for a confirmation only if a layer has values without a label', function () {
      assert.isNull(labelsetWarning([check([])]));
      const text = labelsetWarning([check([]), check([30]), check([40], { layer: 'Other' })]);
      assert.include(text, 'Layer "Regions"');
      assert.include(text, 'Layer "Other"');
      assert.match(text, /Are you sure you want to change the label set\?$/);
    });
  });
});
