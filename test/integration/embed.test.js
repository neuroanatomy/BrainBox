/* eslint-disable max-lines, max-statements */
'use strict';

const fs = require('fs');
const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const puppeteer = require('puppeteer');
const WebSocket = require('ws');
const U = require('../utils.js');
const Config = JSON.parse(fs.readFileSync('./cfg.json'));

const wshost = (Config.secure ? 'wss://' : 'ws://') + 'localhost:8080';
const embedURL = (query) => U.serverURL + '/mri/embed?url=' + encodeURIComponent(U.localBertURL) + (query || '');
const hostURL = (query) => U.serverURL + '/test_data/embed-host.html?url=' + encodeURIComponent(U.localBertURL) + (query || '');

const PRIVATE_SOURCE = 'https://example.com/embed-integration-private.nii.gz';
const PRIVATE_PROJECT = 'embedintegrationprivate';

const PLANES = [
  { label: 'Sag', view: 'sag' },
  { label: 'Cor', view: 'cor' },
  { label: 'Axi', view: 'axi' }
];
// Every ordered pair: the failure this guards against was direction-dependent,
// so "cor -> sag" passing tells you nothing about "sag -> cor".
const PLANE_PAIRS = PLANES.flatMap((from) => PLANES.filter((to) => to.view !== from.view).map((to) => [from, to]));
// Two boxes: one roughly the shape a host would pick, one deliberately too
// short for the image, which is where the old layout put the toolbar off-screen.
const HOST_BOX_SIZES = [{ width: 512, height: 670 }, { width: 512, height: 300 }];

/**
 * Everything outside our own server is unreachable from a sandboxed test run,
 * and a hanging request for a Google font or a CDN script will time out
 * page.goto() long before the page is ready. Fail those fast instead.
 * @param {Object} page A puppeteer page
 * @returns {Promise} Resolves once interception is set up
 */
const blockExternalRequests = async (page) => {
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    const isLocal = url.startsWith(U.serverURL) || url.includes('127.0.0.1:3001') || url.includes('localhost:3001') || url.startsWith('data:');
    if (isLocal) { req.continue(); } else { req.abort(); }
  });
};

/**
 * Read geometry and viewer state from inside a frame.
 *
 * getBoundingClientRect() returns a DOMRect, which has no own enumerable
 * properties and therefore serialises to {} on its way back from the browser -
 * every measurement silently becomes undefined. Copy the fields by hand.
 * @param {Object} ctx A puppeteer page or frame
 * @returns {Promise<Object>} The viewer's current geometry and state
 */
const readViewer = (ctx) => ctx.evaluate(() => {
  const rect = (selector) => {
    const el = document.querySelector(selector);
    if (!el) { return null; }
    const box = el.getBoundingClientRect();

    return { width: box.width, height: box.height, top: box.top, bottom: box.bottom };
  };
  const widget = window.AtlasMakerWidget;
  const container = document.querySelector('#atlasmaker');
  const indicator = document.querySelector('#loadingIndicator');
  const pressed = document.querySelector('#plane .pressed');

  return {
    canvas: rect('#canvas'),
    tools: rect('#tools-side'),
    viewerArea: rect('#viewer-area'),
    innerHeight: window.innerHeight,
    state: container ? container.getAttribute('data-state') : null,
    mode: container ? container.getAttribute('data-mode') : null,
    loadingVisible: indicator ? window.getComputedStyle(indicator).display !== 'none' : null,
    pressedPlane: pressed ? pressed.getAttribute('title') : null,
    view: widget && widget.User ? widget.User.view : null,
    imageView: widget && widget.brainImg ? widget.brainImg.view : null,
    slice: widget && widget.User ? widget.User.slice : null,
    editMode: widget ? widget.editMode : null,
    hasRender3DFrame: Boolean(document.querySelector('#render3d-frame')),
    paintControls: document.querySelectorAll('#paintTool, #link, #save, #undo').length
  };
});

const clickPlane = (ctx, label) => ctx.evaluate((name) => {
  const button = [...document.querySelectorAll('#plane .a')].find((el) => el.textContent.trim() === name);
  if (!button) { return false; }
  button.click();

  return true;
}, label);

const waitForSlice = (ctx) => ctx.waitForFunction(
  () => window.AtlasMakerWidget && window.AtlasMakerWidget.brainImg && window.AtlasMakerWidget.brainImg.img,
  { timeout: U.longTimeout }
);

describe('TESTING THE EMBEDDABLE VIEWER', function () {
  let browser;
  let nativeDb;

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    nativeDb = U.getNativeDB();
    browser = await puppeteer.launch({
      headless: true,
      ignoreHTTPSErrors: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    // Make the test brain available. It is listed in U.projectTest, which
    // grants 'anyone' file view access, so the embed is publicly viewable.
    let ready = false;
    for (let i = 0; i < 10 && !ready; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await chai.request(U.serverURL).post('/mri/json')
        .send({ url: U.localBertURL, token: U.testToken + U.userFoo.nickname });
      ready = res.body && res.body.success === true;
      // eslint-disable-next-line no-await-in-loop
      if (!ready) { await U.delay(U.shortTimeout); }
    }
    assert.isTrue(ready, 'the test brain could not be prepared');

    // A brain nobody may see, for the access-control cases.
    await nativeDb.collection('project').insertOne({
      name: 'Embed Integration Private Project',
      shortname: PRIVATE_PROJECT,
      owner: 'foo',
      collaborators: {
        list: [
          {
            userID: 'anyone',
            username: 'anyone',
            nickname: 'anyone',
            access: { collaborators: 'none', annotations: 'none', files: 'none' }
          }
        ]
      },
      files: { list: [] },
      annotations: { list: [] }
    });
    await nativeDb.collection('mri').insertOne({
      source: PRIVATE_SOURCE,
      name: 'Private Integration Brain',
      url: '/data/embedintegrationprivate/',
      mri: { atlas: [{ name: 'Default', project: PRIVATE_PROJECT, filename: 'Atlas.nii.gz', labels: 'foreground.json' }] }
    });
  });

  after(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    if (browser) { await browser.close(); }
    await nativeDb.collection('project').deleteMany({ shortname: PRIVATE_PROJECT });
    await nativeDb.collection('mri').deleteMany({ source: PRIVATE_SOURCE });
    await nativeDb.collection('embedWsTicket').deleteMany({ mriSource: { $in: [PRIVATE_SOURCE, U.localBertURL] } });

    const res = await chai.request(U.serverURL).get('/mri/json')
      .query({ url: U.localBertURL });
    if (res.body && res.body.url) {
      await U.removeMRI({ dirPath: './public' + res.body.url, srcURL: U.localBertURL });
    }
  });

  describe('E1: the embed renders a brain', function () {
    let page;
    const errors = [];

    before(async function () {
      // eslint-disable-next-line no-invalid-this
      this.timeout(U.longTimeout);
      page = await browser.newPage();
      await page.setViewport({ width: 512, height: 670 });
      await blockExternalRequests(page);
      page.on('pageerror', (err) => errors.push(err.message.split('\n')[0]));
      await page.goto(embedURL('&view=cor'), { waitUntil: 'domcontentloaded' });
      await waitForSlice(page);
    });

    after(async function () {
      if (page) { await page.close(); }
    });

    it('draws a slice, with no page errors', async function () {
      const viewer = await readViewer(page);
      assert.isAbove(viewer.canvas.width, 0);
      assert.isAbove(viewer.canvas.height, 0);
      assert.strictEqual(viewer.state, 'ready');
      assert.deepStrictEqual(errors, []);
    }).timeout(U.mediumTimeout);
  });

  describe('E2: loading and error states', function () {
    it('shows a loading overlay, then hides it once a slice is drawn', async function () {
      const page = await browser.newPage();
      await page.setViewport({ width: 512, height: 670 });
      await blockExternalRequests(page);
      try {
        await page.goto(embedURL(), { waitUntil: 'domcontentloaded' });
        const loading = await readViewer(page);
        assert.strictEqual(loading.state, 'loading');
        assert.isTrue(loading.loadingVisible, 'the viewer should say it is loading');

        await waitForSlice(page);
        await U.delay(1000);
        const ready = await readViewer(page);
        assert.strictEqual(ready.state, 'ready');
        assert.isFalse(ready.loadingVisible, 'the overlay should go away once there is something to see');
      } finally {
        await page.close();
      }
    }).timeout(U.longTimeout);

    it('shows a chromeless message when the brain does not exist', async function () {
      const res = await chai.request(U.serverURL).get('/mri/embed')
        .query({ url: 'https://example.com/no-such-brain-at-all.nii.gz' });
      assert.strictEqual(res.statusCode, 404);
      // The full `error` template pulls in the whole site header, menu and
      // login - unusable inside a 512px iframe on someone else's page.
      assert.notInclude(res.text, 'id="menu"');
      assert.include(res.text, 'could not be found');
    }).timeout(U.mediumTimeout);

    it('honours the requested plane from the first paint, before loading finishes', async function () {
      const page = await browser.newPage();
      await page.setViewport({ width: 512, height: 670 });
      await blockExternalRequests(page);
      try {
        await page.goto(embedURL('&view=axi'), { waitUntil: 'domcontentloaded' });
        const loading = await readViewer(page);
        assert.strictEqual(loading.pressedPlane, 'axi', 'the toolbar must not claim a plane the viewer is not showing');
      } finally {
        await page.close();
      }
    }).timeout(U.longTimeout);
  });

  describe('E3: plane switching', function () {
    let page;

    before(async function () {
      // eslint-disable-next-line no-invalid-this
      this.timeout(U.longTimeout);
      page = await browser.newPage();
      await page.setViewport({ width: 512, height: 670 });
      await blockExternalRequests(page);
      await page.goto(embedURL('&view=cor'), { waitUntil: 'domcontentloaded' });
      await waitForSlice(page);
      await U.delay(1000);
    });

    after(async function () {
      if (page) { await page.close(); }
    });

    // Parameterised cases: one test per combination, so a failure names the
    // exact transition or box size that broke.
    // eslint-disable-next-line mocha/no-setup-in-describe
    PLANE_PAIRS.forEach(([from, to]) => {
      it(`updates the image and the toolbar going ${from.view} -> ${to.view}`, async function () {
        assert.isTrue(await clickPlane(page, from.label));
        await page.waitForFunction((v) => window.AtlasMakerWidget.brainImg.view === v, { timeout: U.mediumTimeout }, from.view);
        assert.isTrue(await clickPlane(page, to.label));
        await page.waitForFunction((v) => window.AtlasMakerWidget.brainImg.view === v, { timeout: U.mediumTimeout }, to.view);

        const viewer = await readViewer(page);
        assert.strictEqual(viewer.view, to.view);
        assert.strictEqual(viewer.imageView, to.view);
        assert.strictEqual(viewer.pressedPlane, to.view);
      }).timeout(U.longTimeout);
    });
  });

  describe('E4: interacting before the brain has loaded', function () {
    it('ignores a plane click during loading, and works normally afterwards', async function () {
      const page = await browser.newPage();
      const errors = [];
      await page.setViewport({ width: 512, height: 670 });
      await blockExternalRequests(page);
      page.on('pageerror', (err) => errors.push(err.message.split('\n')[0]));
      try {
        await page.goto(embedURL('&view=cor'), { waitUntil: 'domcontentloaded' });
        await clickPlane(page, 'Axi');
        await U.delay(500);

        const during = await readViewer(page);
        assert.deepStrictEqual(errors, [], 'clicking while loading must not throw');
        assert.strictEqual(during.view, 'cor', 'the click should be inert, not half-applied');

        await waitForSlice(page);
        await U.delay(1000);
        assert.isTrue(await clickPlane(page, 'Sag'));
        await page.waitForFunction(() => window.AtlasMakerWidget.brainImg.view === 'sag', { timeout: U.mediumTimeout });
        assert.deepStrictEqual(errors, []);
      } finally {
        await page.close();
      }
    }).timeout(U.longTimeout);
  });

  describe('E5/E7: the viewer fits whatever box the host gives it', function () {
    // E7 is the same assertion with no host listener at all: embed-host.html
    // resizes the iframe, but here we load the embed directly, so nothing is
    // adjusting anything. The layout has to stand on its own.
    // Parameterised cases: one test per combination, so a failure names the
    // exact transition or box size that broke.
    // eslint-disable-next-line mocha/no-setup-in-describe
    HOST_BOX_SIZES.forEach((size) => {
      it(`keeps the toolbar reachable and the image inside the box at ${size.width}x${size.height}`, async function () {
        const page = await browser.newPage();
        await page.setViewport(size);
        await blockExternalRequests(page);
        try {
          await page.goto(embedURL('&view=cor'), { waitUntil: 'domcontentloaded' });
          await waitForSlice(page);
          await U.delay(1000);

          for (const label of ['Sag', 'Cor', 'Axi']) {
            // eslint-disable-next-line no-await-in-loop
            await clickPlane(page, label);
            // eslint-disable-next-line no-await-in-loop
            await U.delay(1500);
            // eslint-disable-next-line no-await-in-loop
            const viewer = await readViewer(page);
            assert.isAtMost(Math.round(viewer.tools.bottom), viewer.innerHeight + 1,
              `the ${label} toolbar must be inside the visible box`);
            assert.isAbove(viewer.canvas.height, 0, `the ${label} image must still be visible`);
            assert.isAtMost(Math.round(viewer.canvas.height), Math.round(viewer.viewerArea.height) + 1,
              `the ${label} image must not overflow its area`);
          }
        } finally {
          await page.close();
        }
      }).timeout(U.longTimeout);
    });
  });

  describe('E6: the host page is told what height to use', function () {
    // Note the test brain (bert) is 256^3 isotropic, so all three planes have
    // the same aspect ratio and therefore the same ideal height. Asserting
    // "sagittal is shorter than coronal" would only pass by accident of the
    // fixture; what matters, and what is checked here, is that the height the
    // host applies is the one the geometry implies, and that it can come *down*
    // as well as up - the original bug being that it could only ever grow.
    it('applies the height the current plane actually needs, and can shrink back to it', async function () {
      const page = await browser.newPage();
      await page.setViewport({ width: 900, height: 900 });
      await blockExternalRequests(page);
      try {
        await page.goto(hostURL(), { waitUntil: 'domcontentloaded' });

        let frame = null;
        for (let i = 0; i < 40 && !frame; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          await U.delay(250);
          frame = page.frames().find((f) => f.url().includes('/mri/embed'));
        }
        assert.isNotNull(frame, 'the host page never embedded the viewer');
        await waitForSlice(frame);
        await U.delay(1500);

        const iframeHeight = () => page.evaluate(() => Math.round(document.getElementById('brainbox-embed').getBoundingClientRect().height));
        const expectedHeight = () => frame.evaluate(() => {
          const widget = window.AtlasMakerWidget;
          const toolbar = document.getElementById('tools-side');
          const aspect = (widget.brainW * widget.brainWdim) / (widget.brainH * widget.brainHdim);

          return Math.round(document.documentElement.clientWidth / aspect) + toolbar.offsetHeight;
        });

        const heights = {};
        for (const label of ['Cor', 'Sag', 'Axi']) {
          // eslint-disable-next-line no-await-in-loop
          await clickPlane(frame, label);
          // eslint-disable-next-line no-await-in-loop
          await U.delay(1800);
          // eslint-disable-next-line no-await-in-loop
          heights[label] = { applied: await iframeHeight(), expected: await expectedHeight() };
        }
        for (const label of Object.keys(heights)) {
          assert.closeTo(heights[label].applied, heights[label].expected, 2,
            `the ${label} plane should be given the height its aspect ratio implies`);
        }

        // Force the box far too tall from the host side: the embed must pull it
        // back down. This is the direction the old implementation could never
        // manage, since it reported document.body.scrollHeight - a number
        // clamped by the very box it was trying to change.
        const settled = await iframeHeight();
        await page.evaluate(() => { document.getElementById('brainbox-embed').style.height = '1400px'; });

        let corrected = null;
        for (let i = 0; i < 20; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          await U.delay(250);
          // eslint-disable-next-line no-await-in-loop
          corrected = await iframeHeight();
          if (Math.abs(corrected - settled) <= 2) { break; }
        }
        assert.closeTo(corrected, settled, 2, 'the embed must be able to shrink the box, not only grow it');
      } finally {
        await page.close();
      }
    }).timeout(U.longTimeout);
  });

  describe('E8: the embed is read-only', function () {
    it('leaves the visitor\'s pointer alone over the image', async function () {
      const page = await browser.newPage();
      await page.setViewport({ width: 512, height: 670 });
      await blockExternalRequests(page);
      try {
        await page.goto(embedURL(), { waitUntil: 'domcontentloaded' });
        await waitForSlice(page);
        await U.delay(500);

        // AtlasMaker hides the pointer over the canvas and draws a brush-sized
        // square instead. With nothing to paint, that just makes the pointer
        // disappear whenever it crosses the brain.
        const pointer = await page.evaluate(() => {
          const canvas = document.querySelector('#canvas');
          const brush = document.querySelector('#cursor');

          return {
            canvasCursor: window.getComputedStyle(canvas).cursor,
            brushVisible: brush ? window.getComputedStyle(brush).display !== 'none' : false
          };
        });

        assert.notStrictEqual(pointer.canvasCursor, 'none', 'the pointer must stay visible over the image');
        assert.isFalse(pointer.brushVisible, 'there is no brush to show in a read-only viewer');
      } finally {
        await page.close();
      }
    }).timeout(U.longTimeout);

    it('offers no editing controls and never claims edit rights', async function () {
      const page = await browser.newPage();
      await page.setViewport({ width: 512, height: 670 });
      await blockExternalRequests(page);
      try {
        await page.goto(embedURL(), { waitUntil: 'domcontentloaded' });
        await waitForSlice(page);
        const viewer = await readViewer(page);
        assert.strictEqual(viewer.paintControls, 0, 'the embed toolbar must expose no way to modify anything');
        assert.strictEqual(viewer.editMode, 0);
      } finally {
        await page.close();
      }
    }).timeout(U.longTimeout);

    it('mints a ticket the WebSocket server treats as an embed connection', function (done) {
      // Proves the whole chain over the real stack: the rendered page carries a
      // real ticket, and the socket opened with it is scoped to this one brain.
      // Asking for a different brain's atlas over that socket must be refused -
      // something the server only does for embed-tagged connections.
      // eslint-disable-next-line no-invalid-this
      this.timeout(U.longTimeout);

      chai.request(U.serverURL).get('/mri/embed')
        .query({ url: U.localBertURL })
        .then((res) => {
          const match = res.text.match(/var embedWsTicket = "([^"]+)"/);
          assert.isNotNull(match, 'the embed page must carry a WebSocket ticket');
          const [, ticket] = match;

          const socket = new WebSocket(wshost + '?embedTicket=' + ticket);
          let settled = false;
          const finish = (err) => {
            if (settled) { return; }
            settled = true;
            socket.close();
            done(err);
          };

          socket.on('open', () => {
            socket.send(JSON.stringify({
              type: 'userData',
              description: 'allUserData',
              user: {
                username: 'foo',
                editMode: 1, // a lie the server must not believe
                dirname: '/data/somewhere-else/',
                atlasFilename: 'Atlas.nii.gz',
                source: 'https://example.com/another-brain.nii.gz'
              }
            }));
            socket.send(JSON.stringify({ type: 'userData', description: 'sendAtlas' }));
            // No atlas should come back for a brain outside this ticket's scope.
            setTimeout(() => { finish(); }, U.shortTimeout);
          });

          socket.on('message', (data) => {
            if (Buffer.isBuffer(data)) {
              finish(new Error('an embed connection received atlas data for a brain outside its scope'));
            }
          });

          socket.on('error', (err) => { finish(err); });
        })
        .catch(done);
    });
  });

  describe('E9: access control', function () {
    it('refuses to embed a private brain', async function () {
      const res = await chai.request(U.serverURL).get('/mri/embed')
        .query({ url: PRIVATE_SOURCE });
      assert.strictEqual(res.statusCode, 403);
      assert.notInclude(res.text, 'id="menu"');
    }).timeout(U.mediumTimeout);

    it('refuses to render a private brain in 3D', async function () {
      const res = await chai.request(U.serverURL).get('/mri/render3d')
        .query({ url: PRIVATE_SOURCE });
      assert.strictEqual(res.statusCode, 403);
    }).timeout(U.mediumTimeout);

    it('declares itself framable', async function () {
      const res = await chai.request(U.serverURL).get('/mri/embed')
        .query({ url: U.localBertURL });
      assert.strictEqual(res.headers['content-security-policy'], 'frame-ancestors *');
    }).timeout(U.mediumTimeout);

    it('reflects only the parameters the viewer understands, escaped', async function () {
      const res = await chai.request(U.serverURL).get('/mri/embed')
        .query({
          url: U.localBertURL,
          view: 'cor',
          evil: '</script><img src=x onerror=alert(1)>'
        });
      const match = res.text.match(/var params = (.*);/);
      assert.isNotNull(match);
      const params = JSON.parse(match[1]);
      assert.notProperty(params, 'evil');
      assert.notInclude(res.text.toLowerCase(), '</script><img');
    }).timeout(U.mediumTimeout);
  });

  describe('E10: 3D rendering happens in place', function () {
    it('mounts the renderer in the viewer area instead of opening a tab', async function () {
      const page = await browser.newPage();
      await page.setViewport({ width: 700, height: 700 });
      await blockExternalRequests(page);

      // The nested render iframe and the mesher's blob-URL worker are targets
      // too, so only count real tabs/windows.
      const openedPages = [];
      const onTarget = (target) => { if (target.type() === 'page') { openedPages.push(target.url()); } };
      browser.on('targetcreated', onTarget);

      try {
        await page.goto(embedURL('&view=cor'), { waitUntil: 'domcontentloaded' });
        await waitForSlice(page);
        await U.delay(1000);
        const before = await readViewer(page);

        assert.isTrue(await clickPlane(page, '3D'));
        await page.waitForFunction(() => Boolean(document.querySelector('#render3d-frame')), { timeout: U.mediumTimeout });

        const during = await readViewer(page);
        assert.isTrue(during.hasRender3DFrame);
        assert.strictEqual(during.mode, '3d');
        assert.deepStrictEqual(openedPages, [], 'a 3D render must not send the visitor to another tab');
        assert.isAtMost(Math.round(during.tools.bottom), during.innerHeight + 1, 'the toolbar must stay usable in 3D');

        // Back to the plane it came from.
        await U.delay(500);
        assert.isTrue(await clickPlane(page, 'Cor'));
        await page.waitForFunction(() => !document.querySelector('#render3d-frame'), { timeout: U.mediumTimeout })
          .catch(() => { throw new Error('the 3D view could not be dismissed'); });
        const after = await readViewer(page);
        assert.isFalse(after.hasRender3DFrame);
        assert.strictEqual(after.view, before.view, 'the plane must survive the round trip');
        assert.strictEqual(after.slice, before.slice, 'the slice must survive the round trip');
      } finally {
        browser.off('targetcreated', onTarget);
        await page.close();
      }
    }).timeout(U.longTimeout);

    it('is one choice in the plane button set, so leaving is just picking a plane', async function () {
      const page = await browser.newPage();
      await page.setViewport({ width: 700, height: 700 });
      await blockExternalRequests(page);
      try {
        await page.goto(embedURL('&view=cor'), { waitUntil: 'domcontentloaded' });
        await waitForSlice(page);
        await U.delay(1000);

        // Sag/Cor/Axi/3D are mutually exclusive: exactly one is ever pressed.
        const pressedCount = await page.evaluate(() => document.querySelectorAll('#plane .pressed').length);
        assert.strictEqual(pressedCount, 1);

        assert.isTrue(await clickPlane(page, '3D'));
        await page.waitForFunction(() => Boolean(document.querySelector('#render3d-frame')), { timeout: U.mediumTimeout });
        let viewer = await readViewer(page);
        assert.strictEqual(viewer.pressedPlane, '3d', 'the set must show 3D as the current choice');

        assert.isTrue(await clickPlane(page, 'Sag'));
        await page.waitForFunction(() => !document.querySelector('#render3d-frame'), { timeout: U.mediumTimeout });
        viewer = await readViewer(page);
        assert.strictEqual(viewer.pressedPlane, 'sag');
        assert.strictEqual(viewer.view, 'sag', 'the chosen plane should also be applied');
      } finally {
        await page.close();
      }
    }).timeout(U.longTimeout);

    it('ignores a repeated click on the choice already showing', async function () {
      const page = await browser.newPage();
      await page.setViewport({ width: 700, height: 700 });
      await blockExternalRequests(page);
      try {
        await page.goto(embedURL('&view=cor'), { waitUntil: 'domcontentloaded' });
        await waitForSlice(page);
        await U.delay(1000);

        await clickPlane(page, '3D');
        await page.waitForFunction(() => Boolean(document.querySelector('#render3d-frame')), { timeout: U.mediumTimeout });
        const firstFrame = await page.evaluate(() => document.querySelector('#render3d-frame').src);

        // A radio choice, not a toggle: clicking 3D again must not tear the
        // view down and rebuild it.
        await U.delay(500);
        await clickPlane(page, '3D');
        await U.delay(1000);
        const viewer = await readViewer(page);
        assert.isTrue(viewer.hasRender3DFrame, 're-choosing 3D must not dismiss it');
        assert.strictEqual(await page.evaluate(() => document.querySelector('#render3d-frame').src), firstFrame,
          're-choosing 3D must not reload the renderer');
      } finally {
        await page.close();
      }
    }).timeout(U.longTimeout);
  });

  describe('E12: the toolbar keeps its proportions however wide the box is', function () {
    it('caps and centres the controls in a very wide box', async function () {
      const page = await browser.newPage();
      await page.setViewport({ width: 1600, height: 900 });
      await blockExternalRequests(page);
      try {
        await page.goto(embedURL('&view=cor'), { waitUntil: 'domcontentloaded' });
        await waitForSlice(page);
        await U.delay(1000);

        const toolbar = await page.evaluate(() => {
          const row = document.getElementById('tools-maximized');
          const box = row.getBoundingClientRect();

          return {
            width: Math.round(box.width),
            left: Math.round(box.left),
            viewport: window.innerWidth,
            buttons: [...document.querySelectorAll('#plane .a')].map((el) => Math.round(el.getBoundingClientRect().width))
          };
        });

        // Left to fill the width, each of the four plane buttons would be ~210px.
        assert.isAtMost(toolbar.width, 560, 'the toolbar must not stretch across a wide box');
        assert.closeTo(toolbar.left, (toolbar.viewport - toolbar.width) / 2, 2, 'the toolbar should be centred');
        toolbar.buttons.forEach((width) => {
          assert.isAtMost(width, 150, 'a plane button should stay button-sized');
        });
      } finally {
        await page.close();
      }
    }).timeout(U.longTimeout);

    it('fills the screen in fullscreen, with the controls still a strip at the bottom', async function () {
      // Chrome's old headless mode has no Fullscreen API at all, so this one
      // test needs its own browser in the new headless mode. The rest of the
      // suite stays on the shared browser the other tests use.
      const fullscreenBrowser = await puppeteer.launch({
        headless: 'new',
        ignoreHTTPSErrors: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const page = await fullscreenBrowser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await blockExternalRequests(page);
      try {
        await page.goto(embedURL('&view=cor'), { waitUntil: 'domcontentloaded' });
        await waitForSlice(page);
        await U.delay(1000);

        // A real click, not element.click(): requestFullscreen needs a genuine
        // user gesture, and this is also the path a visitor takes.
        await page.click('#fullscreen');
        await page.waitForFunction(() => document.fullscreenElement !== null, { timeout: U.mediumTimeout })
          .catch(() => { throw new Error('the viewer never entered fullscreen'); });
        await U.delay(1000);

        const state = await page.evaluate(() => {
          const row = document.getElementById('tools-maximized').getBoundingClientRect();
          const canvas = document.querySelector('#canvas').getBoundingClientRect();

          return {
            fullscreenId: document.fullscreenElement.id,
            flag: window.AtlasMakerWidget.fullscreen,
            toolbarWidth: Math.round(row.width),
            toolbarBottom: Math.round(row.bottom),
            canvasHeight: Math.round(canvas.height),
            innerHeight: window.innerHeight
          };
        });

        assert.strictEqual(state.fullscreenId, 'atlasmaker', 'the viewer itself should be the fullscreen element');
        assert.isTrue(state.flag, 'the widget should know it is fullscreen');
        assert.isAtMost(state.toolbarWidth, 560, 'the controls must not stretch across the screen');
        assert.closeTo(state.toolbarBottom, state.innerHeight, 2, 'the controls belong at the bottom of the screen');
        assert.isAbove(state.canvasHeight, 600, 'the image should take the space the controls do not');
      } finally {
        await fullscreenBrowser.close();
      }
    }).timeout(U.longTimeout);
  });

  describe('E13: the one-line script embed', function () {
    let page;

    before(async function () {
      // eslint-disable-next-line no-invalid-this
      this.timeout(U.longTimeout);
      page = await browser.newPage();
      await page.setViewport({ width: 900, height: 900 });
      await blockExternalRequests(page);
      await page.goto(U.serverURL + '/test_data/embed-script-host.html', { waitUntil: 'domcontentloaded' });
      // Two <script src="/embed.js"> tags, nothing else. Wait for the viewers.
      await page.waitForFunction(() => document.querySelectorAll('iframe.brainbox-embed').length === 2, { timeout: U.mediumTimeout })
        .catch(() => { throw new Error('the script tags did not produce two viewers'); });
    });

    after(async function () {
      if (page) { await page.close(); }
    });

    it('turns a script tag into a viewer, where the tag was', async function () {
      const frames = await page.evaluate(() => [...document.querySelectorAll('iframe.brainbox-embed')].map((el) => ({
        src: el.getAttribute('src'),
        allow: el.getAttribute('allow'),
        // The viewer should sit where its script tag was, not at the end of the page
        precededBy: el.previousElementSibling ? el.previousElementSibling.textContent.trim() : null
      })));

      assert.strictEqual(frames.length, 2);
      assert.include(frames[0].src, '/mri/embed?');
      assert.include(frames[0].src, encodeURIComponent(U.localBertURL));
      assert.include(frames[0].src, 'view=cor');
      assert.include(frames[1].src, 'view=axi');
      assert.strictEqual(frames[0].allow, 'fullscreen', 'fullscreen has to be allowed for the button to work');
      assert.strictEqual(frames[0].precededBy, 'First:');
      assert.strictEqual(frames[1].precededBy, 'Second:');
    }).timeout(U.mediumTimeout);

    it('passes its data-* options through to the viewer', async function () {
      const second = page.frames().find((f) => f.url().includes('view=axi'));
      assert.isDefined(second, 'the second viewer never loaded');
      await waitForSlice(second);
      await U.delay(1000);

      const viewer = await readViewer(second);
      assert.strictEqual(viewer.view, 'axi', 'data-view should reach the viewer');
      const hasLink = await second.evaluate(() => Boolean(document.getElementById('brainboxLink')));
      assert.isFalse(hasLink, 'data-brainbox-link="0" should reach the viewer');
    }).timeout(U.longTimeout);

    it('sizes each viewer from its own messages', async function () {
      const first = page.frames().find((f) => f.url().includes('view=cor'));
      await waitForSlice(first);
      await U.delay(2000);

      const heights = await page.evaluate(() => [...document.querySelectorAll('iframe.brainbox-embed')]
        .map((el) => Math.round(el.getBoundingClientRect().height)));

      // Both must have moved off the loader's 420px starting guess, and the
      // second is capped by data-max-height, so they cannot be equal.
      assert.notStrictEqual(heights[0], 420, 'the first viewer should have been resized');
      assert.isAtMost(heights[1], 380, 'data-max-height should cap the second viewer');
      assert.notStrictEqual(heights[0], heights[1], 'each viewer sizes itself, independently of the other');
    }).timeout(U.longTimeout);
  });

  describe('E11: the BrainBox attribution link', function () {
    it('deep-links to this brain\'s own page, in a new tab', async function () {
      const page = await browser.newPage();
      await page.setViewport({ width: 700, height: 700 });
      await blockExternalRequests(page);
      try {
        await page.goto(embedURL('&view=cor'), { waitUntil: 'domcontentloaded' });
        await waitForSlice(page);
        await U.delay(1000);

        const link = await page.evaluate(() => {
          const el = document.getElementById('brainboxLink');
          if (!el) { return null; }

          return { href: el.href, target: el.target, rel: el.rel };
        });
        assert.isNotNull(link, 'the attribution link should be shown by default');
        assert.strictEqual(link.target, '_blank');
        assert.include(link.rel, 'noopener');
        assert.include(link.href, '/mri?');
        assert.include(link.href, encodeURIComponent(U.localBertURL));
        assert.include(link.href, 'view=cor', 'the link should open where the visitor is looking');
      } finally {
        await page.close();
      }
    }).timeout(U.longTimeout);

    it('follows the plane the visitor switched to', async function () {
      const page = await browser.newPage();
      await page.setViewport({ width: 700, height: 700 });
      await blockExternalRequests(page);
      try {
        await page.goto(embedURL('&view=cor'), { waitUntil: 'domcontentloaded' });
        await waitForSlice(page);
        await U.delay(1000);
        await clickPlane(page, 'Axi');
        await page.waitForFunction(() => window.AtlasMakerWidget.brainImg.view === 'axi', { timeout: U.mediumTimeout });

        const href = await page.evaluate(() => document.getElementById('brainboxLink').href);
        assert.include(href, 'view=axi');
      } finally {
        await page.close();
      }
    }).timeout(U.longTimeout);

    it('can be switched off by the embedding page', async function () {
      const page = await browser.newPage();
      await page.setViewport({ width: 700, height: 700 });
      await blockExternalRequests(page);
      try {
        await page.goto(embedURL('&brainboxLink=0'), { waitUntil: 'domcontentloaded' });
        await waitForSlice(page);
        await U.delay(500);
        const present = await page.evaluate(() => Boolean(document.getElementById('brainboxLink')));
        assert.isFalse(present, 'brainboxLink=0 should remove the link');
      } finally {
        await page.close();
      }
    }).timeout(U.longTimeout);
  });
});
