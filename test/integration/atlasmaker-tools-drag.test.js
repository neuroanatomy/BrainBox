/* global AtlasMakerWidget */
'use strict';

/*
  Browser tests for dragging the toolbar (#tools-side) by its handle (#toolsDragHandle),
  view/atlasmaker/src/atlasmaker-interaction.js initToolsDrag(). The handle is in
  #headerBlock, which is only shown in fullscreen, so the panel is draggable in
  fullscreen only, docked left or right or already dragged ("free"), with the mouse
  or with a finger.
*/

const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');

const DELTA = { x: -300, y: 120 };

// A desktop window, or a tablet (an iPad in landscape: touch, mobile viewport)
const VIEWPORTS = {
  desktop: { width: 1200, height: 900 },
  tablet: { width: 1180, height: 820, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
};

const MRI_PAGE = `${U.serverURL}/mri?url=${U.localBertURL}`;
const PROJECT_PAGE = `${U.serverURL}/project/${U.projectTest.shortname}`;

// Open a page with the viewer, and enter fullscreen with the toolbar's button, clicked
// (or tapped, on a touch screen) as the user would
const openViewerFullscreen = async (browser, viewport, url = MRI_PAGE) => {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await U.blockExternalRequests(page);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    (inProject) => window.AtlasMakerWidget && AtlasMakerWidget.brainImg && AtlasMakerWidget.brainImg.img &&
      AtlasMakerWidget.flagConnected === 1 && AtlasMakerWidget.ontology && AtlasMakerWidget.atlas &&
      (!inProject || document.querySelector('#tools > #tools-side')),
    { timeout: U.longTimeout },
    url === PROJECT_PAGE
  );
  // With fullscreen=true in its URL, the page enters fullscreen by itself
  if (!url.includes('fullscreen=true')) {
    await page.$eval('#fullscreen', (el) => el.scrollIntoView());
    await (viewport.hasTouch ? page.tap('#fullscreen') : page.click('#fullscreen'));
  }
  await page.waitForFunction(() => document.body.classList.contains('atlasmaker-fullscreen'), { timeout: U.shortTimeout });

  return { page, pageErrors };
};

const panelRect = (page) => page.$eval('#tools-side', (el) => {
  const r = el.getBoundingClientRect();

  return { left: r.left, top: r.top };
});

// The middle of the handle, checking that the handle is what the user would touch there
const handleCentre = async (page) => {
  const handle = await page.$eval('#toolsDragHandle', (el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;

    return { x, y, width: r.width, height: r.height, onTop: document.elementFromPoint(x, y) === el };
  });
  assert.isAbove(handle.width, 0, 'the handle has a width');
  assert.isAbove(handle.height, 0, 'the handle has a height');
  assert.isTrue(handle.onTop, 'nothing covers the handle');

  return handle;
};

const mouseDrag = async (page, from) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + DELTA.x, from.y + DELTA.y, { steps: 8 });
  await page.mouse.up();
};

const touchDrag = async (page, from) => {
  await page.touchscreen.touchStart(from.x, from.y);
  for (let i = 1; i <= 8; i++) {
    // eslint-disable-next-line no-await-in-loop
    await page.touchscreen.touchMove(from.x + DELTA.x * i / 8, from.y + DELTA.y * i / 8);
  }
  await page.touchscreen.touchEnd();
};

const assertMovedByDelta = (before, after) => {
  assert.closeTo(after.left - before.left, DELTA.x, 1, 'moved horizontally by the drag');
  assert.closeTo(after.top - before.top, DELTA.y, 1, 'moved vertically by the drag');
};

describe('TESTING DRAGGING THE VIEWER\'S TOOLBAR', function () {
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

  it('shows the drag handle in fullscreen only', async function () {
    viewer = await openViewerFullscreen(browser, VIEWPORTS.desktop);
    const { page } = viewer;
    await handleCentre(page);
    await page.evaluate(() => AtlasMakerWidget.toggleFullscreen());
    const width = await page.$eval('#toolsDragHandle', (el) => el.getBoundingClientRect().width);
    assert.strictEqual(width, 0, 'hidden with #headerBlock outside fullscreen');
  }).timeout(U.longTimeout * 2);

  it('moves the toolbar by the mouse drag, docked right, and again once free', async function () {
    viewer = await openViewerFullscreen(browser, VIEWPORTS.desktop);
    const { page } = viewer;

    let before = await panelRect(page);
    await mouseDrag(page, await handleCentre(page));
    let after = await panelRect(page);
    assertMovedByDelta(before, after);
    assert.strictEqual(await page.evaluate(() => document.body.getAttribute('data-toolbarDisplay')), 'free');

    // a second drag, from where the toolbar now is
    before = after;
    await mouseDrag(page, await handleCentre(page));
    after = await panelRect(page);
    assertMovedByDelta(before, after);
    assert.deepEqual(viewer.pageErrors, []);
  }).timeout(U.longTimeout * 2);

  it('moves the toolbar by the mouse drag, docked left', async function () {
    viewer = await openViewerFullscreen(browser, VIEWPORTS.desktop);
    const { page } = viewer;
    await page.evaluate(() => AtlasMakerWidget.changeToolbarDisplay('left'));
    const before = await panelRect(page);
    assert.strictEqual(before.left, 0);
    await mouseDrag(page, await handleCentre(page));
    const after = await panelRect(page);
    assertMovedByDelta(before, after);
  }).timeout(U.longTimeout * 2);

  it('moves the toolbar by a touch drag on a tablet', async function () {
    viewer = await openViewerFullscreen(browser, VIEWPORTS.tablet);
    const { page } = viewer;
    const before = await panelRect(page);
    await touchDrag(page, await handleCentre(page));
    const after = await panelRect(page);
    assertMovedByDelta(before, after);
    assert.strictEqual(await page.evaluate(() => document.body.getAttribute('data-toolbarDisplay')), 'free');
    assert.deepEqual(viewer.pageErrors, []);
  }).timeout(U.longTimeout * 2);

  it('moves the toolbar by the mouse drag on a page opened in fullscreen', async function () {
    viewer = await openViewerFullscreen(browser, VIEWPORTS.desktop, `${MRI_PAGE}&fullscreen=true`);
    const { page } = viewer;
    const before = await panelRect(page);
    await mouseDrag(page, await handleCentre(page));
    assertMovedByDelta(before, await panelRect(page));
  }).timeout(U.longTimeout * 2);

  it('moves the toolbar by the mouse drag on a project page', async function () {
    viewer = await openViewerFullscreen(browser, VIEWPORTS.desktop, PROJECT_PAGE);
    const { page } = viewer;
    const before = await panelRect(page);
    await mouseDrag(page, await handleCentre(page));
    assertMovedByDelta(before, await panelRect(page));
  }).timeout(U.longTimeout * 2);

  it('moves the toolbar by a touch drag on a project page, on a tablet', async function () {
    viewer = await openViewerFullscreen(browser, VIEWPORTS.tablet, PROJECT_PAGE);
    const { page } = viewer;
    const before = await panelRect(page);
    await touchDrag(page, await handleCentre(page));
    assertMovedByDelta(before, await panelRect(page));
  }).timeout(U.longTimeout * 2);
});
