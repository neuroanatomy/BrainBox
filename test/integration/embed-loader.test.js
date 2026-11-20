'use strict';

/*
  /embed.js, the one-line embed's loader (controller/embedLoader.js), made at start-up by
  nwl-components' embedScript() instead of served from public/. Pages outside our control load
  it, so it keeps the headers the static file had: JavaScript in UTF-8, readable from any
  origin, revalidated on each load, with an ETag. And it is BrainBox's loader: its message,
  its embed page and its page-wide registry.
*/

const { assert } = require('chai');
const U = require('../utils.js');

describe('/embed.js, the one-line embed\'s loader', function () {
  let res;
  let text;

  before(async function () {
    res = await fetch(U.serverURL + '/embed.js');
    text = await res.text();
  });

  it('answers with the static file\'s headers', function () {
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'application/javascript; charset=UTF-8');
    assert.strictEqual(res.headers.get('access-control-allow-origin'), '*');
    assert.strictEqual(res.headers.get('cache-control'), 'public, max-age=0');
    assert.match(res.headers.get('etag'), /^W\/".+"$/);
  });

  it('is BrainBox\'s loader', function () {
    assert.include(text, 'brainbox:embed-resize');
    assert.include(text, '/mri/embed');
    assert.include(text, '__brainboxEmbeds');
  });

  it('answers 304 to its own ETag', async function () {
    // with If-None-Match alone, fetch adds Cache-Control: no-cache, and no-cache is never answered 304
    const headers = { 'If-None-Match': res.headers.get('etag'), 'Cache-Control': 'max-age=0' };
    const again = await fetch(U.serverURL + '/embed.js', { headers });
    assert.strictEqual(again.status, 304);
  });
});
