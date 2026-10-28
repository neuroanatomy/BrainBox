'use strict';

/*
  The columns of the user page sort with nwl-components' SortableTh, as in microdraw: a sort
  icon on every header from the start, the server's order until a click, a first click sorts
  ascending and a second reverses, aria-sort on the header, and Enter on the header's button
  sorts too. The projects are inserted directly in the database, in an order that is not the
  sorted order of any column. No MRI is downloaded.
*/

const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const U = require('../utils.js');

const owner = 'sortpage-owner';
const HEADERS = ['Name', 'Files', 'Collaborators', 'Owner', 'Last modified'];
const [anyone] = U.projectTest.collaborators.list;

// in the server's order: name, number of files, number of collaborators, last modification
const PROJECTS = [
  ['sortpagec', 2, 3, '2026-01-05T10:00:00Z'],
  ['sortpagea', 10, 1, '2025-12-31T10:00:00Z'],
  ['sortpaged', 1, 4, '2026-03-01T10:00:00Z'],
  ['sortpageb', 3, 2, '2026-02-10T10:00:00Z']
];

const project = ([shortname, numFiles, numCollaborators, modified]) => ({
  name: shortname,
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
    assert.deepEqual(await names(), PROJECTS.map(([name]) => name));
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

  it('sorts by name on a click, reversed on a second click', async function () {
    await clickHeader('Name');
    assert.deepEqual(await names(), ['sortpagea', 'sortpageb', 'sortpagec', 'sortpaged']);
    assert.equal(await ariaSort('Name'), 'ascending');
    await clickHeader('Name');
    assert.deepEqual(await names(), ['sortpaged', 'sortpagec', 'sortpageb', 'sortpagea']);
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
    assert.deepEqual(await names(), ['sortpagea', 'sortpagec', 'sortpageb', 'sortpaged']);
    assert.deepEqual(await dates(), byDate);
    await clickHeader('Last modified');
    assert.deepEqual(await names(), ['sortpaged', 'sortpageb', 'sortpagec', 'sortpagea']);
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
});
