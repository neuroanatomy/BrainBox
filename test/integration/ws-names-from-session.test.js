/* eslint-disable max-lines */
/* global AtlasMakerWidget */
'use strict';

// Over the real stack: who a WebSocket user is, as the other users are told
// it (in the user data relayed and replayed to a new connection, and in the
// chat), is the user of the session cookie sent with the upgrade request, or
// 'Anonymous', never the name the client sends. Chat messages that are not
// strings of at most 1000 characters reach no one; an embed connection may not
// chat, and is sent no chat. In the viewer, the names and messages of the
// other users are shown as text, never as HTML.

const { assert } = require('chai');
const WebSocket = require('ws');
const U = require('../utils.js');
const F = require('../mri-access-fixtures.js');
const EmbedAccessService = require('../../services/EmbedAccessService');

const wshost = U.wsURL;

const ALICE = 'ws-names-alice';
// a hostile name: script, if a page puts it in as HTML
const HOSTILE = '<img src=x onerror="window.__h1=1">';
const HOSTILE_MSG = '<b>bold</b><img src=x onerror="window.__h1=2">';

/**
 * Open a socket, as the viewer does
 * @param {object} options { cookie, ticket }
 * @returns {Promise<object>} { socket, messages, uid }: the JSON messages it receives
 */
const connect = ({ cookie, ticket } = {}) => new Promise((resolve, reject) => {
  const known = new Set(U.getAtlasmakerServer().US);
  const socket = new WebSocket(wshost + (ticket ? `?embedTicket=${ticket}` : ''), cookie ? { headers: { Cookie: cookie } } : {});
  const received = { socket, messages: [], waiters: [] };
  socket.on('error', reject);
  socket.on('message', (data) => {
    if (typeof data === 'string') {
      // the server's DOMPurify pass makes some messages invalid JSON (see the viewer test)
      try {
        received.messages.push(JSON.parse(data));
      } catch (err) {
        received.messages.push({ invalid: data });
      }
    }
    received.waiters = received.waiters.filter((w) => !w());
  });
  socket.on('open', () => {
    const us = U.getAtlasmakerServer().US.find((o) => o && !known.has(o) && o.socket);
    received.uid = us && us.uid;
    resolve(received);
  });
});

/**
 * Wait until a condition on what a connection received holds
 * @param {object} received What connect gave
 * @param {function} condition () => boolean
 * @returns {Promise<void>} Once it holds
 */
const until = (received, condition) => new Promise((resolve) => {
  if (condition()) {
    resolve();

    return;
  }
  received.waiters.push(() => {
    if (condition()) {
      resolve();

      return true;
    }

    return false;
  });
});

// a user that does not ask for a layer (no 'sendAtlas'): its data and chats are still relayed
const someUser = (username) => ({ username, dirname: '/data/ws-names-test/', mri: 'brain.nii.gz', view: 'sag', slice: 1 });
const sendUser = (received, username) => received.socket.send(JSON.stringify({ type: 'userData', description: 'allUserData', user: someUser(username) }));
const chat = (received, msg, username) => received.socket.send(JSON.stringify({ type: 'chat', msg, username }));

const userDataOf = (received, uid) => received.messages.filter((m) => m.type === 'userData' && m.uid === uid);
const chatsOf = (received, uid) => received.messages.filter((m) => m.type === 'chat' && m.uid === uid);

describe('WebSocket: names come from the session, and are shown as text', function () {
  // eslint-disable-next-line no-invalid-this
  this.timeout(U.mediumTimeout);

  const sockets = [];
  const tickets = [];
  let observer;

  const open = async (options) => {
    const received = await connect(options);
    sockets.push(received.socket);

    return received;
  };

  before(async function () {
    await F.addSession(ALICE);
    observer = await open();
    sendUser(observer, 'observer');
  });

  after(async function () {
    for (const socket of sockets) {
      socket.close();
    }
    await F.removeSession(ALICE);
    await U.getNativeDB().collection(EmbedAccessService.WS_TICKET_COLLECTION)
      .deleteMany({ token: { $in: tickets } });
  });

  it('relays the user data of a logged-in user under the session\'s name, not the one it sends', async function () {
    const alice = await open({ cookie: F.cookie(ALICE) });
    sendUser(alice, 'someone-else');
    await until(observer, () => userDataOf(observer, alice.uid).length > 0);
    assert.strictEqual(userDataOf(observer, alice.uid)[0].user.username, ALICE);
    assert.strictEqual(U.getAtlasmakerServer().US.find((us) => us && us.uid === alice.uid).User.username, ALICE, 'stored under the session\'s name');
  });

  it('relays the user data of an anonymous user as \'Anonymous\'', async function () {
    const anonymous = await open();
    sendUser(anonymous, 'someone-else');
    await until(observer, () => userDataOf(observer, anonymous.uid).length > 0);
    assert.strictEqual(userDataOf(observer, anonymous.uid)[0].user.username, 'Anonymous');
    assert.strictEqual(U.getAtlasmakerServer().US.find((us) => us && us.uid === anonymous.uid).User.username, 'Anonymous');
  });

  it('does not let a user change its name or id afterwards', async function () {
    const alice = await open({ cookie: F.cookie(ALICE) });
    sendUser(alice, ALICE);
    alice.socket.send(JSON.stringify({ type: 'userData', description: JSON.stringify({ username: 'someone-else', uid: 'u1', slice: 3 }) }));
    await until(observer, () => userDataOf(observer, alice.uid).length > 1);
    assert.deepEqual(JSON.parse(userDataOf(observer, alice.uid)[1].description), { slice: 3 }, 'the others are told only the slice');
    const stored = U.getAtlasmakerServer().US.find((us) => us && us.uid === alice.uid).User;
    assert.strictEqual(stored.username, ALICE);
    assert.strictEqual(stored.uid, alice.uid);
    assert.strictEqual(stored.slice, 3);
  });

  it('relays a chat under the session\'s name, or \'Anonymous\', not the one sent', async function () {
    const alice = await open({ cookie: F.cookie(ALICE) });
    sendUser(alice, ALICE);
    const anonymous = await open();
    sendUser(anonymous, 'Anonymous');
    chat(alice, 'hello from alice', 'someone-else');
    chat(anonymous, 'hello from nobody', ALICE);
    await until(observer, () => chatsOf(observer, alice.uid).length > 0 && chatsOf(observer, anonymous.uid).length > 0);
    assert.deepInclude(chatsOf(observer, alice.uid)[0], { msg: 'hello from alice', username: ALICE });
    assert.deepInclude(chatsOf(observer, anonymous.uid)[0], { msg: 'hello from nobody', username: 'Anonymous' });
  });

  it('relays no chat that is longer than 1000 characters or not a string', async function () {
    const sender = await open();
    sendUser(sender, 'Anonymous');
    chat(sender, 'x'.repeat(1001));
    sender.socket.send(JSON.stringify({ type: 'chat', msg: { text: 'not a string' } }));
    sender.socket.send(JSON.stringify({ type: 'chat' }));
    chat(sender, 'y'.repeat(1000));
    // the messages of a connection are handled in order: once the last one is there, the others would be too
    await until(observer, () => chatsOf(observer, sender.uid).length > 0);
    assert.deepEqual(chatsOf(observer, sender.uid).map((m) => m.msg), ['y'.repeat(1000)]);
  });

  it('refuses the chat of an embed connection, and sends no chat to one', async function () {
    const ticket = await EmbedAccessService.mintWsTicket(U.getNativeDB(), { dirname: '/data/ws-names-test/', mriSource: 'ws-names-test' });
    tickets.push(ticket);
    const embed = await open({ ticket });
    sendUser(embed, 'Anonymous');
    chat(embed, 'from the embed');
    await until(embed, () => embed.messages.some((m) => m.type === 'writeRefused'));
    assert.deepInclude(embed.messages.find((m) => m.type === 'writeRefused'), { write: 'chat' });

    const alice = await open({ cookie: F.cookie(ALICE) });
    sendUser(alice, ALICE);
    chat(alice, 'not for embeds');
    // after the chat, a change the embed is sent: once it has it, it would have the chat
    alice.socket.send(JSON.stringify({ type: 'userData', description: JSON.stringify({ slice: 5 }) }));
    await until(embed, () => userDataOf(embed, alice.uid).some((m) => m.description !== 'allUserData'));
    await until(observer, () => chatsOf(observer, alice.uid).length > 0);
    assert.isEmpty(chatsOf(observer, embed.uid), 'the embed\'s chat reached no one');
    assert.isEmpty(embed.messages.filter((m) => m.type === 'chat'), 'the embed is sent no chat');
  });

  it('replays the users already connected to a new connection under their sessions\' names', async function () {
    const alice = await open({ cookie: F.cookie(ALICE) });
    sendUser(alice, 'someone-else');
    const anonymous = await open();
    sendUser(anonymous, ALICE);
    // both are stored once the observer is told
    await until(observer, () => userDataOf(observer, alice.uid).length > 0 && userDataOf(observer, anonymous.uid).length > 0);
    const late = await open();
    const replayed = (uid) => userDataOf(late, uid).find((m) => m.description === 'allUserData');
    await until(late, () => replayed(alice.uid) && replayed(anonymous.uid));
    assert.strictEqual(replayed(alice.uid).user.username, ALICE);
    assert.strictEqual(replayed(anonymous.uid).user.username, 'Anonymous');
  });

  // Every relayed message goes through the server's DOMPurify pass (on its
  // JSON text), which makes a message holding HTML with quoted attributes
  // invalid JSON: the other viewer drops the hostile user's chats (they carry
  // the name; R4 revisits that pass). So the hostile chat is given to the
  // viewer's handler, as a server without that pass would relay it; the name
  // comes as the server replays it to a new viewer (no such pass), and the
  // pointer and "left" lines for real
  // eslint-disable-next-line max-statements
  it('the viewer shows another user\'s name and chat as text, never as HTML', async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout * 3);
    await U.waitForTestBrain(U.longTimeout);
    const browser = await U.launchBrowser({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
      const openViewer = async (page) => {
        const pageErrors = [];
        page.on('pageerror', (err) => pageErrors.push(err.message));
        await U.blockExternalRequests(page);
        await page.goto(`${U.serverURL}/mri?url=${U.localBertURL}`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.AtlasMakerWidget && AtlasMakerWidget.isViewerReady() && AtlasMakerWidget.flagConnected === 1, { timeout: U.longTimeout });

        return pageErrors;
      };
      const chatText = (page) => page.evaluate(() => document.querySelector('#logChat .text').textContent);
      // the hostile user: their name is the session's
      const hostile = await F.newLoggedInPage(browser, HOSTILE);
      const hostileErrors = await openViewer(hostile);
      // the other user, who sees the hostile user's name and messages
      const other = await browser.newPage();
      const otherErrors = await openViewer(other);
      await other.waitForFunction((name) => document.querySelector('#logChat .text').textContent.includes(name + ' entered'), { timeout: U.mediumTimeout }, HOSTILE);

      // the hostile user's pointer, which the other user sees with their name
      await hostile.evaluate(() => AtlasMakerWidget.sendShowMessage({ c: 'm', x: 10, y: 10 }));
      await other.waitForFunction(() => [...document.querySelectorAll('#resizable > div')].some((el) => el.querySelector(':scope > img')), { timeout: U.mediumTimeout });

      const seen = await other.evaluate(({ name, msg }) => {
        const me = AtlasMakerWidget;
        const uid = Object.keys(me.Collab).find((u) => me.Collab[u] && me.Collab[u].username === name);
        me.receiveChatMessage({ type: 'chat', uid, username: name, msg });
        const log = document.querySelector('#logChat .text');

        return {
          h1: typeof window.__h1,
          text: log.textContent,
          tags: [...log.querySelectorAll('*')].map((el) => el.tagName.toLowerCase()),
          links: [...log.querySelectorAll('a')].map((a) => a.href),
          pointers: [...document.querySelectorAll('#resizable > div')].filter((el) => el.querySelector(':scope > img'))
            .map((el) => ({ text: el.textContent, imgs: el.querySelectorAll('img').length }))
        };
      }, { name: HOSTILE, msg: HOSTILE_MSG });
      assert.isEmpty(otherErrors);
      // the hostile user's own page is sent messages that hold its name (the
      // saved MRI's modifiedBy): the server's pass makes them invalid JSON
      assert.isTrue(hostileErrors.every((m) => (/JSON/).test(m)), hostileErrors.join('\n'));
      assert.strictEqual(seen.h1, 'undefined', 'no script ran in the other user\'s page');
      assert.include(seen.text, HOSTILE + ' entered');
      assert.include(seen.text, HOSTILE + ': ' + HOSTILE_MSG);
      assert.deepEqual([...new Set(seen.tags)].sort(), ['a', 'b', 'br'], 'only the chat\'s own elements: none from the name or the message');
      assert.lengthOf(seen.links, 1);
      const link = new URL(seen.links[0]);
      assert.strictEqual(link.origin, new URL(U.serverURL).origin);
      assert.strictEqual(link.pathname, '/mri');
      assert.strictEqual(link.searchParams.get('url'), U.localBertURL);
      assert.deepEqual(seen.pointers, [{ text: HOSTILE, imgs: 1 }], 'the pointer shows the name as text, next to its icon');

      // the sender's own copy of the message
      await hostile.evaluate((msg) => {
        document.getElementById('msg').value = msg;
        AtlasMakerWidget.sendChatMessage();
      }, HOSTILE_MSG);
      assert.include(await chatText(hostile), 'me: ' + HOSTILE_MSG);
      assert.strictEqual(await hostile.evaluate(() => typeof window.__h1), 'undefined', 'no script ran in the sender\'s page');

      // the hostile user leaves
      await hostile.close();
      await other.waitForFunction((name) => document.querySelector('#logChat .text').textContent.includes(name + ' left'), { timeout: U.mediumTimeout }, HOSTILE);
      assert.strictEqual(await other.evaluate(() => typeof window.__h1), 'undefined');
      assert.deepEqual(await other.evaluate(() => [...new Set([...document.querySelectorAll('#logChat .text *')].map((el) => el.tagName.toLowerCase()))].sort()), ['a', 'b', 'br']);
    } finally {
      await browser.close();
      await F.removeSession(HOSTILE);
    }
  });
});
