'use strict';

/*
  The project and MRI pages load nwl-components' sort stylesheet for their sortable
  headers (2026-11-10), not its dist/style.css, whose global rules (`*` sets every
  element's font size and colour) could restyle them: the title and other elements
  outside the tables keep the computed styles they had on 95a6262 (recorded below with
  that commit's build, at 1400x1000), and the pages have the sort stylesheet's rules. The
  values below are 95a6262's with the kit's font, text colour, backgrounds (#1a1a1a, panels
  #252525) and dividers (#383838), the defaults since nwl-components 3.0.0 (first shipped as
  the 2027 theme in 2.4).
  Since UI kit step 10b both pages have nwl-components' Header (and the MRI page its
  Footer), so they load dist/style.css (2.x, without the `*` rule); their headers are
  tested in viewer-header-footer.test.js. No MRI is downloaded: the requests for MRI data
  are aborted.
*/

const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const U = require('../utils.js');

const PROPS = ['font-family', 'font-size', 'font-weight', 'color', 'background-color', 'box-sizing', 'padding', 'margin', 'border-top', 'line-height'];
// per page, per element: the value of each of PROPS on 95a6262
const EXPECTED = {
  project: {
    'body': ['"Source Sans 3", "Lucida Grande", "Lucida Sans Unicode", Helvetica, Arial, Verdana, sans-serif', '16px', '400', 'rgb(232, 232, 232)', 'rgb(26, 26, 26)', 'border-box', '0px', '0px', '0px none rgb(232, 232, 232)', '20px'],
    '#tools': ['"Source Sans 3", "Lucida Grande", "Lucida Sans Unicode", Helvetica, Arial, Verdana, sans-serif', '14px', '400', 'rgb(232, 232, 232)', 'rgba(0, 0, 0, 0)', 'border-box', '5px', '0px', '1px solid rgb(56, 56, 56)', '20px'],
    '#projectFiles': ['"Source Sans 3", "Lucida Grande", "Lucida Sans Unicode", Helvetica, Arial, Verdana, sans-serif', '14px', '400', 'rgb(232, 232, 232)', 'rgba(0, 0, 0, 0)', 'border-box', '5px', '0px', '1px solid rgb(56, 56, 56)', '20px']
  },
  mri: {
    'body': ['"Source Sans 3", "Lucida Grande", "Lucida Sans Unicode", Helvetica, Arial, Verdana, sans-serif', '16px', '400', 'rgb(232, 232, 232)', 'rgb(26, 26, 26)', 'border-box', '0px', '0px', '0px none rgb(232, 232, 232)', '20px'],
    '#annotationsPane': ['"Source Sans 3", "Lucida Grande", "Lucida Sans Unicode", Helvetica, Arial, Verdana, sans-serif', '14px', '400', 'rgb(232, 232, 232)', 'rgb(37, 37, 37)', 'border-box', '20px', '0px 20px 20px 0px', '0px none rgb(232, 232, 232)', '20px'],
    '#annotationsPane > b': ['"Source Sans 3", "Lucida Grande", "Lucida Sans Unicode", Helvetica, Arial, Verdana, sans-serif', '14px', '700', 'rgb(232, 232, 232)', 'rgba(0, 0, 0, 0)', 'border-box', '0px', '0px', '0px none rgb(232, 232, 232)', '20px']
  }
};
const PAGES = {
  project: { url: `${U.serverURL}/project/${U.projectTest.shortname}`, waitFor: '#projectFiles thead th' },
  mri: { url: `${U.serverURL}/mri?url=${U.testDataURL}/test_data/none.nii.gz`, waitFor: '#annotations thead th' }
};

/**
 * The computed styles of some elements of a page, without its MRI data
 * @param {Object} browser A puppeteer browser
 * @param {string} name The page: 'project' or 'mri'
 * @returns {Promise<Object>} For each element of EXPECTED[name], its PROPS values
 */
const computedStyles = async (browser, name) => {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1400, height: 1000 });
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (!U.isLocalURL(url) || (!req.isNavigationRequest() && (url.includes('/mri/json') || url.includes('.nii.gz')))) { req.abort(); } else { req.continue(); }
    });
    await page.goto(PAGES[name].url, { waitUntil: 'load' });
    await page.waitForSelector(PAGES[name].waitFor, { timeout: U.mediumTimeout });

    return await page.evaluate((selectors, props) => Object.fromEntries(selectors.map((sel) => {
      const style = getComputedStyle(document.querySelector(sel));

      return [sel, props.map((p) => style.getPropertyValue(p))];
    })), Object.keys(EXPECTED[name]), PROPS);
  } finally {
    await page.close();
  }
};

/**
 * The selectors of a page's style rules, without its MRI data
 * @param {Object} browser A puppeteer browser
 * @param {string} name The page: 'project' or 'mri'
 * @returns {Promise<Array<string>>} The selectors
 */
const ruleSelectors = async (browser, name) => {
  const page = await browser.newPage();
  try {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (!U.isLocalURL(url) || (!req.isNavigationRequest() && (url.includes('/mri/json') || url.includes('.nii.gz')))) { req.abort(); } else { req.continue(); }
    });
    await page.goto(PAGES[name].url, { waitUntil: 'load' });
    await page.waitForSelector(PAGES[name].waitFor, { timeout: U.mediumTimeout });

    return await page.evaluate(() => {
      const selectors = [];
      const collect = (rules) => {
        for (const rule of rules) {
          if (rule.cssRules) { collect(rule.cssRules); }
          if (rule.selectorText) { selectors.push(rule.selectorText); }
        }
      };
      for (const sheet of document.styleSheets) {
        try { collect(sheet.cssRules); } catch (e) { /* cross-origin sheet */ }
      }

      return selectors;
    });
  } finally {
    await page.close();
  }
};

describe('Project and MRI pages: styles outside the tables unchanged by the sortable headers', function () {
  let browser;

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    browser = await puppeteer.launch({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  });

  after(async function () {
    if (browser) { await browser.close(); }
  });

  it('keeps the project page\'s panels as they were', async function () {
    assert.deepEqual(await computedStyles(browser, 'project'), EXPECTED.project);
  }).timeout(U.longTimeout);

  it('keeps the MRI page\'s annotations pane as it was', async function () {
    assert.deepEqual(await computedStyles(browser, 'mri'), EXPECTED.mri);
  }).timeout(U.longTimeout);

  it('has the sort stylesheet\'s rules on the project and MRI pages', async function () {
    for (const name of Object.keys(PAGES)) {
      // eslint-disable-next-line no-await-in-loop
      const selectors = await ruleSelectors(browser, name);
      assert.include(selectors, 'th.nwl-sortable', name);
      assert.include(selectors, '.nwl-sort-button', name);
    }
  }).timeout(U.longTimeout);
});
