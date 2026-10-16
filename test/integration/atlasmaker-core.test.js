/* eslint-disable max-lines */
/* global AtlasMakerWidget */
'use strict';

/*
  Browser tests for view/atlasmaker/src/atlasmaker.js, the viewer's entry point:
  what initAtlasMaker() wires up (login check, window resize, keyboard, chat input,
  minimised toolbar, WebSocket connection) and how _requestMRIInfo() polls the server
  for a brain - including its error paths and the manual-upload fallback panel shown
  when the server cannot download a file itself. Server answers for those paths are
  simulated with request interception, for a made-up brain URL.
*/

const path = require('path');
const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');

const FAKE_SOURCE = 'http://example.org/some_brain.nii.gz';
const UPLOAD_FILE = path.join(__dirname, '../../public/test_data/foo.png');

/**
 * Open the MRI page for the test brain. `respond(req)` may answer a local request
 * itself ({ status, contentType, body }), return 'hold' to keep it pending (it is
 * then pushed to `held`), 'handled' if it already dealt with the request, or null
 * to let it through. Requests outside our
 * server are aborted.
 * @param {Object} browser A puppeteer browser
 * @param {Function} [respond] req => canned response, 'hold', or null
 * @returns {Promise<Object>} { page, requests, held, pageErrors }
 */
const openViewer = async (browser, respond = () => null) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900 });
  const requests = [];
  const held = [];
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => { if ((/Unhandled|Uncaught/).test(msg.text())) { pageErrors.push(msg.text()); } });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (!U.isLocalURL(req.url())) {
      req.abort();

      return;
    }
    requests.push({ method: req.method(), url: req.url(), headers: req.headers(), postData: req.postData() });
    const answer = respond(req);
    if (answer === 'handled') { return; }
    if (answer === 'hold') { held.push(req); } else if (answer) { req.respond(answer); } else { req.continue(); }
  });
  await page.goto(`${U.serverURL}/mri?url=${U.localBertURL}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.AtlasMakerWidget && AtlasMakerWidget.brainImg && AtlasMakerWidget.brainImg.img && AtlasMakerWidget.flagConnected === 1,
    { timeout: U.longTimeout }
  );

  return { page, requests, held, pageErrors };
};

const isMRIInfoPost = (req) => req.method() === 'POST' && req.url().includes('/mri/json') && (req.postData() || '').includes(encodeURIComponent(FAKE_SOURCE));
// Like every answer of the real server (app.js): with CI's cfg.json the page (127.0.0.1) calls
// the server as localhost, a different origin, and the browser drops answers without it
const CORS = { 'Access-Control-Allow-Origin': '*' };
const json = (status, body) => ({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) });
const text = (status, contentType, body) => ({ status, headers: CORS, contentType, body });

// How _requestMRIInfo() fails for each kind of server answer
const FAILURES = [
  { name: 'the server reports a failure', answer: json(200, { success: false, error: 'nope' }), message: 'requestMRIInfo: nope' },
  { name: 'the server answers with an error', answer: json(500, { error: 'boom' }), message: 'boom' },
  { name: 'the error is not JSON', answer: text(502, 'text/html', '<h1>Bad gateway</h1>'), message: 'Download failed (HTTP 502)' },
  { name: 'a success is not valid JSON', answer: text(200, 'application/json', '{oops'), message: 'Download failed (HTTP 200)' }
];

// What the server answers once a queued download has failed because the remote server refused it
const DOWNLOAD_REQUIRED = json(403, { success: false, error: 'blocked', clientDownloadRequired: true });

/**
 * Ask the viewer for the made-up brain, and settle with what _requestMRIInfo() gives.
 * Not awaited inside the page, so that the test can interact with the page meanwhile.
 * @param {Object} page A puppeteer page
 * @returns {Promise<void>} Resolves once the request has been started
 */
const startRequest = (page) => page.evaluate((source) => {
  window.__mriInfo = AtlasMakerWidget._requestMRIInfo(source)
    .then((info) => ({ resolved: info }), (err) => ({ rejected: err.message }));
}, FAKE_SOURCE);
const requestOutcome = (page) => page.evaluate(() => window.__mriInfo);

describe('TESTING THE VIEWER CORE (atlasmaker.js)', function () {
  let browser;
  let viewer;

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    browser = await puppeteer.launch({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  });

  afterEach(async function () {
    if (viewer && viewer.page) { await viewer.page.close(); }
    viewer = null;
  });

  after(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    if (browser) { await browser.close(); }
    const res = await chai.request(U.serverURL).get('/mri/json')
      .query({ url: U.localBertURL });
    if (res.body && res.body.url) {
      await U.removeMRI({ dirPath: './public' + res.body.url, srcURL: U.localBertURL });
    }
  });

  describe('initAtlasMaker()', function () {
    it('combines all the viewer\'s components into one object', async function () {
      viewer = await openViewer(browser);
      const types = await viewer.page.evaluate(() => ['drawImages', 'keyDown', 'loadScript', 'showxy', 'slider', 'initSocketConnection', 'changeToolbarDisplay']
        .map((name) => typeof AtlasMakerWidget[name]));
      assert.deepEqual(types, Array(7).fill('function'));
    }).timeout(U.longTimeout);

    it('asks the server who is logged in, and calls a visitor Anonymous', async function () {
      viewer = await openViewer(browser);
      await viewer.page.waitForFunction(() => AtlasMakerWidget.User.username, { timeout: U.shortTimeout });
      assert.strictEqual(await viewer.page.evaluate(() => AtlasMakerWidget.User.username), 'Anonymous');
      assert.isTrue(viewer.requests.some((r) => r.method === 'GET' && r.url.endsWith('/loggedIn')));
    }).timeout(U.longTimeout);

    it('still loads, without errors, when the login check fails', async function () {
      viewer = await openViewer(browser, (req) => (req.url().endsWith('/loggedIn') ? json(500, { error: 'down' }) : null));
      await U.delay(500);
      assert.isUndefined(await viewer.page.evaluate(() => AtlasMakerWidget.User.username), 'nothing is assumed about the user');
      assert.deepEqual(viewer.pageErrors, []);
    }).timeout(U.longTimeout);

    it('connects to the WebSocket server and says so in the chat header', async function () {
      viewer = await openViewer(browser);
      const label = await viewer.page.$eval('#notifications', (el) => el.textContent);
      assert.match(label, /^Chat \(\d+ connected\)$/);
    }).timeout(U.longTimeout);

    it('redraws when the window is resized', async function () {
      viewer = await openViewer(browser);
      await viewer.page.evaluate(() => {
        window.__calls = [];
        const { resizeWindow, drawImages } = AtlasMakerWidget;
        AtlasMakerWidget.resizeWindow = function (...args) {
          window.__calls.push('resizeWindow');

          return resizeWindow.apply(this, args);
        };
        AtlasMakerWidget.drawImages = function (...args) {
          window.__calls.push('drawImages');

          return drawImages.apply(this, args);
        };
      });
      await viewer.page.setViewport({ width: 1000, height: 800 });
      // Other code may also redraw; what matters is a redraw after the resize
      await viewer.page.waitForFunction(() => {
        const i = window.__calls.indexOf('resizeWindow');

        return i >= 0 && window.__calls.indexOf('drawImages', i) > i;
      }, { timeout: U.shortTimeout });
    }).timeout(U.longTimeout);

    it('changes slice with the arrow keys', async function () {
      viewer = await openViewer(browser);
      const { page } = viewer;
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      const before = await page.evaluate(() => AtlasMakerWidget.User.slice);
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction((s) => AtlasMakerWidget.User.slice === s + 2, { timeout: U.shortTimeout }, before);
      await page.keyboard.press('ArrowLeft');
      await page.waitForFunction((s) => AtlasMakerWidget.User.slice === s + 1, { timeout: U.shortTimeout }, before);
    }).timeout(U.longTimeout);

    it('sends a chat message when Enter is pressed in the chat input', async function () {
      viewer = await openViewer(browser);
      const { page } = viewer;
      await page.evaluate(() => {
        window.__sent = 0;
        AtlasMakerWidget.sendChatMessage = () => { window.__sent += 1; };
      });
      await page.focus('#msg');
      await page.keyboard.type('hello');
      assert.strictEqual(await page.evaluate(() => window.__sent), 0, 'typing alone sends nothing');
      await page.keyboard.press('Enter');
      assert.strictEqual(await page.evaluate(() => window.__sent), 1);
    }).timeout(U.longTimeout);

    it('starts with the toolbar maximised, and can minimise and restore it', async function () {
      viewer = await openViewer(browser);
      const { page } = viewer;
      const displays = () => page.evaluate(() => ['tools-minimized', 'tools-maximized']
        .map((id) => getComputedStyle(document.getElementById(id)).display));
      let [minimized, maximized] = await displays();
      assert.strictEqual(minimized, 'none');
      assert.notStrictEqual(maximized, 'none');

      await page.evaluate(() => AtlasMakerWidget.changeToolbarDisplay('minimize'));
      [minimized, maximized] = await displays();
      assert.strictEqual(minimized, 'block', 'the minimised toolbar shows as the div it is');
      assert.strictEqual(maximized, 'none');

      await page.evaluate(() => AtlasMakerWidget.changeToolbarDisplay('maximize'));
      [minimized, maximized] = await displays();
      assert.strictEqual(minimized, 'none');
      assert.notStrictEqual(maximized, 'none');
    }).timeout(U.longTimeout);
  });

  describe('_requestMRIInfo()', function () {
    it('posts the brain\'s URL as a form, and shows download progress until it is ready', async function () {
      let polls = 0;
      viewer = await openViewer(browser, (req) => {
        if (!isMRIInfoPost(req)) { return null; }
        polls += 1;

        return polls === 1
          ? json(200, { success: 'downloading', cur: 50, len: 100 })
          : json(200, { success: true, source: FAKE_SOURCE, url: '/data/fake/' });
      });
      const { page, requests } = viewer;
      await startRequest(page);
      await page.waitForFunction(() => (/Downloading brain… 50%/).test(document.querySelector('#loadingIndicator p').textContent), { timeout: U.shortTimeout });
      const outcome = await requestOutcome(page);
      assert.deepEqual(outcome, { resolved: { success: true, source: FAKE_SOURCE, url: '/data/fake/' } });
      assert.strictEqual(polls, 2, 'polls until the server has it');

      const post = requests.find((r) => r.method === 'POST' && r.url.endsWith('/mri/json') && (r.postData || '').includes('some_brain'));
      assert.include(post.headers['content-type'], 'application/x-www-form-urlencoded');
      assert.strictEqual(new URLSearchParams(post.postData).get('url'), FAKE_SOURCE);
    }).timeout(U.longTimeout);

    it('asks the server right away, without waiting for the first polling interval', async function () {
      let firstPost = null;
      viewer = await openViewer(browser, (req) => {
        if (!isMRIInfoPost(req)) { return null; }
        if (firstPost === null) { firstPost = Date.now(); }

        return json(200, { success: true, source: FAKE_SOURCE, url: '/data/fake/' });
      });
      const start = Date.now();
      await startRequest(viewer.page);
      assert.deepEqual(await requestOutcome(viewer.page), { resolved: { success: true, source: FAKE_SOURCE, url: '/data/fake/' } });
      assert.isBelow(firstPost - start, 1000, 'the first poll is sent at once');
    }).timeout(U.longTimeout);

    it('drops a request superseded by a newer one, even when its answer arrives afterwards', async function () {
      viewer = await openViewer(browser, (req) => (isMRIInfoPost(req)
        ? json(200, { success: true, source: FAKE_SOURCE, url: '/data/fake/' })
        : null));
      const outcomes = await viewer.page.evaluate((source) => {
        const settle = (pr) => pr.then((info) => ({ resolved: info.url }), (err) => ({ rejected: err.message }));
        const first = settle(AtlasMakerWidget._requestMRIInfo(source));
        const second = settle(AtlasMakerWidget._requestMRIInfo(source));

        return Promise.all([first, second]);
      }, FAKE_SOURCE);
      assert.deepEqual(outcomes, [{ rejected: 'source changed' }, { resolved: '/data/fake/' }]);
    }).timeout(U.longTimeout);

    for (const { name, answer, message } of FAILURES) {
      // `browser` is set by the before() hook; it is read when the test runs, not when the loop runs
      // eslint-disable-next-line no-loop-func
      it(`rejects when ${name}`, async function () {
        viewer = await openViewer(browser, (req) => (isMRIInfoPost(req) ? answer : null));
        await startRequest(viewer.page);
        assert.deepEqual(await requestOutcome(viewer.page), { rejected: message });
        assert.isNull(await viewer.page.$('#manual-upload-panel'));
      }).timeout(U.longTimeout);
    }

    it('rejects with HTTP 0 when the request does not reach the server', async function () {
      viewer = await openViewer(browser, (req) => {
        if (isMRIInfoPost(req)) {
          req.abort('connectionrefused');

          return 'handled';
        }

        return null;
      });
      await startRequest(viewer.page);
      assert.deepEqual(await requestOutcome(viewer.page), { rejected: 'Download failed (HTTP 0)' });
    }).timeout(U.longTimeout);

    it('rejects, and stops polling, when the server\'s answer cannot be read', async function () {
      viewer = await openViewer(browser);
      const { page } = viewer;
      const outcome = await page.evaluate(async (source) => {
        // The connection drops while the answer is read
        const realFetch = window.fetch;
        window.fetch = (url, options) => (String(url).endsWith('/mri/json')
          ? Promise.resolve({ ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }), text: () => Promise.reject(new TypeError('network error')) })
          : realFetch(url, options));
        // Which of the polling timers are still running
        const running = new Set();
        const { setInterval: realSetInterval, clearInterval: realClearInterval } = window;
        window.setInterval = (...args) => {
          const id = realSetInterval(...args);
          if (args[1] === 2000) { running.add(id); } // the polling's period

          return id;
        };
        window.clearInterval = (id) => {
          running.delete(id);
          realClearInterval(id);
        };
        // Pending forever counts as a failure, without waiting for the test's timeout
        const pending = new Promise((resolve) => { setTimeout(() => resolve({ pending: true }), 3000); });
        const settled = AtlasMakerWidget._requestMRIInfo(source)
          .then((info) => ({ resolved: info }), (err) => ({ rejected: err.message }));
        const result = await Promise.race([settled, pending]);

        return { ...result, runningTimers: running.size };
      }, FAKE_SOURCE);
      assert.deepEqual(outcome, { rejected: 'requestMRIInfo: network error', runningTimers: 0 });
      assert.deepEqual(viewer.pageErrors, []);
    }).timeout(U.longTimeout);
  });

  describe('the manual upload fallback', function () {

    /**
     * Open a viewer whose server cannot download the made-up brain, ask for it, and wait for the panel.
     * @param {Function} [onUpload] req => answer for the upload request ('hold' to keep it pending)
     * @returns {Promise<Object>} The viewer
     */
    const openWithPanel = async (onUpload = () => null) => {
      const v = await openViewer(browser, (req) => {
        if (isMRIInfoPost(req)) { return DOWNLOAD_REQUIRED; }
        if (req.url().endsWith('/mri/upload-from-url')) { return onUpload(req); }

        return null;
      });
      await startRequest(v.page);
      await v.page.waitForSelector('#manual-upload-panel', { timeout: U.mediumTimeout });

      return v;
    };

    const panelState = (page) => page.evaluate(() => ({
      panels: document.querySelectorAll('#manual-upload-panel').length,
      inBody: Boolean(document.querySelector('body > #manual-upload-panel')),
      link: document.querySelector('#manual-upload-panel a') && document.querySelector('#manual-upload-panel a').getAttribute('href'),
      linkText: document.querySelector('#manual-upload-panel a') && document.querySelector('#manual-upload-panel a').textContent,
      status: document.getElementById('manual-upload-status') && document.getElementById('manual-upload-status').textContent,
      inputDisabled: document.getElementById('manual-mri-upload') && document.getElementById('manual-mri-upload').disabled,
      cancelDisabled: document.getElementById('manual-upload-cancel') && document.getElementById('manual-upload-cancel').disabled
    }));

    it('offers a link to the file and an upload input, and Cancel rejects the request', async function () {
      viewer = await openWithPanel();
      const state = await panelState(viewer.page);
      assert.deepEqual(state, {
        panels: 1, inBody: true, link: FAKE_SOURCE, linkText: 'Download some_brain.nii.gz', status: '', inputDisabled: false, cancelDisabled: false
      });
      await viewer.page.click('#manual-upload-cancel');
      assert.deepEqual(await requestOutcome(viewer.page), { rejected: 'Upload cancelled by user' });
      assert.strictEqual((await panelState(viewer.page)).panels, 0);
    }).timeout(U.longTimeout);

    it('uploads the chosen file, locks the panel meanwhile, and resolves with the server\'s answer', async function () {
      viewer = await openWithPanel(() => 'hold');
      const input = await viewer.page.$('#manual-mri-upload');
      await input.uploadFile(UPLOAD_FILE);
      await viewer.page.waitForFunction(() => document.getElementById('manual-mri-upload').disabled, { timeout: U.shortTimeout });
      const during = await panelState(viewer.page);
      assert.strictEqual(during.status, 'Uploading to server...');
      assert.isTrue(during.cancelDisabled);

      const [upload] = viewer.held;
      assert.strictEqual(upload.method(), 'POST');
      assert.include(upload.headers()['content-type'], 'multipart/form-data');
      await upload.respond(json(200, { success: true, source: FAKE_SOURCE, uploaded: true }));
      assert.deepEqual(await requestOutcome(viewer.page), { resolved: { success: true, source: FAKE_SOURCE, uploaded: true } });
      assert.strictEqual((await panelState(viewer.page)).panels, 0);
    }).timeout(U.longTimeout);

    it('shows the server\'s error and lets the user try again', async function () {
      viewer = await openWithPanel(() => json(400, { error: 'not a NIfTI file' }));
      const input = await viewer.page.$('#manual-mri-upload');
      await input.uploadFile(UPLOAD_FILE);
      await viewer.page.waitForFunction(() => document.getElementById('manual-upload-status').textContent.startsWith('Error'), { timeout: U.shortTimeout });
      const state = await panelState(viewer.page);
      assert.strictEqual(state.status, 'Error: not a NIfTI file');
      assert.isFalse(state.inputDisabled);
      assert.isFalse(state.cancelDisabled);
      await viewer.page.click('#manual-upload-cancel');
      assert.deepEqual(await requestOutcome(viewer.page), { rejected: 'Upload cancelled by user' });
    }).timeout(U.longTimeout);

    it('says "Upload failed" when the error has no message', async function () {
      viewer = await openWithPanel(() => text(500, 'text/html', 'oops'));
      const input = await viewer.page.$('#manual-mri-upload');
      await input.uploadFile(UPLOAD_FILE);
      await viewer.page.waitForFunction(() => document.getElementById('manual-upload-status').textContent.startsWith('Error'), { timeout: U.shortTimeout });
      assert.strictEqual((await panelState(viewer.page)).status, 'Error: Upload failed');
    }).timeout(U.longTimeout);
  });
});
