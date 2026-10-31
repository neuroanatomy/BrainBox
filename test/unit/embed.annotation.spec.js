const { assert } = require('chai');
const { findAnnotationItemIndex, NO_ATLAS } = require('../../view/shared/embedAnnotation');

const mri = { atlas: [
  { project: 'p1', name: 'First' },
  { project: 'p2', name: 'Second' }
] };

describe('embed annotation choice (findAnnotationItemIndex)', function () {
  it('defaults to the first atlas without project/annotation', function () {
    assert.strictEqual(findAnnotationItemIndex(mri), 0);
    assert.strictEqual(findAnnotationItemIndex(mri, 'p2'), 0);
    assert.strictEqual(findAnnotationItemIndex(mri, '', 'Second'), 0);
  });

  it('finds the requested atlas, and falls back to the first when unknown', function () {
    assert.strictEqual(findAnnotationItemIndex(mri, 'p2', 'Second'), 1);
    assert.strictEqual(findAnnotationItemIndex(mri, 'p2', 'Nope'), 0);
  });

  it('tolerates a missing mri', function () {
    assert.strictEqual(findAnnotationItemIndex(null, 'p', 'a'), 0);
    assert.strictEqual(findAnnotationItemIndex({}, 'p', 'a'), 0);
  });

  it('annotation=none means no atlas, with or without a project', function () {
    assert.strictEqual(findAnnotationItemIndex(mri, 'p1', 'none'), NO_ATLAS);
    assert.strictEqual(findAnnotationItemIndex(mri, '', 'none'), NO_ATLAS);
    assert.strictEqual(findAnnotationItemIndex(null, '', 'none'), NO_ATLAS);
    assert.strictEqual(NO_ATLAS, -1);
  });

  it('only exactly "none" disables the atlas', function () {
    assert.strictEqual(findAnnotationItemIndex(mri, 'p1', 'None'), 0);
    assert.strictEqual(findAnnotationItemIndex(mri, 'p1', 'First'), 0);
  });
});
