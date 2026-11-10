/* eslint-disable max-lines */
/* global AtlasMakerWidget infoProxy */
'use strict';

/*
  The MRI page's Volume Annotations and Text Annotations tables sort by a click on a column
  header (2026-11-10), with nwl-components/sort and SortableTh's markup: Name, Value,
  Project and Modified (by date, not by the text the cell shows), not Access; missing
  values last both ways; unsorted (the MRI's order) until a header is clicked. A row is its
  annotation, not its position: after a sort, a click on a volume annotation's row selects
  that layer, and its Value menu changes that layer's label set.
  The test brain's document is given four layers and three text annotations (of projects
  that do not exist, which the page shows as stored), in an order that is none of the
  sorted ones; the brain is removed at the end, as the other suites that use it do.
*/

const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');

const MRI_PAGE = `${U.serverURL}/mri?url=${U.localBertURL}`;
const COLUMNS = ['Name', 'Value', 'Project', 'Modified', 'Access'];

// the layers, in the MRI's order; `labels` is a position in the server's list of label sets
const LAYERS = [
  { name: 'Layer c', project: 'mrisortc', labels: 0, modified: '2026-02-01T10:00:00.000Z' },
  { name: 'Layer a', project: 'mrisorta', labels: 2, modified: '2025-12-01T10:00:00.000Z' },
  { name: 'Layer b', project: 'mrisortb', labels: 1, modified: '2026-11-05T10:00:00.000Z' },
  { name: '', project: 'mrisortd', labels: 3 } // no name, never modified
];
// the text annotations, in the order the page lists them (by project, then name)
const TEXTS = [
  { project: 'mrisortz', name: 'Note b', data: 'beta', modified: '2026-03-01T10:00:00.000Z' },
  { project: 'mrisorty', name: 'Note a', data: 'alpha', modified: '2025-11-30T10:00:00.000Z' },
  { project: 'mrisorty', name: 'Note c', data: '', modified: '2026-12-25T10:00:00.000Z' }
];

// The positions, in `list`, in the order a sort by `value` shows them, missing values last both ways
const sortedBy = (list, value, ascending = true, compare = (a, b) => a.localeCompare(b)) => {
  const indices = list.map((_x, i) => i);
  const missing = (i) => typeof value(list[i]) === 'undefined' || value(list[i]) === null || value(list[i]) === '';
  const has = indices.filter((i) => !missing(i));
  has.sort((a, b) => (ascending ? 1 : -1) * compare(value(list[a]), value(list[b])));

  return [...has, ...indices.filter(missing)];
};
const byDate = (a, b) => new Date(a) - new Date(b);

/**
 * Open the MRI page, once it has filled its tables. Requests outside our server are aborted.
 * @param {Object} browser A puppeteer browser
 * @returns {Promise<Object>} { page, requests, pageErrors }
 */
const openPage = async (browser) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900 });
  const requests = [];
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (U.isLocalURL(req.url())) {
      requests.push(req.url());
      req.continue();
    } else {
      req.abort();
    }
  });
  await page.goto(MRI_PAGE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.AtlasMakerWidget && AtlasMakerWidget.isViewerReady() && document.querySelector('table#annotations tbody tr'),
    { timeout: U.longTimeout }
  );

  return { page, requests, pageErrors };
};

// eslint-disable-next-line max-statements
describe('MRI page: sortable annotations tables', function () {
  let browser;
  let opened;
  let labelSets;
  let layerNames; // the label set name of each layer

  const column = (table, col) => opened.page.$$eval(`table#${table} tbody tr`, (trs, c) => trs.map((tr) => {
    const select = tr.cells[c].querySelector('select');

    return select ? select.options[select.selectedIndex].textContent : tr.cells[c].textContent;
  }), COLUMNS.indexOf(col));
  const ariaSorts = (table) => opened.page.$$eval(`table#${table} thead th`, (ths) => ths.map((th) => th.getAttribute('aria-sort')));
  const button = (table, col) => `table#${table} thead th:nth-child(${COLUMNS.indexOf(col) + 1}) button.nwl-sort-button`;
  const clickHeader = (table, col) => opened.page.click(button(table, col));
  const names = (list, order) => order.map((i) => list[i].name);
  // the aria-sort of each header when `col` is sorted in `direction` (Access has none)
  const sorts = (col, direction) => COLUMNS.map((c) => {
    if (c === 'Access') { return null; }

    return (c === col) ? direction : 'none';
  });
  // The test brain's document, with the layers and text annotations above
  const setUpBrain = async () => {
    const mris = U.getNativeDB().collection('mri');
    const stored = await mris.findOne({ source: U.localBertURL, backup: { $exists: false } });
    const [first] = stored.mri.atlas;
    const atlas = LAYERS.map((l) => {
      const layer = { ...first, name: l.name, project: l.project, labels: labelSets[l.labels].source, access: 'edit', modified: l.modified };
      if (!l.modified) { delete layer.modified; }

      return layer;
    });
    const annotations = {};
    for (const t of TEXTS) {
      annotations[t.project] = annotations[t.project] || {};
      annotations[t.project][t.name] = { type: 'text', data: t.data, modified: t.modified, modifiedBy: 'foo', created: t.modified };
    }
    await mris.updateOne({ _id: stored._id }, { $set: { 'mri.atlas': atlas, 'mri.annotations': annotations } });
  };
  // Once the server has finished with the page that downloaded the brain (it stores the
  // document again when it unloads the page's atlas), the document keeps the layers above
  const setUpBrainOnceIdle = async () => {
    const server = U.getAtlasmakerServer();
    const busy = () => server.US.filter(Boolean).length > 0 || server.Atlases.filter(Boolean).length > 0;
    const layerNamesStored = async () => {
      const doc = await U.getNativeDB().collection('mri')
        .findOne({ source: U.localBertURL, backup: { $exists: false } });

      return doc.mri.atlas.map((a) => a.name);
    };
    const deadline = Date.now() + U.longTimeout;
    let stable = false;
    while (busy() && Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      await U.delay(100);
    }
    while (!stable && Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      await setUpBrain();
      // eslint-disable-next-line no-await-in-loop
      await U.delay(500);
      // eslint-disable-next-line no-await-in-loop
      stable = JSON.stringify(await layerNamesStored()) === JSON.stringify(LAYERS.map((l) => l.name));
    }
    assert.isTrue(stable, 'the test brain\'s document has the test layers');
  };

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout * 3);
    browser = await puppeteer.launch({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    labelSets = (await chai.request(U.serverURL).get('/api/getLabelsets')).body;
    assert.isAtLeast(labelSets.length, 4);
    layerNames = LAYERS.map((l) => labelSets[l.labels].name);
    // the test brain, downloaded and read by the server
    opened = await openPage(browser);
    await opened.page.close();
    opened = null;
    await setUpBrainOnceIdle();
  });

  afterEach(async function () {
    if (opened && opened.page) { await opened.page.close(); }
    opened = null;
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

  it('has SortableTh\'s headers on Name, Value, Project and Modified, a plain Access header, and the MRI\'s order until a click', async function () {
    opened = await openPage(browser);
    for (const table of ['annotations', 'textAnnotations']) {
      // eslint-disable-next-line no-await-in-loop
      const headers = await opened.page.$$eval(`table#${table} thead th`, (ths) => ths.map((th) => {
        const btn = th.querySelector(':scope > button.nwl-sort-button');

        return {
          text: th.textContent.trim(),
          sortable: th.classList.contains('nwl-sortable'),
          button: btn ? [btn.getAttribute('type'), btn.querySelector(':scope > span.nwl-sort-label').textContent, btn.querySelector(':scope > svg.nwl-sort-indicator').getAttribute('data-state')] : null
        };
      }));
      assert.deepEqual(headers, COLUMNS.map((c) => (c === 'Access'
        ? { text: c, sortable: false, button: null }
        : { text: c, sortable: true, button: ['button', c, 'none'] })), table);
      // eslint-disable-next-line no-await-in-loop
      assert.deepEqual(await ariaSorts(table), sorts(null, 'none'), table);
    }
    assert.deepEqual(await column('annotations', 'Name'), LAYERS.map((l) => l.name), 'the MRI\'s order');
    assert.deepEqual(await column('annotations', 'Value'), layerNames);
    assert.deepEqual(await column('textAnnotations', 'Name'), TEXTS.map((t) => t.name), 'the page\'s order');
    assert.deepEqual(opened.pageErrors, []);
  }).timeout(U.longTimeout);

  it('sorts the volume annotations by Name, Value and Project, missing values last both ways, with aria-sort', async function () {
    opened = await openPage(browser);
    await clickHeader('annotations', 'Name');
    assert.deepEqual(await column('annotations', 'Name'), names(LAYERS, sortedBy(LAYERS, (l) => l.name)));
    assert.deepEqual(await ariaSorts('annotations'), sorts('Name', 'ascending'));
    await clickHeader('annotations', 'Name');
    assert.deepEqual(await column('annotations', 'Name'), names(LAYERS, sortedBy(LAYERS, (l) => l.name, false)));
    assert.strictEqual((await column('annotations', 'Name')).pop(), '', 'missing last');
    assert.deepEqual(await ariaSorts('annotations'), sorts('Name', 'descending'));
    await clickHeader('annotations', 'Value');
    assert.deepEqual(await column('annotations', 'Value'), sortedBy(layerNames, (n) => n).map((i) => layerNames[i]));
    await clickHeader('annotations', 'Project');
    assert.deepEqual(await column('annotations', 'Project'), sortedBy(LAYERS, (l) => l.project).map((i) => LAYERS[i].project));
    assert.deepEqual(await ariaSorts('annotations'), sorts('Project', 'ascending'));
    assert.deepEqual(await ariaSorts('textAnnotations'), sorts(null, 'none'), 'the other table is not sorted');
    assert.deepEqual(opened.pageErrors, []);
  }).timeout(U.longTimeout);

  it('sorts Modified by date, not by the text shown, in both tables', async function () {
    opened = await openPage(browser);
    await clickHeader('annotations', 'Modified');
    assert.deepEqual(await column('annotations', 'Name'), names(LAYERS, sortedBy(LAYERS, (l) => l.modified, true, byDate)));
    await clickHeader('annotations', 'Modified');
    assert.deepEqual(await column('annotations', 'Name'), names(LAYERS, sortedBy(LAYERS, (l) => l.modified, false, byDate)));
    await clickHeader('textAnnotations', 'Modified');
    assert.deepEqual(await column('textAnnotations', 'Name'), names(TEXTS, sortedBy(TEXTS, (t) => t.modified, true, byDate)));
    assert.deepEqual(await ariaSorts('textAnnotations'), sorts('Modified', 'ascending'));
    // what the cells show would sort otherwise
    const shown = await column('textAnnotations', 'Modified');
    assert.notDeepEqual([...shown].sort((a, b) => a.localeCompare(b)), shown);
  }).timeout(U.longTimeout);

  it('sorts the text annotations with Enter and Space on a header\'s button, missing values last', async function () {
    opened = await openPage(browser);
    await opened.page.focus(button('textAnnotations', 'Value'));
    await opened.page.keyboard.press('Enter');
    assert.deepEqual(await column('textAnnotations', 'Value'), sortedBy(TEXTS, (t) => t.data).map((i) => TEXTS[i].data));
    assert.deepEqual(await ariaSorts('textAnnotations'), sorts('Value', 'ascending'));
    await opened.page.keyboard.press('Space');
    assert.deepEqual(await column('textAnnotations', 'Value'), sortedBy(TEXTS, (t) => t.data, false).map((i) => TEXTS[i].data));
    assert.deepEqual(await ariaSorts('textAnnotations'), sorts('Value', 'descending'));
  }).timeout(U.longTimeout);

  it('selects the layer of the row clicked after a sort, and not on a header click', async function () {
    opened = await openPage(browser);
    await opened.page.evaluate(() => {
      window.__configured = [];
      AtlasMakerWidget.configureAtlasMaker = (info, index) => {
        window.__configured.push(index);

        return new Promise(() => null);
      };
    });
    await clickHeader('annotations', 'Name');
    const order = sortedBy(LAYERS, (l) => l.name);
    await opened.page.click('table#annotations tbody tr:nth-child(1) td:first-child');
    const state = await opened.page.evaluate(() => ({
      configured: window.__configured,
      selected: [...document.querySelectorAll('table#annotations tbody tr')].map((tr) => tr.classList.contains('selected'))
    }));
    assert.notStrictEqual(order[0], 0);
    assert.deepEqual(state.configured, [order[0]], 'the clicked row\'s layer, once (the header click selects nothing)');
    assert.deepEqual(state.selected, LAYERS.map((_l, i) => i === 0));
  }).timeout(U.longTimeout);

  it('changes the label set of the layer whose Value menu is changed after a sort', async function () {
    opened = await openPage(browser);
    await opened.page.evaluate(() => {
      window.__ontologies = [];
      const { configureOntology } = AtlasMakerWidget;
      AtlasMakerWidget.configureOntology = function (json) {
        window.__ontologies.push(json.name);

        return configureOntology.call(this, json);
      };
    });
    await clickHeader('annotations', 'Name');
    const [layer] = sortedBy(LAYERS, (l) => l.name);
    // a label set that neither this layer nor the first one has
    const target = labelSets.findIndex((_l, i) => i !== LAYERS[layer].labels && i !== LAYERS[0].labels);
    await opened.page.select('table#annotations tbody tr:nth-child(1) select', labelSets[target].name);
    await opened.page.waitForFunction(() => window.__ontologies.length > 0, { timeout: U.shortTimeout });
    const labels = (await chai.request(U.serverURL).get('/labels/' + labelSets[target].source)).body;
    const after = await opened.page.evaluate((i) => ({
      ontologies: window.__ontologies,
      layer: infoProxy[`mri.atlas.${i}.labels`],
      first: infoProxy['mri.atlas.0.labels']
    }), layer);
    assert.deepEqual(after, { ontologies: [labels.name], layer: labelSets[target].source, first: labelSets[LAYERS[0].labels].source });
    assert.isTrue(opened.requests.some((url) => url.endsWith('/labels/' + labelSets[target].source)));
    assert.deepEqual(opened.pageErrors, []);
  }).timeout(U.longTimeout);
});
