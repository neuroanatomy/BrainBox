'use strict';

// Over the real stack (T002 R4c): the server relays chats and user data as
// they are, without the DOMPurify pass the other messages still go through
// (the viewers show names and chats as text). A chat holding HTML, quotes
// and '&' reaches the others intact, under the session's name, and each
// sender's chats arrive in the order they were sent.

const { assert } = require('chai');
const WebSocket = require('ws');
const U = require('../utils.js');
const F = require('../mri-access-fixtures.js');

// a name holding HTML and quotes, as a session may have it
const NAME = 'ws-chat-<i>"r4c"</i>&co';
const HTML_CHAT = '<b>"quoted"</b> & more';

/**
 * Open a socket, as the viewer does, and keep the JSON messages it receives
 * @param {object} options { cookie }
 * @returns {Promise<object>} { socket, messages, uid, until }
 */
const connect = ({ cookie } = {}) => new Promise((resolve, reject) => {
  const known = new Set(U.getAtlasmakerServer().US);
  const socket = new WebSocket(U.wsURL, cookie ? { headers: { Cookie: cookie } } : {});
  const received = { socket, messages: [], waiters: [] };
  received.until = (condition) => new Promise((done) => {
    const check = () => {
      if (condition()) { done(); }

      return condition();
    };
    if (!check()) { received.waiters.push(check); }
  });
  socket.on('error', reject);
  socket.on('message', (data) => {
    if (typeof data === 'string') {
      received.messages.push(JSON.parse(data));
    }
    received.waiters = received.waiters.filter((w) => !w());
  });
  socket.on('open', () => {
    const us = U.getAtlasmakerServer().US.find((o) => o && !known.has(o) && o.socket);
    received.uid = us && us.uid;
    resolve(received);
  });
});

const someUser = (username) => ({ username, dirname: '/data/ws-chat-test/', mri: 'brain.nii.gz', view: 'sag', slice: 1 });
const sendUser = (received, username) => received.socket.send(JSON.stringify({ type: 'userData', description: 'allUserData', user: someUser(username) }));
const chatsOf = (received, uid) => received.messages.filter((m) => m.type === 'chat' && m.uid === uid);

describe('WebSocket: chats and user data relayed as they are', function () {
  // eslint-disable-next-line no-invalid-this
  this.timeout(U.mediumTimeout);

  const sockets = [];
  let observer;
  let sender;

  before(async function () {
    await F.addSession(NAME);
    observer = await connect();
    sockets.push(observer.socket);
    sendUser(observer, 'observer');
    sender = await connect({ cookie: F.cookie(NAME) });
    sockets.push(sender.socket);
    sendUser(sender, 'someone-else');
  });

  after(async function () {
    for (const socket of sockets) {
      socket.close();
    }
    await F.removeSession(NAME);
  });

  it('relays a chat holding HTML, quotes and & intact, under the session\'s name', async function () {
    sender.socket.send(JSON.stringify({ type: 'chat', msg: HTML_CHAT, username: 'someone-else', extra: '<x>' }));
    await observer.until(() => chatsOf(observer, sender.uid).length > 0);
    assert.deepEqual(chatsOf(observer, sender.uid)[0], { type: 'chat', msg: HTML_CHAT, username: NAME, uid: sender.uid }, 'only the known fields, the text as sent');
  });

  it('relays the user data of a name holding HTML intact', async function () {
    await observer.until(() => observer.messages.some((m) => m.type === 'userData' && m.uid === sender.uid));
    const data = observer.messages.find((m) => m.type === 'userData' && m.uid === sender.uid);
    assert.strictEqual(data.user.username, NAME);
  });

  it('relays each sender\'s chats in the order they were sent', async function () {
    const from = chatsOf(observer, sender.uid).length;
    const texts = ['first & <b>one</b>', 'second "two"', 'third'];
    for (const msg of texts) {
      sender.socket.send(JSON.stringify({ type: 'chat', msg }));
    }
    await observer.until(() => chatsOf(observer, sender.uid).length >= from + texts.length);
    assert.deepEqual(chatsOf(observer, sender.uid).slice(from)
      .map((m) => m.msg), texts);
  });
});
