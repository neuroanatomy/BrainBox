// A metadata save (the project page's file table and text annotations) made
// while the WebSocket is closed, e.g. reconnecting after the server restarted,
// was dropped: sendSaveMetadataMessage rejected with "Not connected", the
// callers did not catch it, and the user was not told. The save is now held
// and sent, in order, once the socket is open again, and a notice says so
// meanwhile (found while porting PR #342, 9db9de4, Nicolas Traut).

const { assert } = require('chai');
const { JSDOM } = require('jsdom');

const { AtlasMakerWS } = require('../../view/atlasmaker/src/atlasmaker-ws.js');

const savedGlobals = {};

const fakeSocket = () => {
  const socket = { readyState: 0, sent: [] };
  socket.send = (text) => {
    if (socket.readyState !== 1) { throw new Error('not open'); }
    socket.sent.push(JSON.parse(text));
  };
  socket.close = () => { socket.readyState = 3; };

  return socket;
};

// what is sent, for the messages that matter here
const summary = (socket) => socket.sent.map((m) => (m.type === 'saveMetadata' ? `${m.method} ${m.metadata.name}` : `${m.type} ${m.description}`));

const tick = () => new Promise((resolve) => { setImmediate(resolve); });

// eslint-disable-next-line max-statements
describe('Atlasmaker metadata saves while the WebSocket is closed', function () {
  let me;
  let dom;
  let sockets;
  const unhandled = [];
  const onUnhandled = (reason) => { unhandled.push(reason); };

  /**
   * Open the socket as initSocketConnection does, and as the reconnection
   * does: once open, it sends the user data and asks for the atlas
   * @returns {Promise<object>} The socket, open
   */
  const reconnect = async () => {
    const opened = me.initSocketConnection().then(() => {
      me.sendUserDataMessage('allUserData');
      me.sendUserDataMessage('sendAtlas');
    });
    const socket = sockets[sockets.length - 1];
    socket.readyState = 1;
    socket.onopen();
    await opened;
    await tick();

    return socket;
  };

  /**
   * The socket closes (onclose starts the reconnection timers: not run here)
   * @returns {void}
   */
  const disconnect = () => {
    me.flagConnected = 0;
    me.socket.readyState = 3;
  };

  const notice = () => {
    const el = dom.window.document.getElementById('metadataPending');

    return el ? el.textContent : null;
  };

  beforeEach(async function () {
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="notifications"></div></body></html>');
    for (const name of ['window', 'document', 'AtlasMakerWidget']) {
      savedGlobals[name] = global[name];
    }
    global.window = dom.window;
    global.document = dom.window.document;
    sockets = [];
    me = {
      ...AtlasMakerWS,
      debug: 0,
      wshostname: 'localhost:8080',
      flagConnected: 0,
      socket: null,
      User: { username: 'foo' },
      receiveFunctions: {},
      _pendingMetadataSaves: [],
      createSocket: () => {
        const socket = fakeSocket();
        sockets.push(socket);

        return socket;
      }
    };
    global.AtlasMakerWidget = me;
    unhandled.length = 0;
    process.on('unhandledRejection', onUnhandled);
    await reconnect();
  });

  afterEach(function () {
    process.removeListener('unhandledRejection', onUnhandled);
    for (const [name, value] of Object.entries(savedGlobals)) {
      if (typeof value === 'undefined') {
        delete global[name];
      } else {
        global[name] = value;
      }
    }
  });

  it('sends a save at once when connected', async function () {
    await me.sendSaveMetadataMessage({ source: 'a', name: 'A' });
    assert.deepEqual(summary(me.socket), ['userData allUserData', 'userData sendAtlas', 'append A']);
    assert.isNull(notice());
  });

  it('holds a save made while disconnected, without throwing or an unhandled rejection, and says so', async function () {
    disconnect();
    let done = false;
    me.sendSaveMetadataMessage({ source: 'a', name: 'A' }).then(() => { done = true; });
    await tick();
    assert.isFalse(done, 'not sent yet');
    assert.deepEqual(unhandled, []);
    assert.lengthOf(me._pendingMetadataSaves, 1);
    assert.strictEqual(notice(), 'Not connected: your changes will be saved when the connection is back');
  });

  it('sends the held saves in order once reconnected, after the user data and the atlas request, and removes the notice', async function () {
    const first = me.socket;
    disconnect();
    const held = [
      me.sendSaveMetadataMessage({ source: 'a', name: 'A' }),
      me.sendSaveMetadataMessage({ source: 'b', name: 'B' }, 'patch', [{ op: 'replace', path: '/name', value: 'B' }])
    ];
    const second = await reconnect();
    await Promise.all(held);
    assert.notStrictEqual(second, first);
    assert.deepEqual(summary(second), ['userData allUserData', 'userData sendAtlas', 'append A', 'patch B']);
    assert.deepEqual(second.sent[3].patch, [{ op: 'replace', path: '/name', value: 'B' }]);
    assert.lengthOf(me._pendingMetadataSaves, 0);
    assert.isNull(notice());
    assert.deepEqual(unhandled, []);
  });

  it('sends a held document as it was when saved', async function () {
    disconnect();
    const info = { source: 'a', name: 'A' };
    me.sendSaveMetadataMessage(info);
    info.name = 'changed later, not saved';
    const socket = await reconnect();
    assert.deepEqual(summary(socket).slice(2), ['append A']);
  });

  it('sends only the last full save of a document, in its place, but every patch', async function () {
    disconnect();
    const a = { source: 'a', name: 'A1' };
    const b = { source: 'b', name: 'B' };
    const saves = [me.sendSaveMetadataMessage(a)];
    saves.push(me.sendSaveMetadataMessage(b));
    a.name = 'A2';
    saves.push(me.sendSaveMetadataMessage(a));
    saves.push(me.sendSaveMetadataMessage(a, 'patch', [{ op: 'replace', path: '/name', value: 'P1' }]));
    saves.push(me.sendSaveMetadataMessage(a, 'patch', [{ op: 'replace', path: '/name', value: 'P2' }]));
    const socket = await reconnect();
    await Promise.all(saves); // the replaced save resolves too
    assert.deepEqual(summary(socket).slice(2), ['append B', 'append A2', 'patch A2', 'patch A2']);
    assert.deepEqual(socket.sent.slice(4).map((m) => m.patch[0].value), ['P1', 'P2']);
  });

  it('holds a save while the socket is closing, before onclose', function () {
    me.socket.readyState = 2; // CLOSING: send() would drop it silently
    me.sendSaveMetadataMessage({ source: 'a', name: 'A' });
    assert.lengthOf(me._pendingMetadataSaves, 1);
    assert.deepEqual(summary(me.socket).slice(2), []);
  });

  it('a save made once connected again waits for the held ones', async function () {
    disconnect();
    me.sendSaveMetadataMessage({ source: 'a', name: 'A' });
    const socket = sockets[sockets.length - 1];
    // open, before the held saves are sent
    const opened = me.initSocketConnection();
    const reopened = sockets[sockets.length - 1];
    assert.notStrictEqual(reopened, socket);
    reopened.readyState = 1;
    reopened.onopen();
    me.sendSaveMetadataMessage({ source: 'b', name: 'B' });
    await opened;
    await tick();
    assert.deepEqual(summary(reopened), ['append A', 'append B']);
  });

  it('warns on leaving the page while saves are held, and no longer once they are sent', async function () {
    const leave = () => {
      const e = new dom.window.Event('beforeunload', { cancelable: true });
      dom.window.dispatchEvent(e);

      return e.defaultPrevented;
    };
    me.socket.close = () => null; // the page's own beforeunload handler closes the socket
    assert.isFalse(leave());
    disconnect();
    me.sendSaveMetadataMessage({ source: 'a', name: 'A' });
    assert.isTrue(leave());
    await reconnect();
    me.socket.close = () => null;
    assert.isFalse(leave());
  });
});
