'use strict';

const chai = require('chai');
const { assert, expect } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const puppeteer = require('puppeteer');
const U = require('../utils.js');
const admins = require('../../controller/admin/admins');

const goneProject = 'adminpagegone';
const source = 'http://admin-page-test.localhost/brain.nii.gz';

const volume = (filename, project) => ({
  name: '',
  project,
  filename,
  owner: 'Anonymous',
  created: '2021-04-15T07:31:57.301Z',
  labels: 'corpus_callosum.json',
  type: 'volume',
  vectorial: []
});

describe('TESTING THE ADMIN PAGE', function () {
  let browser;
  let page;
  let cookies;
  let agent;
  let previousAdmins;

  before(async function () {
    this.timeout(U.longTimeout); // eslint-disable-line no-invalid-this
    agent = chai.request.agent(U.serverURL);
    await agent.post('/localSignup')
      .send(U.testingCredentials);
    const res = await agent.post('/localLogin').redirects(0)
      .send(U.testingCredentials);
    expect(res).to.have.cookie('connect.sid');
    cookies = U.parseCookies(res.headers['set-cookie'][0]);

    previousAdmins = admins.getAdmins();
    admins.setAdmins([U.testingCredentials.username]);

    await U.getNativeDB().collection('mri')
      .insertOne({
        source,
        name: 'Admin page test brain',
        mri: {
          atlas: [
            { name: 'Default', filename: 'Atlas.nii.gz', labels: 'foreground.json', type: 'volume' },
            volume('gone1.nii.gz', goneProject),
            volume('gone2.nii.gz', goneProject),
            volume('live1.nii.gz', U.projectTest.shortname)
          ],
          annotations: { [goneProject]: { Comments: { value: 'a comment' } } }
        }
      });

    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    page = await browser.newPage();
    await U.blockExternalRequests(page);
    await page.setCookie(...cookies);
    page.on('dialog', (dialog) => dialog.accept());
  });

  after(async function () {
    this.timeout(U.longTimeout); // eslint-disable-line no-invalid-this
    if (page) { await page.close(); }
    if (browser) { await browser.close(); }
    admins.setAdmins(previousAdmins);
    await U.getNativeDB().collection('mri')
      .deleteMany({ source });
    await U.getNativeDB().collection('log')
      .deleteMany({ key: 'adminRemoveAnnotations', 'value.source': source });
    agent.close();
    await U.removeUser(U.testingCredentials.username);
  });

  it('lists the missing project among the orphan annotations', async function () {
    await page.goto(`${U.serverURL}/admin?url=${encodeURIComponent(source)}`);
    await page.waitForFunction((project) => [...document.querySelectorAll('#orphans td code')]
      .some((el) => el.textContent === project), { timeout: U.mediumTimeout }, goneProject);
  }).timeout(U.longTimeout);

  it('shows the annotations of the MRI given in the url', async function () {
    await page.waitForSelector('#mri tbody tr', { timeout: U.mediumTimeout });
    const filenames = await page.$$eval('#mri table:first-of-type tbody tr td:last-child code', (els) => els.map((el) => el.textContent));
    assert.deepEqual(filenames, ['Atlas.nii.gz', 'gone1.nii.gz', 'gone2.nii.gz', 'live1.nii.gz']);
  }).timeout(U.longTimeout);

  it('selects the annotations of a project and removes them', async function () {
    await page.select('#mri select', goneProject);
    const checked = await page.$$eval('#mri input[type=checkbox]:checked', (els) => els.map((el) => el.value));
    assert.deepEqual(checked, ['gone1.nii.gz', 'gone2.nii.gz']);

    await page.click('#mri button.danger');
    await page.waitForSelector('#mri .result', { timeout: U.mediumTimeout });
    const result = await page.$eval('#mri .result', (el) => el.textContent);
    assert.include(result, 'Removed 2 volume and 0 text');

    const filenames = await page.$$eval('#mri table:first-of-type tbody tr td:last-child code', (els) => els.map((el) => el.textContent));
    assert.deepEqual(filenames, ['Atlas.nii.gz', 'live1.nii.gz']);

    const mri = await U.getNativeDB().collection('mri')
      .findOne({ source, backup: { $exists: false } });
    assert.deepEqual(mri.mri.atlas.map((a) => a.filename), ['Atlas.nii.gz', 'live1.nii.gz']);
    assert.equal(mri.modifiedBy, U.testingCredentials.username);
  }).timeout(U.longTimeout);
});
