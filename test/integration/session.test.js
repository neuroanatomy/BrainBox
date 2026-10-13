'use strict';

// NeuroWebLab 0.2.0 (passport 0.7): the session is regenerated at login and
// keeps only a small user ({username, nickname, name, avatarURL, url, joined}).
// Login, returnTo, logout and token auth must still work, the pages must get
// the logged user, and sessions stored by earlier versions (whole user
// documents or GitHub profiles) must still be logged in.

const crypto = require('crypto');
const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');

const credentials = { username: 'session-test-user', password: 'session-pw' };
const privateProject = {
  ...U.privateProjectTest,
  name: 'Session Test Private Project',
  shortname: 'sessiontestprivateproject',
  brainboxURL: '/project/sessiontestprivateproject',
  owner: credentials.username
};

/* express-session's signed cookie (cookie-signature), with NeuroWebLab's secret */
const SESSION_SECRET = process.env.SESSION_SECRET || 'a mi no me gusta la sémola';
const sessionCookie = (sid) => {
  const mac = crypto.createHmac('sha256', SESSION_SECRET).update(sid)
    .digest('base64')
    .replace(/[=]+$/, '');

  return `connect.sid=${encodeURIComponent(`s:${sid}.${mac}`)}`;
};
const sidCookie = (res) => (res.headers['set-cookie'] || [])
  .map((c) => c.split(';')[0])
  .find((c) => c.startsWith('connect.sid='));

/* the `const loggedUser = {...};` a page gives to its scripts */
const pageLoggedUser = (html) => {
  const m = html.match(/const loggedUser = (.*);/);
  assert.isNotNull(m, 'the page has a loggedUser');

  return JSON.parse(m[1]);
};

/* sessions as connect-mongo 4 stored them with NeuroWebLab 0.0.1 (passport 0.4) */
const oldSessions = {
  local: {
    sid: 'brainbox-test-old-local-session',
    user: {
      nickname: 'session-old-local',
      username: 'session-old-local',
      strategy: 'local',
      passhash: '$2b$10$OLD.SESSION.PASSHASH.must.not.reach.any.page',
      joined: '2026-01-01T00:00:00.000Z'
    },
    expected: { username: 'session-old-local', nickname: 'session-old-local', joined: '2026-01-01T00:00:00.000Z' }
  },
  github: {
    sid: 'brainbox-test-old-github-session',
    user: {
      id: '123456',
      displayName: 'Old Github',
      username: 'session-old-github',
      profileUrl: 'https://github.com/session-old-github',
      photos: [{ value: 'https://avatars.example/old.png' }],
      provider: 'github',
      _raw: '{"login":"session-old-github","email":"old-github@example.org"}',
      _json: { login: 'session-old-github', avatar_url: 'https://avatars.example/old.png', blog: 'https://old.example', email: 'old-github@example.org' } // eslint-disable-line camelcase
    },
    expected: {
      username: 'session-old-github',
      nickname: 'session-old-github',
      name: 'Old Github',
      avatarURL: 'https://avatars.example/old.png',
      url: 'https://old.example'
    }
  }
};

describe('Sessions with NeuroWebLab 0.2.0', function () {
  // eslint-disable-next-line no-invalid-this
  this.timeout(U.mediumTimeout);

  before(async function () {
    await chai.request(U.serverURL).post('/localSignup')
      .send(credentials);
    const db = U.getNativeDB();
    const sessions = Object.values(oldSessions);
    await db.collection('sessions').deleteMany({ _id: { $in: sessions.map(({ sid }) => sid) } });
    await db.collection('sessions').insertMany(sessions.map(({ sid, user }) => ({
      _id: sid,
      expires: new Date(Date.now() + 24 * 3600 * 1000),
      session: JSON.stringify({
        cookie: { originalMaxAge: null, expires: null, httpOnly: true, path: '/' },
        passport: { user }
      })
    })));
    await U.insertUser({ ...oldSessions.local.user });
    await db.collection('project')
      .insertOne({ ...privateProject, collaborators: { list: [...privateProject.collaborators.list] } });
  });

  after(async function () {
    await U.getNativeDB().collection('sessions')
      .deleteMany({ _id: { $in: Object.values(oldSessions).map(({ sid }) => sid) } });
    await U.removeProject(privateProject.shortname);
    await U.removeUser(oldSessions.local.user.nickname);
    await U.removeUser(credentials.username);
  });

  describe('local login', function () {
    let agent;

    before(function () {
      agent = chai.request.agent(U.serverURL);
    });

    after(function () {
      agent.close();
    });

    it('goes back to the page that asked for it (returnTo), in a new session', async function () {
      const page = `/user/${credentials.username}`;
      let res = await agent.get(page);
      assert.equal(res.statusCode, 200);
      const before = sidCookie(res);
      assert.isString(before, 'visiting the page stores returnTo in a session');
      res = await agent.post('/localLogin').redirects(0)
        .send(credentials);
      assert.equal(res.statusCode, 301);
      assert.equal(res.headers.location, page);
      const after = sidCookie(res);
      assert.isString(after);
      assert.notEqual(after, before, 'the session is regenerated at login');
    });

    it('/loggedIn gives the username', async function () {
      const res = await agent.get('/loggedIn');
      assert.deepEqual(res.body, { loggedIn: true, username: credentials.username });
    });

    it('the pages get the logged user in the new shape', async function () {
      const paths = [`/user/${credentials.username}`, '/project/new', `/project/${U.projectTest.shortname}/settings`];
      const responses = await Promise.all(paths.map((path) => agent.get(path)));
      responses.forEach((res, i) => {
        const path = paths[i];
        assert.equal(res.statusCode, 200, path);
        const loggedUser = pageLoggedUser(res.text);
        assert.sameMembers(Object.keys(loggedUser), ['username', 'nickname', 'joined'], path);
        assert.equal(loggedUser.username, credentials.username, path);
        assert.equal(loggedUser.nickname, credentials.username, path);
        assert.notInclude(res.text, 'passhash', path);
      });
    });

    it('the owner can open a private project page; others cannot', async function () {
      const res = await agent.get(`/project/${privateProject.shortname}`);
      assert.equal(res.statusCode, 200);
      assert.include(res.text, privateProject.name);
      const anonymous = await chai.request(U.serverURL).get(`/project/${privateProject.shortname}`);
      assert.equal(anonymous.statusCode, 401);
    });

    it('a token from /token authenticates, also after logout', async function () {
      let res = await agent.get('/token');
      assert.equal(res.statusCode, 200);
      const { token } = res.body;
      assert.isString(token);

      res = await agent.get('/logout').redirects(0);
      assert.equal(res.statusCode, 302);
      res = await agent.get('/loggedIn');
      assert.deepEqual(res.body, { loggedIn: false });
      res = await agent.get('/token');
      assert.equal(res.statusCode, 401);

      // anonymous: asked to log in; with the token: known, but not an admin
      res = await chai.request(U.serverURL).get('/admin');
      assert.equal(res.statusCode, 200);
      res = await chai.request(U.serverURL).get('/admin')
        .query({ token });
      assert.equal(res.statusCode, 403);
    });

    it('a failed login stays logged out', async function () {
      const other = chai.request.agent(U.serverURL);
      try {
        const res = await other.post('/localLogin').redirects(0)
          .send({ username: credentials.username, password: 'wrong' });
        assert.equal(res.statusCode, 302);
        assert.equal(res.headers.location, '/html/localsignin.html');
        assert.deepEqual((await other.get('/loggedIn')).body, { loggedIn: false });
      } finally {
        other.close();
      }
    });
  });

  const checkOldSession = async ({ sid, user, expected }) => {
    const cookie = sessionCookie(sid);
    let res = await chai.request(U.serverURL).get('/loggedIn')
      .set('Cookie', cookie);
    assert.deepEqual(res.body, { loggedIn: true, username: user.username });

    res = await chai.request(U.serverURL).get('/project/new')
      .set('Cookie', cookie);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(pageLoggedUser(res.text), expected);
    assert.notInclude(res.text, 'passhash');
    assert.notInclude(res.text, 'example.org');
  };

  it('a local-login session stored by NeuroWebLab 0.0.1 stays logged in, reduced', async function () {
    await checkOldSession(oldSessions.local);
  });

  it('a GitHub session stored by NeuroWebLab 0.0.1 stays logged in, reduced', async function () {
    await checkOldSession(oldSessions.github);
  });
});
