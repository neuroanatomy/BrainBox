'use strict';

/*
  The columns of the user page sort with nwl-components' SortableTh, as in microdraw: a sort
  icon on every header from the start, the server's order until a click, a first click sorts
  ascending and a second reverses, aria-sort on the header, and Enter on the header's button
  sorts too. The projects are inserted directly in the database, in an order that is not the
  sorted order of any column. No MRI is downloaded.
  The Name column shows the project's display name, or its short name when the display name
  is missing or empty, sorts by what it shows, and links by the short name.
  A project name that is one long word wraps inside its cell (nwl-components >= 1.5.2): the
  projects table is never wider than its .content panel. Only the Name cell breaks inside a
  word (nwl-components >= 1.5.3, class nwl-break-anywhere): a 16-character owner name stays
  on one line when the panel is narrow.
*/

const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const U = require('../utils.js');

const owner = 'sortpage-owner';
const HEADERS = ['Name', 'Files', 'Collaborators', 'Owner', 'Last modified'];
const [anyone] = U.projectTest.collaborators.list;

// in the server's order: short name, number of files, number of collaborators, last
// modification, display name (none for sortpaged, empty for sortpagea)
const PROJECTS = [
  ['sortpagec', 2, 3, '2026-01-05T10:00:00Z', 'Alpha study'],
  ['sortpagea', 10, 1, '2025-12-31T10:00:00Z', ''],
  ['sortpaged', 1, 4, '2026-03-01T10:00:00Z'],
  ['sortpageb', 3, 2, '2026-02-10T10:00:00Z', 'Zeta study']
];
// what the Name column shows for each project, by short name
const SHOWN = { sortpagea: 'sortpagea', sortpageb: 'Zeta study', sortpagec: 'Alpha study', sortpaged: 'sortpaged' };
const shown = (shortnames) => shortnames.map((s) => SHOWN[s]);

const project = ([shortname, numFiles, numCollaborators, modified, name]) => ({
  ...(typeof name === 'undefined' ? {} : { name }),
  shortname,
  brainboxURL: `/project/${shortname}`,
  owner,
  created: new Date('2025-01-01T00:00:00Z'),
  modified: new Date(modified),
  collaborators: {
    list: [
      anyone,
      ...Array.from({ length: numCollaborators - 1 }, (_x, i) => ({ userID: `sortpage-user${i}`, access: anyone.access }))
    ]
  },
  files: { list: Array.from({ length: numFiles }, (_x, i) => ({ source: `https://example.org/${shortname}/${i}.nii.gz`, name: `f${i}` })) },
  annotations: { list: [] }
});

// a project whose name is a 60-character word, for the overflow check
const LONG_NAME = 'sortpage'.padEnd(60, 'w');
const LONG = [LONG_NAME, 1, 1, '2026-04-01T10:00:00Z', LONG_NAME];
// a 16-character owner, like "danielemarinazzo", of a project the page's user collaborates on
const LONG_OWNER = 'sortpagelongownr';
const LONG_OWNED = {
  ...project(['sortpagelongowned', 1, 1, '2026-04-02T10:00:00Z', 'Long owner study']),
  owner: LONG_OWNER,
  collaborators: { list: [anyone, { userID: owner, access: anyone.access }] }
};

const pad = (n) => String(n).padStart(2, '0');
// local YYYY-MM-DD, as the page shows it; the test runs in the browser's time zone
const localDay = (iso) => {
  const d = new Date(iso);

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const removeAll = () => U.getNativeDB().collection('project')
  .deleteMany({ shortname: { $regex: '^sortpage' } });

// eslint-disable-next-line max-statements -- one page, one `it` per behaviour
describe('User page: sortable columns', function () {
  // eslint-disable-next-line no-invalid-this
  this.timeout(U.mediumTimeout);

  let browser;
  let page;

  // the project name of every row, top to bottom
  const names = () => page.$$eval('#projects tbody tr', (trs) => trs.map((tr) => tr.cells[0].textContent.trim()));
  // the project link of every row, top to bottom
  const links = () => page.$$eval('#projects tbody tr', (trs) => trs.map((tr) => tr.cells[0].querySelectorAll('a')[1].getAttribute('href')));
  const firstRow = () => page.$eval('#projects tbody tr:first-child', (tr) => [...tr.cells].map((td) => td.textContent.trim()));
  const ariaSort = (label) => page.$$eval('#projects thead th', (ths, l) => ths.find((th) => th.textContent.trim() === l).getAttribute('aria-sort'), label);
  const headerButton = async (label) => {
    const headers = await page.$$('#projects thead th');
    const texts = await Promise.all(headers.map((th) => th.evaluate((el) => el.textContent.trim())));
    assert.include(texts, label);

    return headers[texts.indexOf(label)].$('button');
  };
  const clickHeader = async (label) => {
    const button = await headerButton(label);
    assert.isNotNull(button, `no button in the ${label} header`);
    await button.click();
  };

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    await removeAll();
    await U.removeUser(owner);
    await U.insertUser({ nickname: owner, name: 'Sort Page Owner', joined: '2026-10-28T00:00:00.000Z' });
    await U.getNativeDB().collection('project')
      .insertMany(PROJECTS.map(project));
    browser = await puppeteer.launch({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1000 });
    await U.blockExternalRequests(page);
  });

  after(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    try {
      if (browser) { await browser.close(); }
    } finally {
      await removeAll();
      await U.removeUser(owner);
    }
  });

  it('the projects JSON sends the last modification as an ISO date', async function () {
    const res = await fetch(`${U.serverURL}/user/json/${owner}/projects?start=0&length=100`);
    const { list } = await res.json();
    assert.deepEqual(
      list.map((p) => [p.project, p.modified]),
      PROJECTS.map(([name, , , modified]) => [name, new Date(modified).toISOString()])
    );
  });

  it('lists the projects in the server\'s order before any click', async function () {
    await page.goto(`${U.serverURL}/user/${owner}`, { waitUntil: 'load' });
    await page.waitForFunction((n) => document.querySelectorAll('#projects tbody tr').length === n, { timeout: U.mediumTimeout }, PROJECTS.length);
    assert.deepEqual(await names(), shown(PROJECTS.map(([shortname]) => shortname)));
  });

  it('shows the display name, or the short name when it is missing or empty, and links by the short name', async function () {
    assert.deepEqual(await names(), ['Alpha study', 'sortpagea', 'sortpaged', 'Zeta study']);
    assert.deepEqual(await links(), PROJECTS.map(([shortname]) => `/project/${shortname}`));
  });

  it('shows a sort icon on every header before any click, aria-sort none', async function () {
    const headers = await page.$$eval('#projects thead th', (ths) => ths.map((th) => ({
      text: th.textContent.trim(),
      icon: Boolean(th.querySelector('svg')),
      sort: th.getAttribute('aria-sort')
    })));
    assert.deepEqual(headers.map((h) => h.text), HEADERS);
    headers.forEach((h) => {
      assert.isTrue(h.icon, `no sort icon on ${h.text}`);
      assert.equal(h.sort, 'none', h.text);
    });
  });

  it('shows the last modification as a local YYYY-MM-DD, with the date and time in a tooltip', async function () {
    const cells = await page.$$eval('#projects tbody tr', (trs) => trs.map((tr) => ({
      text: tr.cells[4].textContent.trim(),
      title: tr.cells[4].getAttribute('title')
    })));
    cells.forEach((cell, i) => {
      const [, , , modified] = PROJECTS[i];
      assert.equal(cell.text, localDay(modified));
      assert.match(cell.title, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/u);
      assert.isTrue(cell.title.startsWith(localDay(modified)), cell.title);
    });
  });

  it('sorts by the shown name on a click, reversed on a second click', async function () {
    await clickHeader('Name');
    assert.deepEqual(await names(), ['Alpha study', 'sortpagea', 'sortpaged', 'Zeta study']);
    assert.equal(await ariaSort('Name'), 'ascending');
    await clickHeader('Name');
    assert.deepEqual(await names(), ['Zeta study', 'sortpaged', 'sortpagea', 'Alpha study']);
    assert.equal(await ariaSort('Name'), 'descending');
  });

  it('sorts Files as numbers, and only the sort column has aria-sort', async function () {
    await clickHeader('Files');
    assert.equal((await firstRow())[1], '1');
    assert.equal(await ariaSort('Files'), 'ascending');
    assert.equal(await ariaSort('Name'), 'none');
    await clickHeader('Files');
    assert.equal((await firstRow())[1], '10');
    assert.equal(await ariaSort('Files'), 'descending');
  });

  it('sorts by last modified as dates, oldest first then newest first', async function () {
    const dates = () => page.$$eval('#projects tbody tr', (trs) => trs.map((tr) => tr.cells[4].textContent.trim()));
    const byDate = PROJECTS.map(([, , , modified]) => localDay(modified)).sort();
    await clickHeader('Last modified');
    assert.deepEqual(await names(), shown(['sortpagea', 'sortpagec', 'sortpageb', 'sortpaged']));
    assert.deepEqual(await dates(), byDate);
    await clickHeader('Last modified');
    assert.deepEqual(await names(), shown(['sortpaged', 'sortpageb', 'sortpagec', 'sortpagea']));
    assert.deepEqual(await dates(), [...byDate].reverse());
  });

  it('sorts with the keyboard: Enter on a header', async function () {
    const button = await headerButton('Collaborators');
    assert.isNotNull(button, 'no button in the Collaborators header');
    await button.focus();
    await page.keyboard.press('Enter');
    assert.equal((await firstRow())[2], '1');
    assert.equal(await ariaSort('Collaborators'), 'ascending');
    await page.keyboard.press('Enter');
    assert.equal((await firstRow())[2], '4');
    assert.equal(await ariaSort('Collaborators'), 'descending');
  });

  it('keeps the projects table within its .content panel when a name is a 60-character word', async function () {
    const name = LONG_NAME;
    await U.getNativeDB().collection('project')
      .insertOne(project(LONG));
    await page.setViewport({ width: 800, height: 1000 });
    await page.goto(`${U.serverURL}/user/${owner}`, { waitUntil: 'load' });
    await page.waitForFunction((n) => document.querySelectorAll('#projects tbody tr').length === n, { timeout: U.mediumTimeout }, PROJECTS.length + 1);
    const { table, content, text } = await page.$eval('#projects', (el) => {
      const t = el.tagName === 'TABLE' ? el : el.querySelector('table');

      return {
        table: t.getBoundingClientRect().width,
        content: t.closest('.content').getBoundingClientRect().width,
        text: t.innerText
      };
    });
    assert.include(text, name);
    assert.isAtMost(table, content, `the table is ${table}px wide, its .content panel ${content}px`);
  });

  it('keeps a 16-character owner name on one line when the panel is narrow', async function () {
    await U.getNativeDB().collection('project')
      .insertOne(LONG_OWNED);
    await page.setViewport({ width: 700, height: 1000 });
    await page.goto(`${U.serverURL}/user/${owner}`, { waitUntil: 'load' });
    await page.waitForFunction((n) => document.querySelectorAll('#projects tbody tr').length === n, { timeout: U.mediumTimeout }, PROJECTS.length + 2);
    const lines = await page.$$eval('#projects tbody tr', (trs, o) => {
      const a = trs.map((tr) => tr.cells[3].querySelector('a')).find((el) => el.textContent.trim() === o);
      const range = document.createRange();
      range.selectNodeContents(a);

      return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
    }, LONG_OWNER);
    assert.equal(lines, 1, `the owner ${LONG_OWNER} is on ${lines} lines`);
  });
});
