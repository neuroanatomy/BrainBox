'use strict';

/*
  Browser tests for the spacing between table columns, in the user, project, project
  settings and MRI pages: in every table, every cell but the last of its row is followed by
  1em, so that "Collaborators" and "Owner" do not run together, and the last one by nothing.
  nwl-components' Table spaces its own columns (since 1.5.1); BrainBox's
  view/brainbox/src/style/tables.css spaces only the plain tables. No MRI is downloaded: the
  requests for MRI data are aborted.
*/

const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const U = require('../utils.js');

const MIN_GAP = 8; // px between the text of two neighbouring cells
// nwlTables: the tables of the page that are an nwl-components Table; the others are plain
const PAGES = {
  user: { url: `${U.serverURL}/user/foo`, waitFor: '#projects tbody tr', nwlTables: ['#projects'] },
  project: { url: `${U.serverURL}/project/${U.projectTest.shortname}`, waitFor: '#projectFiles thead th', nwlTables: [] },
  settings: { url: `${U.serverURL}/project/${U.projectTest.shortname}/settings`, waitFor: '#access tbody tr', nwlTables: ['#annotations', '#access', '#files'] },
  mri: { url: `${U.serverURL}/mri?url=${U.testDataURL}/test_data/none.nii.gz`, waitFor: '#annotations thead th', nwlTables: [] }
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
 * The spacing of every cell of every table of the page: its padding right and left in ems, whether it
 * is the last of its row, whether its table is an nwl-components Table (one of nwlTables),
 * and the stylesheets' 1em padding-right rules that match it, split into nwl-components'
 * scoped rules (their selector has a data-v-… attribute) and the others (BrainBox's).
 * @param {Object} page A puppeteer page
 * @param {Array<string>} nwlTables Selectors of the page's nwl-components Tables
 * @returns {Promise<Array>} One entry per cell
 */
const cellSpacing = (page, nwlTables) => page.evaluate((nwlSelectors) => {
  const rules = [];
  const collect = (list) => {
    for (const rule of list) {
      if (rule.cssRules) { collect(rule.cssRules); }
      if (rule.selectorText && rule.style && rule.style.paddingRight === '1em') { rules.push(rule.selectorText); }
    }
  };
  for (const sheet of document.styleSheets) {
    try { collect(sheet.cssRules); } catch (e) { /* cross-origin sheet */ }
  }
  const nwl = new Set(nwlSelectors.flatMap((sel) => [...document.querySelectorAll(sel)]));
  const cells = [];
  document.querySelectorAll('table').forEach((table, t) => {
    for (const tr of table.querySelectorAll('tr')) {
      if (tr.closest('table') !== table) { continue; }
      [...tr.cells].forEach((cell, i) => {
        const style = getComputedStyle(cell);
        const matching = rules.filter((sel) => cell.matches(sel));
        cells.push({
          name: `${table.id || 'table ' + t}: ${cell.textContent.trim().slice(0, 20) || i}`,
          ems: parseFloat(style.paddingRight) / parseFloat(style.fontSize),
          leftEms: parseFloat(style.paddingLeft) / parseFloat(style.fontSize),
          last: i === tr.cells.length - 1,
          nwl: nwl.has(table),
          nwlRules: matching.filter((sel) => sel.includes('[data-v-')).length,
          appRules: matching.filter((sel) => !sel.includes('[data-v-')).length
        });
      });
    }
  });

  return cells;
}, nwlTables);

/**
 * Open a page, without its MRI data, and run a check on it.
 * @param {Object} browser A puppeteer browser
 * @param {Object} p The page: its url, and a selector to wait for
 * @param {Function} check An async function of the puppeteer page
 * @returns {Promise<void>} Resolves when the page has been checked
 */
const withPage = async (browser, p, check) => {
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
    await check(page);
  } finally {
    await page.close();
  }
};

/**
 * Open a page, without its MRI data, and check that no two neighbouring cells are cramped.
 * @param {Object} browser A puppeteer browser
 * @param {Object} p The page: its url, and a selector to wait for
 * @returns {Promise<void>} Resolves when the tables have been checked
 */
const checkPage = (browser, p) => withPage(browser, p, async (page) => {
  const { cramped, checked } = await crampedCells(page, 'table');
  assert.isAbove(checked, 0, 'no table cells found');
  assert.deepEqual(cramped, []);
});

/**
 * Open a page and check that every cell but the last of its row is followed by exactly 1em,
 * and the last by no more than it is preceded by (its own padding, no column gap); and that the 1em comes from nwl-components in its Tables, and
 * from BrainBox in the plain tables.
 * @param {Object} browser A puppeteer browser
 * @param {Object} p The page: its url, a selector to wait for, and its nwl-components Tables
 * @param {string} kind 'nwl' to check the page's nwl-components Tables, 'plain' for the others
 * @returns {Promise<void>} Resolves when the tables have been checked
 */
const checkSpacing = (browser, p, kind) => withPage(browser, p, async (page) => {
  const cells = (await cellSpacing(page, p.nwlTables)).filter((c) => c.nwl === (kind === 'nwl'));
  assert.isAbove(cells.length, 0, `no cells in ${kind} tables`);
  const wrong = cells.filter((c) => Math.abs(c.ems - (c.last ? c.leftEms : 1)) > 0.01).map((c) => `${c.name}: ${c.ems}em`);
  assert.deepEqual(wrong, [], 'cells not followed by 1em, or last cells followed by some space');
  const spaced = cells.filter((c) => !c.last);
  const source = kind === 'nwl'
    ? spaced.filter((c) => c.nwlRules === 0 || c.appRules > 0)
    : spaced.filter((c) => c.appRules === 0);
  assert.deepEqual(source.map((c) => c.name), [], kind === 'nwl'
    ? 'nwl Table cells not spaced by nwl-components alone'
    : 'plain table cells not spaced by BrainBox');
});

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

  it('spaces the columns of an nwl-components Table by 1em, with nwl-components\' rule only (user page)', async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    await checkSpacing(browser, PAGES.user, 'nwl');
  });

  it('spaces the columns of the nwl-components Tables by 1em, with nwl-components\' rule only (project settings page)', async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    await checkSpacing(browser, PAGES.settings, 'nwl');
  });

  it('spaces the columns of the plain tables by 1em, with BrainBox\'s rule (project page)', async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    await checkSpacing(browser, PAGES.project, 'plain');
  });

  it('spaces the columns of the plain tables by 1em, with BrainBox\'s rule (MRI page)', async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    await checkSpacing(browser, PAGES.mri, 'plain');
  });
});
