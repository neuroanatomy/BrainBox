'use strict';

/*
  nwl-components' widgets (widgets.css, UI kit step 9a) on BrainBox's own pages: the home
  page's push buttons are bold with 5px vertical padding (U3) and get a lighter background on
  hover (U7; the home page is in the 2027 theme, UI kit step 13b, so its --nwl-bg-pressed is
  #404040); a selected table row carries aria-selected="true", which gives it its background
  (--nwl-bg-elevated, #2e2e2e on the project page, in the 2027 theme since UI kit step 13c);
  a link without its underline (the footer's) gets it back on hover (U8). The mouse is the
  real one (page.hover), so :hover is the browser's.
*/

const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const U = require('../utils.js');

/**
 * Open a page, with only our server's requests and no MRI data
 * @param {Object} browser A puppeteer browser
 * @param {string} path The page's path
 * @returns {Promise<Object>} The page
 */
const openPage = async (browser, path) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900 });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (!U.isLocalURL(url) || (!req.isNavigationRequest() && (url.includes('/mri/json') || url.includes('.nii.gz')))) {
      req.abort();
    } else {
      req.continue();
    }
  });
  await page.goto(`${U.serverURL}${path}`, { waitUntil: 'domcontentloaded' });

  return page;
};

const style = (page, selector, props) => page.$eval(selector, (el, ps) => {
  const cs = getComputedStyle(el);

  return Object.fromEntries(ps.map((p) => [p, cs.getPropertyValue(p)]));
}, props);

describe('nwl-components widgets on BrainBox pages', function () {
  let browser;
  let page;

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    browser = await puppeteer.launch({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  });

  afterEach(async function () {
    if (page) { await page.close(); }
    page = null;
  });

  after(async function () {
    if (browser) { await browser.close(); }
  });

  it('shows the home page\'s push buttons bold, with 5px vertical padding, lighter on hover', async function () {
    page = await openPage(browser, '/');
    await page.waitForSelector('#go.nwl-push-button');
    const buttons = await Promise.all(['select#list', '#go'].map((sel) => style(page, sel, ['font-weight', 'padding'])));
    buttons.forEach((b) => assert.deepEqual(b, { 'font-weight': '700', padding: '5px 0px' }));
    assert.strictEqual((await style(page, '#go', ['background-color']))['background-color'], 'rgba(0, 0, 0, 0)');
    await page.hover('#go');
    assert.deepEqual(await style(page, '#go', ['background-color', 'opacity']), { 'background-color': 'rgb(64, 64, 64)', opacity: '1' });
  }).timeout(U.longTimeout);

  it('marks the selected file row with aria-selected, which gives it its background', async function () {
    page = await openPage(browser, `/project/${U.projectTest.shortname}`);
    const selected = '#projectFiles tbody tr.selected';
    await page.waitForSelector(selected, { timeout: U.longTimeout });
    const rows = await page.$$eval('#projectFiles tbody tr', (trs) => trs.map((tr) => ({
      selected: tr.classList.contains('selected'),
      aria: tr.getAttribute('aria-selected'),
      background: getComputedStyle(tr).backgroundColor
    })));
    assert.deepEqual(rows[0], { selected: true, aria: 'true', background: 'rgb(46, 46, 46)' });
    rows.slice(1).forEach((row) => assert.deepEqual(row, { selected: false, aria: null, background: 'rgba(0, 0, 0, 0)' }));
  }).timeout(U.longTimeout);

  it('underlines a footer link on hover only', async function () {
    page = await openPage(browser, '/');
    const link = '.footerLinks a.linkNoULine';
    await page.waitForSelector(link);
    assert.strictEqual((await style(page, link, ['text-decoration-line']))['text-decoration-line'], 'none');
    await page.hover(link);
    assert.strictEqual((await style(page, link, ['text-decoration-line']))['text-decoration-line'], 'underline');
  }).timeout(U.longTimeout);
});
