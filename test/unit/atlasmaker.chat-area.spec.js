// The viewer's chat lines and its chat and script area, from nwl-components/chat
// (T002 K1c):
// - another user's line: the name in bold, in a link to their view, then the text;
// - an own line reads `name (me): text`, trimmed; empty text is not sent;
// - entered, left and the refusal notices are a name alone, in bold;
// - names and messages holding HTML are shown as text;
// - the Chat/Script switch, and the resize, which stops at 100 px.

const { assert } = require('chai');
const { JSDOM } = require('jsdom');
const { chatInput } = require('nwl-components/chat');

const { AtlasMakerInteraction } = require('../../view/atlasmaker/src/atlasmaker-interaction.js');
const { AtlasMakerWS } = require('../../view/atlasmaker/src/atlasmaker-ws.js');

const HOSTILE = '<img src=x onerror="window.__h=1">';

const html = `<!DOCTYPE html><html><body>
<div id="notifications"></div>
<div id="textInputBlock" style="display:none">
  <div id="logChat" class="hidden"><div class="text"></div><input id="msg" type="text"></div>
  <div id="logScript" class="text hidden"><textarea></textarea></div>
</div>
<div id="textInputResize"></div>
</body></html>`;

const savedGlobals = {};
const globalNames = ['window', 'document', 'AtlasMakerWidget'];

// eslint-disable-next-line max-statements
describe('Atlasmaker chat lines and chat and script area', function () {
  let me;
  let dom;
  let document;
  let sent;

  const log = () => document.querySelector('#logChat .text');
  const lines = () => log().innerHTML.split('<br>').filter((line) => line !== '');
  const tags = () => [...new Set([...log().querySelectorAll('*')].map((el) => el.tagName.toLowerCase()))].sort();

  beforeEach(function () {
    dom = new JSDOM(html, { url: 'http://localhost:3000/mri' });
    ({ document } = dom.window);
    for (const name of globalNames) {
      savedGlobals[name] = global[name];
    }
    global.window = dom.window;
    global.document = document;
    sent = [];
    me = {
      ...AtlasMakerInteraction,
      ...AtlasMakerWS,
      debug: 0,
      hostname: 'http://localhost:3000',
      flagConnected: 1,
      socket: { send: (text) => { sent.push(JSON.parse(text)); } },
      User: { username: 'foo' },
      Collab: {}
    };
    global.AtlasMakerWidget = me;
  });

  afterEach(function () {
    for (const [name, value] of Object.entries(savedGlobals)) {
      if (typeof value === 'undefined') {
        delete global[name];
      } else {
        global[name] = value;
      }
    }
  });

  it('shows another user\'s line with their name in bold, in a link to their view', function () {
    me.Collab.u1 = { username: 'alice', source: 'http://example.org/a.nii.gz', view: 'sag', slice: 5 };
    me.receiveChatMessage({ type: 'chat', uid: 'u1', username: 'alice', msg: 'hello' });
    assert.strictEqual(log().textContent, 'alice: hello');
    const a = log().querySelector('a');
    assert.strictEqual(a.querySelector('b').textContent, 'alice:');
    const link = new URL(a.href);
    assert.strictEqual(link.pathname, '/mri');
    assert.strictEqual(link.searchParams.get('url'), 'http://example.org/a.nii.gz');
    assert.strictEqual(link.searchParams.get('slice'), '5');
  });

  it('shows names and messages holding HTML as text', function () {
    me.receiveChatMessage({ type: 'chat', uid: 'u2', username: HOSTILE, msg: HOSTILE });
    assert.strictEqual(log().textContent, HOSTILE + ': ' + HOSTILE);
    assert.deepEqual(tags(), ['b', 'br'], 'no element from the name or the message, no link without a view');
  });

  it('shows an own line as `name (me): text`, sends it trimmed, and sends no empty text', function () {
    me.sendChatMessage('  hi there  ');
    me.sendChatMessage('   ');
    me.sendChatMessage('');
    assert.deepEqual(sent, [{ type: 'chat', msg: 'hi there' }]);
    assert.strictEqual(log().textContent, 'foo (me): hi there');
    assert.strictEqual(log().querySelector('i').textContent, '(me)');
  });

  it('sends what Enter in #msg holds, trimmed, and clears it', function () {
    const msg = document.getElementById('msg');
    chatInput(msg, (text) => { me.onChatInput(text); });
    msg.value = '  hello ';
    msg.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.deepEqual(sent, [{ type: 'chat', msg: 'hello' }]);
    assert.strictEqual(msg.value, '');
  });

  it('keeps the text in #msg and sends nothing while disconnected', function () {
    const msg = document.getElementById('msg');
    chatInput(msg, (text) => { me.onChatInput(text); });
    me.flagConnected = 0;
    msg.value = 'hello';
    msg.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.deepEqual(sent, []);
    assert.strictEqual(msg.value, 'hello');
    assert.strictEqual(log().textContent, '');
    // connected again: the same Enter sends it and clears #msg
    me.flagConnected = 1;
    msg.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.deepEqual(sent, [{ type: 'chat', msg: 'hello' }]);
    assert.strictEqual(msg.value, '');
  });

  it('shows entered, left and the refusal notices as a name alone, in bold', function () {
    me.receiveUserDataMessage({ uid: 'u3', description: 'allUserData', user: { username: 'bob' } });
    me.receiveDisconnectMessage({ uid: 'u3' });
    me.appendChatLine({ name: 'You can\'t see this layer' });
    assert.deepEqual(lines(), ['<b>bob entered</b>', '<b>bob left</b>', '<b>You can\'t see this layer</b>']);
  });

  it('switches between the chat and the script console, and hides the area', function () {
    const block = document.getElementById('textInputBlock');
    const chat = document.getElementById('logChat');
    const script = document.getElementById('logScript');
    me.toggleTextInput('Chat');
    assert.deepEqual([block.style.display, chat.classList.contains('hidden'), script.classList.contains('hidden')], ['flex', false, true]);
    assert.strictEqual(document.activeElement.id, 'msg');
    me.toggleTextInput('Script');
    assert.deepEqual([block.style.display, chat.classList.contains('hidden'), script.classList.contains('hidden')], ['flex', true, false]);
    assert.strictEqual(document.activeElement.tagName, 'TEXTAREA');
    me.toggleTextInput('none');
    assert.strictEqual(block.style.display, 'none');
  });

  it('resizes the area with #textInputResize, never below 100 px', function () {
    me.initTextInputResize();
    // the switch reuses the area made for the resize: one set of listeners
    me.toggleTextInput('Chat');
    const handle = document.getElementById('textInputResize');
    const block = document.getElementById('textInputBlock');
    const mouse = (type, clientY, target) => target.dispatchEvent(new dom.window.MouseEvent(type, { clientY, bubbles: true }));
    // jsdom lays nothing out: the area starts at 0 px
    mouse('mousedown', 10, handle);
    mouse('mousemove', 310, document);
    assert.strictEqual(block.style.flex, '0 0 300px');
    mouse('mousemove', 50, document);
    assert.strictEqual(block.style.flex, '0 0 100px');
    mouse('mouseup', 50, document);
    mouse('mousemove', 400, document);
    assert.strictEqual(block.style.flex, '0 0 100px', 'the resize stops on mouseup');
  });
});
