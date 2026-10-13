'use strict';

// T004 (coordination folder): user documents only leave the server through an
// allow-list of public fields. A user created with local login has a `passhash`
// in its document, and NeuroWebLab puts the whole document in the session.

const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
const puppeteer = require('puppeteer');
chai.use(chaiHttp);
const U = require('../utils.js');

const PUBLIC_FIELDS = ['nickname', 'name', 'avatarURL', 'url', 'joined'];

const secretHash = '$2b$10$INTEGRATION.TEST.PASSHASH.never.leaves';
const exposed = {
  strategy: 'local',
  nickname: 'exposure-test-user',
  name: 'Exposure Test',
  url: 'https://exposure.example',
  brainboxURL: '/user/exposure-test-user',
  avatarURL: 'https://exposure.example/avatar.png',
  joined: '2026-10-12T00:00:00.000Z',
  passhash: secretHash,
  email: 'exposure@example.org'
};
// a GitHub display name may hold quotes and entities; the page must show it as text
const quoted = { nickname: 'exposure-quoted-user', name: 'O\'Brien &quot;Q&quot; <i>x</i>', joined: '2026-10-12T00:00:00.000Z' };
const credentials = { username: 'exposure-local-login', password: 'exposure-pw' };

describe('User documents are not exposed (T004)', function () {
  // eslint-disable-next-line no-invalid-this
  this.timeout(U.mediumTimeout);

  let agent;
  let ownHash;

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    await U.insertUser({ ...exposed });
    await U.insertUser({ ...quoted });
    agent = chai.request.agent(U.serverURL);
    await agent.post('/localSignup').send(credentials);
    const res = await agent.post('/localLogin').redirects(0)
      .send(credentials);
    assert.equal(res.statusCode, 301);
    ({ passhash: ownHash } = await U.queryUser(credentials.username));
    assert.isString(ownHash);
  });

  after(async function () {
    agent.close();
    await U.removeUser(exposed.nickname);
    await U.removeUser(quoted.nickname);
    await U.removeUser(credentials.username);
  });

  it('GET /user/json/:userName sends only the public fields', async function () {
    const res = await chai.request(U.serverURL).get(`/user/json/${exposed.nickname}`);
    assert.equal(res.statusCode, 200);
    assert.sameMembers(Object.keys(res.body), PUBLIC_FIELDS);
    assert.equal(res.body.name, exposed.name);
    assert.notInclude(res.text, secretHash);
    assert.notInclude(res.text, exposed.email);
  });

  it('GET /user/json/:userName?var= cannot reach a private field', async function () {
    const privateVars = ['passhash', 'email', 'strategy'];
    const responses = await Promise.all(privateVars.map((v) => chai.request(U.serverURL)
      .get(`/user/json/${exposed.nickname}`)
      .query({ var: v })));
    responses.forEach((res, i) => {
      assert.equal(res.statusCode, 200, privateVars[i]);
      assert.equal(res.text, '', `?var=${privateVars[i]}`);
    });
    const res = await chai.request(U.serverURL).get(`/user/json/${exposed.nickname}`)
      .query({ var: 'name' });
    assert.equal(res.text, exposed.name);
  });

  it('GET /user/json/<unknown> sends an empty response', async function () {
    const res = await chai.request(U.serverURL).get('/user/json/no-such-user-t004');
    assert.equal(res.statusCode, 200);
    assert.equal(res.text, '');
  });

  it('GET /user/:userName does not embed the private fields', async function () {
    const res = await chai.request(U.serverURL).get(`/user/${exposed.nickname}`);
    assert.equal(res.statusCode, 200);
    assert.include(res.text, exposed.name);
    assert.notInclude(res.text, secretHash);
    assert.notInclude(res.text, exposed.email);
    assert.notInclude(res.text, '"strategy"');
  });

  it('GET /user/<unknown> answers 404', async function () {
    const res = await chai.request(U.serverURL).get('/user/no-such-user-t004');
    assert.equal(res.statusCode, 404);
  });

  it('pages do not embed the logged user\'s own passhash', async function () {
    const paths = [`/user/${credentials.username}`, `/user/${exposed.nickname}`, '/project/new', `/project/${U.projectTest.shortname}/settings`];
    const responses = await Promise.all(paths.map((path) => agent.get(path)));
    responses.forEach((res, i) => {
      assert.equal(res.statusCode, 200, paths[i]);
      assert.include(res.text, `"username":"${credentials.username}"`, paths[i]);
      assert.notInclude(res.text, ownHash, paths[i]);
      assert.notInclude(res.text, 'passhash', paths[i]);
    });
  });

  describe('in a browser', function () {
    let browser;
    let page;

    before(async function () {
      // eslint-disable-next-line no-invalid-this
      this.timeout(U.longTimeout);
      browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      page = await browser.newPage();
      await U.blockExternalRequests(page);
    });

    after(async function () {
      if (page) { await page.close(); }
      if (browser) { await browser.close(); }
    });

    const checkNameShown = async (u) => {
      await page.goto(`${U.serverURL}/user/${u.nickname}`);
      const h1 = await page.waitForFunction(() => document.querySelector('main h1'), { timeout: U.mediumTimeout });
      assert.equal(await h1.evaluate((el) => el.textContent), u.name);
      assert.equal(await page.evaluate(() => document.querySelector('main h2').textContent), u.nickname);
    };

    it('the user page shows the user\'s name', async function () {
      await checkNameShown(exposed);
    }).timeout(U.longTimeout);

    it('the user page shows a name with quotes and entities as text', async function () {
      await checkNameShown(quoted);
    }).timeout(U.longTimeout);
  });

  it('the server is still up', async function () {
    const res = await chai.request(U.serverURL).get('/');
    assert.equal(res.statusCode, 200);
  });
});
