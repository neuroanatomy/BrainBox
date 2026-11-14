'use strict';

/*
  Unknown URLs and errors (app.js, controller/routes/not-found.js). An unknown page gets a
  404 with the error template, in the kit's look (it links nwl-components' fonts.css), with
  the message, the requested path escaped, and a link to the home page; never Express's
  default "Cannot GET". An unknown API or JSON path gets a 404 in JSON, and a missing
  script or image a 404 in plain text, not a page. A route that throws, or calls
  next(err), gives a 500 with the template; the stack shows only in development. The
  failing routes are test-only (test/utils.js, mounted only by the tests).
*/

const chai = require('chai');
const { assert } = chai;
const U = require('../utils.js');

const page = (path) => chai.request(U.serverURL).get(path)
  .set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');

describe('Unknown URLs and errors', function () {
  describe('An unknown page', function () {
    it('gives 404 and the error template', async function () {
      const res = await page('/no/such/page');
      assert.strictEqual(res.status, 404);
      assert.match(res.headers['content-type'], /^text\/html/);
      assert.include(res.text, '/lib/nwl-components/fonts.css');
      assert.include(res.text, '<title>BrainBox: Page not found</title>');
      assert.include(res.text, '<h1>Page not found</h1>');
      assert.include(res.text, '&#x2F;no&#x2F;such&#x2F;page');
      assert.include(res.text, '<a href="/">Go to the home page</a>');
      assert.notInclude(res.text, 'Cannot GET');
    });

    it('shows a path with a <script> escaped', async function () {
      const res = await page('/x/<script>alert(1)</script>');
      assert.strictEqual(res.status, 404);
      assert.notInclude(res.text, '<script>alert(1)</script>');
      assert.include(res.text, '&lt;script&gt;alert(1)&lt;&#x2F;script&gt;');
    });

    it('gives 404 to HEAD', async function () {
      const res = await chai.request(U.serverURL).head('/no/such/page')
        .set('Accept', 'text/html');
      assert.strictEqual(res.status, 404);
    });
  });

  describe('An unknown JSON path', function () {
    it('under /api/ gives 404 JSON', async function () {
      const res = await chai.request(U.serverURL).get('/api/noSuchThing');
      assert.strictEqual(res.status, 404);
      assert.deepEqual(res.body, { error: 'Not found' });
    });

    it('with /json/ gives 404 JSON, even asked as a page', async function () {
      const res = await page('/nothing/json/here');
      assert.strictEqual(res.status, 404);
      assert.deepEqual(res.body, { error: 'Not found' });
    });
  });

  describe('A missing asset', function () {
    for (const path of ['/lib/no-such-lib/x.js', '/img/x.png']) {
      it(`${path} gives 404, not a page`, async function () {
        const res = await chai.request(U.serverURL).get(path)
          .set('Accept', '*/*');
        assert.strictEqual(res.status, 404);
        assert.notMatch(res.headers['content-type'], /html/);
        assert.notInclude(res.text, '<html');
      });
    }
  });

  describe('A route that fails', function () {
    let env;

    before(function () { env = U.getApp().get('env'); });

    after(function () { U.getApp().set('env', env); });

    for (const path of ['/test_error/throw', '/test_error/next']) {
      it(`${path} gives 500 and the template, without the stack in production`, async function () {
        U.getApp().set('env', 'production');
        const res = await page(path);
        assert.strictEqual(res.status, 500);
        assert.include(res.text, '/lib/nwl-components/fonts.css');
        assert.include(res.text, '<h1>Server error</h1>');
        assert.include(res.text, '<a href="/">Go to the home page</a>');
        assert.notInclude(res.text, 'test error');
        assert.notMatch(res.text, /\n\s+at /);
      });
    }

    it('shows the stack in development', async function () {
      U.getApp().set('env', 'development');
      const res = await page('/test_error/throw');
      assert.strictEqual(res.status, 500);
      assert.include(res.text, 'test error thrown by a route');
      assert.match(res.text, /\n\s+at /);
    });

    it('answers a JSON request in JSON', async function () {
      U.getApp().set('env', 'production');
      const res = await chai.request(U.serverURL).get('/test_error/next')
        .set('Accept', 'application/json');
      assert.strictEqual(res.status, 500);
      assert.deepEqual(res.body, { error: 'Server error' });
    });
  });

  describe('What exists', function () {
    it('the home page gives 200', async function () {
      const res = await page('/');
      assert.strictEqual(res.status, 200);
    });

    it('a static file gives 200', async function () {
      const res = await chai.request(U.serverURL).get('/img/BrainBoxBlack.gif');
      assert.strictEqual(res.status, 200);
    });
  });
});
