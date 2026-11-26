/* eslint-disable max-lines */
// The viewer's chat, the admin's notice and the reconnection (T002 R4c):
// - a chat holding HTML, quotes and '&' is shown as text, as it was typed;
// - the admin's notice (a 'serverMessage') is shown as text, never as HTML;
// - after the WebSocket closes, the wait before reconnecting doubles from 1 s
//   but never exceeds 30 s, and starts again from 1 s after a connection that
//   stayed open 10 s (as microdraw's).

const { assert } = require('chai');
const { JSDOM } = require('jsdom');
const sinon = require('sinon');

const { AtlasMakerUI } = require('../../view/atlasmaker/src/atlasmaker-ui.js');
const { AtlasMakerWS } = require('../../view/atlasmaker/src/atlasmaker-ws.js');

const savedGlobals = {};
const globalNames = ['window', 'document', 'requestAnimationFrame', 'AtlasMakerWidget'];

const HTML_CHAT = '<b>"quoted"</b> & more';
const HTML_NOTICE = '<img src=x onerror="window.__notice=1"><b>Restart</b> at 18:00 & after';

// eslint-disable-next-line max-statements
describe('Atlasmaker chat, admin notice and reconnection', function () {
  let me;
  let dom;
  let sockets;

  beforeEach(function () {
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="notifications"></div><div id="logChat"><div class="text"></div></div></body></html>');
    for (const name of globalNames) {
      savedGlobals[name] = global[name];
    }
    global.window = dom.window;
    global.document = dom.window.document;
    global.requestAnimationFrame = () => null;
    sockets = [];
    me = {
      ...AtlasMakerWS,
      dialog: AtlasMakerUI.dialog,
      debug: 0,
      wshostname: 'localhost:8080',
      flagConnected: 0,
      flagLoadingImg: { loading: false },
      socket: null,
      User: { username: 'foo', atlasFilename: 'Atlas.nii.gz' },
      Collab: {},
      receiveFunctions: {},
      _pendingMetadataSaves: [],
      reconnectionTimeout: 1000,
      reconnectionMinTimeout: 1000,
      reconnectionMaxTimeout: 30000,
      stableConnectionTime: 10000,
      connectedAt: null,
      createSocket: () => {
        const socket = { readyState: 0, sent: [] };
        socket.send = (text) => { socket.sent.push(JSON.parse(text)); };
        socket.close = () => { socket.readyState = 3; };
        sockets.push(socket);

        return socket;
      }
    };
    global.AtlasMakerWidget = me;
  });

  afterEach(function () {
    sinon.restore();
    for (const [name, value] of Object.entries(savedGlobals)) {
      if (typeof value === 'undefined') {
        delete global[name];
      } else {
        global[name] = value;
      }
    }
  });

  it('shows a chat holding HTML, quotes and & as text, as typed', function () {
    me.Collab.u1 = { username: 'alice' };
    me.receiveChatMessage({ type: 'chat', uid: 'u1', username: 'alice', msg: HTML_CHAT });
    const log = document.querySelector('#logChat .text');
    assert.include(log.textContent, 'alice: ' + HTML_CHAT);
    assert.deepEqual([...log.querySelectorAll('*')].map((el) => el.tagName.toLowerCase()).sort(), ['b', 'br'], 'only the line\'s own name and line break');
  });

  /**
   * The dialog the page shows, once a notice is received
   * @returns {object} The dialog's element, or undefined
   */
  const shownDialog = () => [...document.body.children].find((el) => el.querySelector('p'));

  /**
   * Receive an admin's notice holding HTML, and check it is shown as text
   * @param {string} dialogType 'modal' (the admin's broadcast), or another type
   * @returns {void}
   */
  const checkNoticeAsText = (dialogType) => {
    // the dialog's fade out: not run here
    sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    me.receiveServerMessage({ type: 'serverMessage', dialogType, msg: HTML_NOTICE });
    const dialog = shownDialog();
    assert.isDefined(dialog, 'the notice is shown');
    const p = dialog.querySelector('p');
    assert.strictEqual(p.textContent, HTML_NOTICE);
    assert.lengthOf(p.children, 0, 'no element from the notice');
    assert.isNull(dialog.querySelector('img'));
  };

  it('shows an admin\'s notice holding HTML as text', function () {
    checkNoticeAsText('modal');
  });

  it('shows another server message holding HTML as text', function () {
    checkNoticeAsText('alert');
  });

  it('still shows the other dialogs\' HTML (they build it on purpose)', function () {
    sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    me.displayDialog({ msg: '<p>a <b>bold</b> word</p>', modal: false, delay: 0, doFadeOut: false });
    assert.strictEqual(shownDialog().querySelector('p b').textContent, 'bold');
  });

  /**
   * Connect as the viewer does, and open the socket
   * @returns {Promise<object>} The socket
   */
  const connectAndOpen = async () => {
    const opened = me.initSocketConnection();
    const socket = sockets[sockets.length - 1];
    socket.readyState = 1;
    socket.onopen();
    await opened;

    return socket;
  };

  /**
   * Close the socket, and measure the wait until the next connection is made
   * @param {object} clock Sinon's fake clock
   * @returns {number} The wait (ms)
   */
  const waitAfterClose = (clock) => {
    const before = sockets.length;
    const closedAt = Date.now();
    sockets[sockets.length - 1].readyState = 3;
    sockets[sockets.length - 1].onclose();
    // a fake socket never opens by itself: the next one is made after the wait
    for (let ms = 0; sockets.length === before && ms <= 60000; ms += 100) {
      clock.tick(100);
    }
    assert.strictEqual(sockets.length, before + 1, 'it reconnects');

    return Date.now() - closedAt;
  };

  /**
   * The last socket made opens
   * @returns {void}
   */
  const openLast = () => {
    const socket = sockets[sockets.length - 1];
    socket.readyState = 1;
    socket.onopen();
  };

  it('waits 1 s, 2 s, 4 s... before reconnecting, never more than 30 s', async function () {
    const clock = sinon.useFakeTimers({ now: 1e6, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    sinon.stub(Math, 'random').returns(0.999);
    me.drawImages = () => null;
    await connectAndOpen();
    const waits = [];
    for (let i = 0; i < 8; i += 1) {
      // the server drops each connection: the new socket never opens
      waits.push(waitAfterClose(clock));
    }
    assert.isTrue(waits.every((w) => w <= 30000), waits.join(', '));
    assert.isAtMost(waits[0], 2000);
    assert.strictEqual(waits[waits.length - 1], 30000, 'capped at 30 s');
    assert.isTrue(waits.every((w, i) => i === 0 || w >= waits[i - 1]), 'growing');
    // the wait is counted down in the notifications
    sockets[sockets.length - 1].onclose();
    assert.strictEqual(document.getElementById('notifications').textContent, 'Disconnected. Try to reconnect in 30 s...');
  });

  it('waits 1 s again after a connection that stayed open 10 s, not after a shorter one', async function () {
    const clock = sinon.useFakeTimers({ now: 1e6, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    sinon.stub(Math, 'random').returns(0);
    me.drawImages = () => null;
    await connectAndOpen();
    for (let i = 0; i < 6; i += 1) {
      waitAfterClose(clock);
    }
    // the last one opens, but closes after 5 s: the wait keeps growing
    openLast();
    clock.tick(5000);
    assert.strictEqual(waitAfterClose(clock), 30000);
    // one that stays open 10 s: back to 1 s
    openLast();
    clock.tick(10000);
    assert.strictEqual(waitAfterClose(clock), 1000);
  });

  it('sends the user data and asks for the atlas once reconnected', async function () {
    const clock = sinon.useFakeTimers({ now: 1e6, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    sinon.stub(Math, 'random').returns(0);
    me.drawImages = () => null;
    await connectAndOpen();
    waitAfterClose(clock);
    openLast();
    const socket = sockets[sockets.length - 1];
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(socket.sent.filter((m) => m.type === 'userData').map((m) => m.description), ['allUserData', 'sendAtlas']);
  });
});
