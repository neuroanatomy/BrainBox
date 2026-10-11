'use strict';

/*
  Browser tests for the spacing between table columns (view/brainbox/src/style/tables.css),
  in the user, project, project settings and MRI pages: in every table, every cell but the
  last of its row is followed by some space, so that "Collaborators" and "Owner" do not run
  together. No MRI is downloaded: the requests for MRI data are aborted.
*/

const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const U = require('../utils.js');

const MIN_GAP = 8; // px between the text of two neighbouring cells
const PAGES = {
  user: { url: `${U.serverURL}/user/foo`, waitFor: '#projects tbody tr' },
  project: { url: `${U.serverURL}/project/${U.projectTest.shortname}`, waitFor: '#projectFiles thead th' },
  settings: { url: `${U.serverURL}/project/${U.projectTest.shortname}/settings`, waitFor: '#access tbody tr' },
  mri: { url: `${U.serverURL}/mri?url=${U.serverURL}/test_data/none.nii.gz`, waitFor: '#annotations thead th' }
};

/**
 * The neighbouring cells of the given tables with less than MIN_GAP pixels between them.
 * @param {Object} page A puppeteer page
 * @param {string} selector The tables to check
 * @returns {Promise<Array>} The cramped pairs, as "left|right: gap", and the number of pairs checked
 */
const crampedCells = (page, selector) => page.$$eval(selector, (tables, minGap) => {
  const cramped = [];
  let checked = 0;
  for (const table of tables) {
    for (const tr of table.querySelectorAll('tr')) {
      const cells = [...tr.cells];
      for (let i = 0; i < cells.length - 1; i += 1) {
        const gap = parseFloat(getComputedStyle(cells[i]).paddingRight) + parseFloat(getComputedStyle(cells[i + 1]).paddingLeft);
        checked += 1;
        if (gap < minGap) {
          cramped.push(`${cells[i].textContent.trim()}|${cells[i + 1].textContent.trim()}: ${gap}px`);
        }
      }
    }
  }

  return { cramped, checked };
}, MIN_GAP);

/**
 * Open a page, without its MRI data, and check its tables.
 * @param {Object} browser A puppeteer browser
 * @param {Object} p The page: its url, and a selector to wait for
 * @returns {Promise<void>} Resolves when the tables have been checked
 */
const checkPage = async (browser, p) => {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1400, height: 1000 });
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (!U.isLocalURL(url) || (!req.isNavigationRequest() && (url.includes('/mri/json') || url.includes('.nii.gz')))) { req.abort(); } else { req.continue(); }
    });
    await page.goto(p.url, { waitUntil: 'load' });
    await page.waitForSelector(p.waitFor, { timeout: U.mediumTimeout });
    const { cramped, checked } = await crampedCells(page, 'table');
    assert.isAbove(checked, 0, 'no table cells found');
    assert.deepEqual(cramped, []);
  } finally {
    await page.close();
  }
};

describe('TESTING THE SPACE BETWEEN TABLE COLUMNS', function () {
  let browser;

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    browser = await puppeteer.launch({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  });

  after(async function () {
    if (browser) { await browser.close(); }
  });

  it('leaves space between the columns in the user page', async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    await checkPage(browser, PAGES.user);
  });

  it('leaves space between the columns in the project page', async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    await checkPage(browser, PAGES.project);
  });

  it('leaves space between the columns in the project settings page', async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    await checkPage(browser, PAGES.settings);
  });

  it('leaves space between the columns in the MRI page', async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    await checkPage(browser, PAGES.mri);
  });
});
