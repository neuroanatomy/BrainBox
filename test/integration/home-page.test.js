'use strict';

/*
  The home page (templates/index.mustache) without the old intro.js tour (T002 C1): it had
  been commented out, and its script, /js/brainbox-intro.js, was never built. The page
  still loads its own script, and /lib/ still serves the built viewer bundles (public/lib/
  lost its 16 unused vendor files).
*/

const chai = require('chai');
const { assert } = chai;
const U = require('../utils.js');

const get = (path) => chai.request(U.serverURL).get(path);

describe('The home page', function () {
  it('has no intro.js and no brainbox-intro.js', async function () {
    const res = await get('/');
    assert.strictEqual(res.status, 200);
    assert.notInclude(res.text, 'intro.js');
    assert.notInclude(res.text, 'introjs');
    assert.notInclude(res.text, 'brainbox-intro.js');
    assert.include(res.text, '<script src="/js/index-page.js"></script>');
  });

  it('/lib/ still serves the built viewer, and not the removed vendor files', async function () {
    for (const path of ['/lib/atlasmaker.js', '/lib/brainbox.js', '/lib/atlasmaker-tools/tools.json']) {
      // eslint-disable-next-line no-await-in-loop
      assert.strictEqual((await get(path)).status, 200, path);
    }
    for (const path of ['/lib/require.js', '/lib/pako/pako.min.js', '/lib/purify.min.js']) {
      // eslint-disable-next-line no-await-in-loop
      assert.strictEqual((await get(path)).status, 404, path);
    }
  });
});
