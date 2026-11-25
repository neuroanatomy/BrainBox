const { assert } = require('chai');
const { setViewAndSlice, linkToView } = require('../../view/shared/viewLink.js');

// The viewer's Link button and the embed's BrainBox button (F2, D6): the MRI
// page reads `view` and `slice` from the query (brainbox.js configureBrainBox)
describe('The link to a plane and slice', function () {
  const page = 'https://brainbox.example/mri?url=https%3A%2F%2Fexample.com%2Fbrain.nii.gz';

  it('adds view and slice as query keys, without spaces', function () {
    const link = new URL(linkToView(page, { view: 'cor', slice: 42 }));
    assert.strictEqual(link.searchParams.get('view'), 'cor');
    assert.strictEqual(link.searchParams.get('slice'), '42');
    assert.strictEqual(link.searchParams.get('url'), 'https://example.com/brain.nii.gz');
    assert.notInclude(link.href, ' ');
    assert.notInclude(link.href, '%20');
  });

  it('replaces a view and slice already in the link, so each appears once', function () {
    const href = linkToView(`${page}&view=sag&slice=3`, { view: 'axi', slice: 7 });
    const query = new URL(href).searchParams;
    assert.deepStrictEqual(query.getAll('view'), ['axi']);
    assert.deepStrictEqual(query.getAll('slice'), ['7']);
  });

  it('keeps slice 0, and leaves out an unknown view or slice', function () {
    assert.strictEqual(new URL(linkToView(page, { view: 'sag', slice: 0 })).searchParams.get('slice'), '0');
    const query = new URL(linkToView(page, { view: null, slice: null })).searchParams;
    assert.isFalse(query.has('view'));
    assert.isFalse(query.has('slice'));
  });

  it('sets the keys on a query in place', function () {
    const query = new URLSearchParams({ url: 'u' });
    assert.strictEqual(setViewAndSlice(query, { view: 'cor', slice: 5 }), query);
    assert.strictEqual(query.toString(), 'url=u&view=cor&slice=5');
  });
});
