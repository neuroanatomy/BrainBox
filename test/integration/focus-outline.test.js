'use strict';

/*
  Keyboard focus shows a 2px outline in --nwl-focus (UI kit U6, nwl-components 2.0), on the
  app's own pages too (style/ui.css): a control reached with Tab gets it, and a control
  focused by a mouse click gets none. The home page's project list (select.nwl-push-button) is
  reached with Tab from the URL field, in the 2027 theme the page opts in to (UI kit step 13b:
  the outline is the theme's text colour); a <select> shows focus on a click too (Chromium), so
  the mouse is checked on the project page's sortable column headers (buttons), also in the 2027
  theme since UI kit step 13c.
*/

const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const U = require('../utils.js');

const KEYBOARD = { style: 'solid', width: '2px', color: 'rgb(255, 255, 255)', offset: '2px' };

/**
 * The outline of the focused element
 * @param {Object} page A puppeteer page
 * @returns {Promise<Object>} The focused element's id or class, and its outline
 */
const focusedOutline = (page) => page.evaluate(() => {
  const el = document.activeElement;
  const cs = getComputedStyle(el);

  return {
    element: el.id || el.className,
    style: cs.outlineStyle,
    width: cs.outlineWidth,
    color: cs.outlineColor,
    offset: cs.outlineOffset,
    token: getComputedStyle(document.documentElement).getPropertyValue('--nwl-focus')
      .trim()
  };
});

/**
 * Open a page, with only our server's requests and no MRI data
 * @param {Object} browser A puppeteer browser
 * @param {string} path The page's path
 * @returns {Promise<Object>} The page
 */
const openPage = async (browser, path) => {
  const page = await browser.newPage();
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

describe('Keyboard focus outline', function () {
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

  it('shows a 2px --nwl-focus outline on the home page\'s project list reached with Tab', async function () {
    page = await openPage(browser, '/');
    await page.waitForSelector('select#list.nwl-push-button');
    await page.focus('#url');
    await page.keyboard.press('Tab');
    assert.deepEqual(await focusedOutline(page), { element: 'list', ...KEYBOARD, color: 'rgb(232, 232, 232)', token: '#e8e8e8' });
  }).timeout(U.longTimeout);

  it('shows the outline on a sortable header with Tab, and none after a click', async function () {
    page = await openPage(browser, `/project/${U.projectTest.shortname}`);
    const button = '#projectFiles th.nwl-sortable > button.nwl-sort-button';
    await page.waitForSelector(button, { timeout: U.longTimeout });
    await page.click(button);
    assert.deepInclude(await focusedOutline(page), { element: 'nwl-sort-button', style: 'none' }, 'mouse');
    await page.keyboard.press('Tab');
    assert.deepInclude(await focusedOutline(page), { element: 'nwl-sort-button', ...KEYBOARD, color: 'rgb(232, 232, 232)' }, 'keyboard');
  }).timeout(U.longTimeout);
});
