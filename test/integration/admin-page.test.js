'use strict';

const chai = require('chai');
const { assert, expect } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');
const admins = require('../../controller/admin/admins');

const goneProject = 'adminpagegone';
const source = 'http://admin-page-test.localhost/brain.nii.gz';
const damagedProject = 'adminpagedamaged';
const damagedSource = (i) => `http://admin-page-test.localhost/damaged/${i}.nii.gz`;
const damagedFiles = Array.from({ length: 150 }, (_x, i) => damagedSource(i));
const projectVersion = (list, modified, backup) => ({
  ...U.projectTest,
  shortname: damagedProject,
  brainboxURL: `/project/${damagedProject}`,
  files: { list },
  modified,
  modifiedBy: 'someone',
  ...(backup ? { backup: true } : {})
});

// the damaged projects section is nwl-components' DamagedProjects (3.7.0): a block per project, no time, no undo
const projectBlock = `#projects div.project[data-shortname="${damagedProject}"]`;
// the list has been read (again)
const listRead = (page) => page.waitForFunction(() => {
  const button = document.querySelector('#projects button.find-damaged');

  return button && !button.disabled && button.textContent.trim() === 'Reload';
}, { timeout: U.mediumTimeout });

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

    // a project whose last save kept only the first 100 of its 150 files
    await U.getNativeDB().collection('project')
      .insertMany([
        projectVersion(damagedFiles, '2024-01-01T00:00:00.000Z', true),
        projectVersion(damagedFiles.slice(0, 100), '2024-06-07T14:29:59.623Z', false)
      ]);

    browser = await U.launchBrowser({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
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
    await U.getNativeDB().collection('project')
      .deleteMany({ shortname: damagedProject });
    await U.getNativeDB().collection('log')
      .deleteMany({ key: 'adminRestoreProjectFiles', 'value.shortname': damagedProject });
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

  it('leaves space between the columns of its tables', async function () {
    const gaps = await page.$$eval('table tr', (rows) => rows.flatMap((tr) => [...tr.cells].slice(0, -1)
      .map((td) => parseFloat(getComputedStyle(td).paddingRight) + parseFloat(getComputedStyle(td.nextElementSibling).paddingLeft))));
    assert.isNotEmpty(gaps);
    assert.isTrue(gaps.every((gap) => gap >= 8), `gaps: ${gaps}`);
  });

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

  it('finds a project damaged by an incomplete save', async function () {
    await page.click('#projects button.find-damaged');
    await page.waitForSelector(projectBlock, { timeout: U.mediumTimeout });
    const counts = await page.$eval(`${projectBlock} p.counts`, (el) => el.textContent.replace(/\s+/g, ' ').trim());
    assert.equal(counts, 'incomplete save 100 file(s) now, 2 version(s), 50 file(s) missing');
    assert.equal(await page.$eval(`${projectBlock} .owner`, (el) => el.textContent), `owner: ${U.projectTest.owner}`);

    const text = await page.$eval(`${projectBlock} li.event`, (el) => el.textContent.replace(/\s+/g, ' '));
    assert.include(text, '2024-06-07 by someone');
    assert.notMatch(text, /\d\d:\d\d/, 'the dates show no time');
    assert.include(text, '150 → 100 files');
    assert.include(text, '50 still missing');
  }).timeout(U.longTimeout);

  it('keeps the 409 of a restore shown after the list is read again', async function () {
    // a save after the list was read: the restore is refused (409)
    await U.getNativeDB().collection('project')
      .updateOne({ shortname: damagedProject, backup: { $exists: false } }, { $set: { description: 'changed since listed' } });
    await page.click(`${projectBlock} button.restore-files`);
    await page.waitForSelector('#projects p.error', { timeout: U.mediumTimeout });
    await listRead(page);
    await page.waitForSelector(projectBlock, { timeout: U.shortTimeout });
    assert.equal(await page.$eval('#projects p.error', (el) => el.textContent.trim()), `Project ${damagedProject} has changed since it was listed: reload the list`);
    assert.equal(await page.$eval('#projects p.error', (el) => el.getAttribute('role')), 'alert');
    assert.isNull(await page.$('#projects p.result'));
    assert.lengthOf((await U.queryProject(damagedProject)).files.list, 100, 'nothing was stored');
  }).timeout(U.longTimeout);

  it('restores its files with the token of the list read again', async function () {
    await page.click(`${projectBlock} button.restore-files`);
    await page.waitForSelector('#projects p.result', { timeout: U.mediumTimeout });
    assert.include(await page.$eval('#projects p.result', (el) => el.textContent), `${damagedProject}: restored 50 file(s), it has 150 now.`);
    assert.isNull(await page.$('#projects button.undo-restore-files'), 'no undo');

    const project = await U.queryProject(damagedProject);
    assert.deepEqual(project.files.list, damagedFiles);
    assert.equal(project.modifiedBy, U.testingCredentials.username);
    // the list is read again, without the project
    await listRead(page);
    await page.waitForFunction((selector) => !document.querySelector(selector), { timeout: U.mediumTimeout }, projectBlock);
    assert.isNull(await page.$('#projects p.error'));
  }).timeout(U.longTimeout);
});
