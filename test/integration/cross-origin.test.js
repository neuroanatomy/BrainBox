'use strict';

/*
  The tests open the pages at cfg.json's hostname (U.serverURL), the address the pages
  are built to call, so the viewer and the server are always the same origin, locally
  and in CI. A page served from another origin may still call the API (the server
  allows it: app.js, 'Allow CORS'), and the browser then drops any answer without the
  CORS header (fetch then throws). This checks that deliberately, from a page on the
  same server reached under another host name (localhost <-> 127.0.0.1), for answers
  and errors.
*/

const puppeteer = require('puppeteer');
const { assert } = require('chai');
const U = require('../utils.js');

const server = new URL(U.serverURL);
const otherOrigin = `${server.protocol}//${server.hostname === 'localhost' ? '127.0.0.1' : 'localhost'}${server.port ? ':' + server.port : ''}`;

describe('The API called from a page of another origin', function () {
  // eslint-disable-next-line no-invalid-this
  this.timeout(U.longTimeout);

  let browser, page;

  before(async function () {
    browser = await puppeteer.launch({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    page = await browser.newPage();
    await page.goto(otherOrigin + '/test_data/foo.png');
  });

  after(async function () {
    if (browser) { await browser.close(); }
  });

  /**
   * Fetch from the page of the other origin. A response dropped by the browser for
   * lack of a CORS header makes fetch throw, reported as { error }.
   * @param {string} path Path on U.serverURL
   * @param {Object} [init] fetch options; a `form` object is sent as a urlencoded body
   * @returns {Promise<Object>} { status } or { error }
   */
  const call = (path, init = {}) => page.evaluate(async (url, { form, ...options }) => {
    try {
      const res = await fetch(url, form ? { ...options, body: new URLSearchParams(form) } : options);

      return { status: res.status };
    } catch (err) {
      return { error: String(err) };
    }
  }, U.serverURL + path, init);

  it('is served from another origin than the API', async function () {
    assert.notStrictEqual(await page.evaluate(() => location.origin), new URL(U.serverURL).origin);
  });

  it('reads a successful answer', async function () {
    assert.deepEqual(await call('/api/getLabelsets'), { status: 200 });
    assert.deepEqual(await call('/mri/json', { method: 'POST', form: { url: U.localBertURL } }), { status: 200 });
  });

  it('reads an error answer', async function () {
    assert.deepEqual(await call('/project/json/no-such-project-cross-origin/files'), { status: 403 });
    assert.deepEqual(await call('/no-such-route-cross-origin'), { status: 404 });
  });
});
