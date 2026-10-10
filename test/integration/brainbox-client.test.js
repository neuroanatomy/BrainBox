/* eslint-disable max-lines */
/* global BrainBox AtlasMakerWidget */
'use strict';

/*
  Browser tests for the client-side BrainBox object (view/brainbox/src/brainbox.js):
  BrainBox.loadLabelsets() and BrainBox.widget(), the two places that talk to the
  server. They pin down what callers rely on, independently of how the requests
  are made (jQuery's $.getJSON/$.get, or fetch):
   - the promise resolves only after BrainBox.labelSets is set,
   - an HTTP error, or a body that is not JSON, rejects loadLabelsets() and leaves
     the previous label sets alone,
   - widget() asks /mri/json for the brain with download=true, and swallows a
     failed request (logs it, resolves undefined) instead of rejecting.
*/

const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');

const hostURL = U.serverURL + '/test_data/widget-host.html';

/**
 * Open the widget host page. Requests outside our server are aborted, as in
 * U.blockExternalRequests; `override(url)` may instead return a canned response
 * ({ status, contentType, body }) for a local request, to simulate server errors.
 * @param {Object} browser A puppeteer browser
 * @param {Function} [override] url => response object, or null to let it through
 * @returns {Promise<Object>} The page, and the local requests it made
 */
const openHost = async (browser, override = () => null) => {
  const page = await browser.newPage();
  const requests = [];
  const consoleErrors = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    // BrainBox builds its URLs from cfg.json's hostname, which may be localhost rather than U.serverURL
    if (!U.isLocalURL(url)) {
      req.abort();

      return;
    }
    requests.push({ method: req.method(), url });
    const canned = override(url);
    if (canned) { req.respond(canned); } else { req.continue(); }
  });
  page.on('console', (msg) => { if (msg.type() === 'log' && msg.text().startsWith('ERROR')) { consoleErrors.push(msg.text()); } });
  await page.goto(hostURL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.BrainBox && window.AtlasMakerWidget, { timeout: U.mediumTimeout });

  return { page, requests, consoleErrors };
};

/**
 * Label sets first, then the brain's info, asked for with exactly these parameters.
 * @param {Array} requests The local requests the page made, in order
 * @returns {void}
 */
const assertWidgetRequests = (requests) => {
  const labelsIndex = requests.findIndex((r) => r.url.includes('/api/getLabelsets'));
  const infoIndex = requests.findIndex((r) => r.method === 'GET' && r.url.includes('/mri/json'));
  assert.isAtLeast(labelsIndex, 0, 'label sets were never requested');
  assert.isAbove(infoIndex, labelsIndex, 'the brain\'s info is requested after the label sets');
  const query = new URL(requests[infoIndex].url).searchParams;
  assert.deepEqual([...query.keys()].sort(), ['download', 'url']);
  assert.strictEqual(query.get('url'), U.localBertURL);
  assert.strictEqual(query.get('download'), 'true');
};

describe('TESTING THE CLIENT-SIDE BRAINBOX OBJECT', function () {
  let browser;
  let serverLabelSets;

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    browser = await puppeteer.launch({ headless: true, ignoreHTTPSErrors: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const res = await chai.request(U.serverURL).get('/api/getLabelsets');
    serverLabelSets = res.body;
  });

  after(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    if (browser) { await browser.close(); }
    // Like the other suites using the test brain, leave it removed: workflow-ws.js expects to download it afresh.
    // (It may have been there before us: inserting U.projectTest, in test/runner.js, starts downloading it.)
    const res = await chai.request(U.serverURL).get('/mri/json')
      .query({ url: U.localBertURL });
    if (res.body && res.body.url) {
      await U.removeMRI({ dirPath: './public' + res.body.url, srcURL: U.localBertURL });
    }
  });

  describe('BrainBox.loadLabelsets()', function () {
    it('resolves once BrainBox.labelSets holds the server\'s label sets', async function () {
      const { page } = await openHost(browser);
      try {
        const result = await page.evaluate(async () => {
          const before = BrainBox.labelSets;
          const pr = BrainBox.loadLabelsets();
          const thenable = typeof pr.then === 'function';
          await pr;

          return { before, thenable, after: BrainBox.labelSets };
        });
        assert.isNull(result.before, 'nothing should be loaded before the call');
        assert.isTrue(result.thenable, 'callers chain on the returned promise');
        assert.isAbove(serverLabelSets.length, 0);
        assert.deepEqual(result.after, serverLabelSets);
      } finally {
        await page.close();
      }
    }).timeout(U.longTimeout);

    const failures = [
      { name: 'the server answers with an HTTP error', canned: { status: 500, contentType: 'application/json', body: '{"error":"boom"}' } },
      { name: 'the body is not JSON', canned: { status: 200, contentType: 'text/html', body: '<html>not json</html>' } }
    ];
    for (const { name, canned } of failures) {
      // `browser` is set by the before() hook; it is read when the test runs, not when the loop runs
      // eslint-disable-next-line no-loop-func
      it(`rejects, and leaves the previous label sets alone, when ${name}`, async function () {
        const { page } = await openHost(browser, (url) => (url.includes('/api/getLabelsets') ? canned : null));
        try {
          const result = await page.evaluate(async () => {
            BrainBox.labelSets = ['previous'];
            try {
              await BrainBox.loadLabelsets();

              return { rejected: false, labelSets: BrainBox.labelSets };
            } catch (err) {
              return { rejected: true, labelSets: BrainBox.labelSets };
            }
          });
          assert.isTrue(result.rejected, 'a failed request must reject the promise');
          assert.deepEqual(result.labelSets, ['previous']);
        } finally {
          await page.close();
        }
      }).timeout(U.longTimeout);
    }
  });

  describe('BrainBox.widget()', function () {
    it('loads label sets, then the brain\'s info with download=true, and shows the brain', async function () {
      const { page, requests } = await openHost(browser);
      try {
        const result = await page.evaluate(async (url) => {
          const value = await window.startWidget({ url, view: 'cor', slice: 120 });
          const link = document.querySelector('#atlasmaker a[href*="/mri?url="]');

          return {
            resolvedWith: typeof value,
            labelSets: BrainBox.labelSets,
            source: BrainBox.info && BrainBox.info.source,
            link: link ? link.getAttribute('href') : null,
            hostname: BrainBox.hostname,
            view: AtlasMakerWidget.User.view
          };
        }, U.localBertURL);

        assert.strictEqual(result.resolvedWith, 'object', 'widget() resolves with what configureBrainBox resolves');
        assert.deepEqual(result.labelSets, serverLabelSets);
        assert.strictEqual(result.source, U.localBertURL);
        // The link points at the configured host (cfg.json), whichever name that uses for our server
        assert.isTrue(U.isLocalURL(result.hostname), `unexpected hostname ${result.hostname}`);
        assert.strictEqual(result.link, `${result.hostname}/mri?url=${U.localBertURL}`);
        assert.strictEqual(result.view, 'cor');

        assertWidgetRequests(requests);

        await page.waitForFunction(() => window.AtlasMakerWidget.brainImg && window.AtlasMakerWidget.brainImg.img, { timeout: U.longTimeout });
      } finally {
        await page.close();
      }
    }).timeout(U.longTimeout * 2);

    it('logs a failed /mri/json request and resolves undefined, without adding the link', async function () {
      const { page, consoleErrors } = await openHost(browser, (url) => (url.includes('/mri/json')
        ? { status: 500, contentType: 'application/json', body: '{}' }
        : null));
      try {
        const result = await page.evaluate(async (url) => {
          const value = await window.startWidget({ url, view: 'cor' });

          return {
            resolvedWith: typeof value,
            link: Boolean(document.querySelector('#atlasmaker a[href*="/mri?url="]'))
          };
        }, U.localBertURL);
        assert.strictEqual(result.resolvedWith, 'undefined');
        assert.isFalse(result.link);
        assert.isAbove(consoleErrors.length, 0, 'the failure should be logged');
      } finally {
        await page.close();
      }
    }).timeout(U.longTimeout);
  });
});
