/* eslint-disable max-lines */
/* global AtlasMakerWidget BrainBox */
'use strict';

// Over the real stack: the WebSocket server sends the content of a layer only
// to users who may see it, as the HTTP API decides it (a layer of a project
// whose annotations the user cannot see is hidden). The user is the one of the
// session cookie sent with the upgrade request, or, on an embed connection,
// the one its page was rendered for. Other users are not told which layer a
// user has open, and strokes are relayed only to users who may see the layer.

const fs = require('fs');
const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const WebSocket = require('ws');
const puppeteer = require('puppeteer');
const U = require('../utils.js');
const F = require('../mri-access-fixtures.js');

const Config = JSON.parse(fs.readFileSync('./cfg.json'));
const wshost = (Config.secure ? 'wss://' : 'ws://') + 'localhost:8080';

// a layer of the fixtures' project, whose annotations only its collaborators see
const hiddenFilename = 'ws-read-access-hidden.nii.gz';
// another one, for the relay test (no other test loads it, or unloads it)
const relayFilename = 'ws-read-access-hidden-relay.nii.gz';
// a layer without a project, which anyone sees
const publicFilename = 'ws-read-access-public.nii.gz';

/**
 * Open a socket, as the viewer does
 * @param {object} options { cookie, ticket }
 * @returns {Promise<object>} { socket, messages, binaries }: what it receives
 */
const connect = ({ cookie, ticket } = {}) => new Promise((resolve, reject) => {
  const socket = new WebSocket(wshost + (ticket ? `?embedTicket=${ticket}` : ''), cookie ? { headers: { Cookie: cookie } } : {});
  const received = { socket, messages: [], binaries: 0, waiters: [] };
  socket.on('error', reject);
  socket.on('message', (data) => {
    if (typeof data === 'string') {
      received.messages.push(JSON.parse(data));
    } else {
      // binary: a layer, or a slice
      received.binaries += 1;
    }
    received.waiters = received.waiters.filter((w) => !w());
  });
  socket.on('open', () => resolve(received));
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

const user = (mri, { filename, source = U.localBertURL, dirname = mri.url }) => ({
  username: 'whoever',
  dirname,
  atlasFilename: filename,
  mri: mri.filename,
  source,
  specimenName: 'bert',
  dim: mri.dim,
  view: 'sag',
  slice: 10,
  isMRILoaded: false
});

/**
 * Ask for a layer, as the viewer does, and wait for it, or for the server to refuse it
 * @param {object} received What connect gave
 * @param {object} mri The MRI document
 * @param {object} params { filename, source, dirname }
 * @returns {Promise<object>} { atlas, refusal }: whether the layer came, and the readRefused message
 */
const openLayer = async (received, mri, params) => {
  const binariesBefore = received.binaries;
  const refusalsBefore = received.messages.filter((m) => m.type === 'readRefused').length;
  received.socket.send(JSON.stringify({ type: 'userData', description: 'allUserData', user: user(mri, params) }));
  received.socket.send(JSON.stringify({ type: 'userData', description: 'sendAtlas' }));
  const refusals = () => received.messages.filter((m) => m.type === 'readRefused');
  await until(received, () => received.binaries > binariesBefore || refusals().length > refusalsBefore);

  return { atlas: received.binaries > binariesBefore, refusal: refusals()[refusalsBefore] };
};

/**
 * The ticket of the embed page, as rendered for the user of a cookie
 * @param {string} [cookie] The Cookie header
 * @returns {Promise<string>} The ticket
 */
const embedTicket = async (cookie) => {
  const req = chai.request(U.serverURL).get('/mri/embed')
    .query({ url: U.localBertURL });
  if (cookie) {
    req.set('Cookie', cookie);
  }
  const res = await req;
  const [, ticket] = res.text.match(/var embedWsTicket = "([^"]+)"/);

  return ticket;
};

// eslint-disable-next-line max-statements
describe('WebSocket: layers are sent only to the users who may see them', function () {
  // eslint-disable-next-line no-invalid-this
  this.timeout(U.longTimeout);

  let mri;
  const sockets = [];
  const open = async (options) => {
    const received = await connect(options);
    sockets.push(received.socket);

    return received;
  };

  before(async function () {
    await U.waitForTestBrain();
    await F.setUp();
    await U.getNativeDB().collection('mri')
      .updateOne({ source: U.localBertURL, backup: { $exists: false } }, {
        $push: {
          'mri.atlas': {
            $each: [
              { filename: hiddenFilename, project: F.shortname, name: 'Hidden layer', type: 'volume', labels: 'foreground.json', access: 'edit' },
              { filename: relayFilename, project: F.shortname, name: 'Hidden layer 2', type: 'volume', labels: 'foreground.json', access: 'edit' },
              { filename: publicFilename, name: 'Public layer', type: 'volume', labels: 'foreground.json', access: 'view' }
            ]
          }
        }
      });
    mri = await F.storedMRI();
  });

  // connections on the server: a closed one is removed once its layer is saved
  // and unloaded (the MRI document is replaced then), so each test starts after that
  const connected = () => U.getAtlasmakerServer().US.filter(Boolean).length;
  let connectedBefore;

  beforeEach(function () {
    connectedBefore = connected();
  });

  afterEach(async function () {
    for (const socket of sockets.splice(0)) {
      socket.close();
    }
    while (connected() > connectedBefore) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => { setTimeout(resolve, 20); });
    }
  });

  after(async function () {
    await U.getNativeDB().collection('mri')
      .updateMany({ source: U.localBertURL }, { $pull: { 'mri.atlas': { filename: { $in: [hiddenFilename, relayFilename, publicFilename] } } } });
    await U.getNativeDB().collection('embedWsTicket')
      .deleteMany({ mriSource: U.localBertURL });
    await F.tearDown();
  });

  it('sends an anonymous visitor a layer anyone may see', async function () {
    const { atlas } = await openLayer(await open(), mri, { filename: publicFilename });
    assert.isTrue(atlas);
  });

  it('refuses an anonymous visitor a hidden layer, and says why', async function () {
    const { atlas, refusal } = await openLayer(await open(), mri, { filename: hiddenFilename });
    assert.isFalse(atlas);
    assert.deepEqual(refusal, {
      type: 'readRefused',
      atlas: mri.url + hiddenFilename,
      reason: 'your access to the annotations of its project is \'none\''
    });
  });

  it('refuses it to a logged-in user who is not a collaborator', async function () {
    const { atlas } = await openLayer(await open({ cookie: F.cookie(F.users.nonmember) }), mri, { filename: hiddenFilename });
    assert.isFalse(atlas);
  });

  it('sends it to a collaborator who may view, or edit, the annotations', async function () {
    const viewer = await openLayer(await open({ cookie: F.cookie(F.users.viewer) }), mri, { filename: hiddenFilename });
    assert.isTrue(viewer.atlas);
    const editor = await openLayer(await open({ cookie: F.cookie(F.users.editor) }), mri, { filename: hiddenFilename });
    assert.isTrue(editor.atlas);
  });

  it('refuses it when the client says the MRI is another one', async function () {
    const { atlas } = await openLayer(await open(), mri, { filename: hiddenFilename, source: 'https://example.com/not-bert.nii.gz' });
    assert.isFalse(atlas);
  });

  it('sends a layer the MRI does not list yet (the one a project page has just created)', async function () {
    const filename = Math.random().toString(36)
      .slice(2) + '.nii.gz';
    const { atlas } = await openLayer(await open(), mri, { filename });
    assert.isTrue(atlas);
  });

  it('does not tell the other users which layer a user has open', async function () {
    const observer = await open();
    await openLayer(observer, mri, { filename: publicFilename });
    const editor = await open({ cookie: F.cookie(F.users.editor) });
    await openLayer(editor, mri, { filename: hiddenFilename });
    const late = await open();
    await until(observer, () => observer.messages.some((m) => m.type === 'userData' && m.description === 'allUserData'));
    await until(late, () => late.messages.some((m) => m.type === 'userData' && m.user && m.user.dirname === mri.url));
    const told = [...observer.messages, ...late.messages].filter((m) => m.type === 'userData' && m.user);
    assert.isNotEmpty(told);
    for (const m of told) {
      assert.notProperty(m.user, 'atlasFilename');
      assert.notProperty(m.user, 'iAtlas');
    }
    assert.notInclude(JSON.stringify([...observer.messages, ...late.messages]), hiddenFilename);
  });

  it('does not relay the strokes on a hidden layer to a user who says they have it open', async function () {
    const editor = await open({ cookie: F.cookie(F.users.editor) });
    await openLayer(editor, mri, { filename: relayFilename });
    const viewer = await open({ cookie: F.cookie(F.users.viewer) });
    await openLayer(viewer, mri, { filename: relayFilename });
    const intruder = await open();
    await openLayer(intruder, mri, { filename: publicFilename });
    // the intruder says it is on the editor's atlas (its index on the server,
    // which other users were told before this change)
    const { iAtlas } = U.getAtlasmakerServer().US.find((us) => us && us.User && us.User.atlasFilename === relayFilename).User;
    intruder.socket.send(JSON.stringify({ type: 'userData', description: JSON.stringify({ iAtlas, atlasFilename: relayFilename }) }));
    // a chat message: once the viewer has it, the intruder's change is applied
    intruder.socket.send(JSON.stringify({ type: 'chat', msg: 'hello', username: 'intruder' }));
    await until(viewer, () => viewer.messages.some((m) => m.type === 'chat'));
    editor.socket.send(JSON.stringify({ type: 'paint', data: { c: 'mf', x: 3, y: 4 } }));
    // the viewer of the hidden layer gets the stroke; by then the intruder would have it too
    await until(viewer, () => viewer.messages.some((m) => m.type === 'paint'));
    editor.socket.send(JSON.stringify({ type: 'chat', msg: 'done', username: 'editor' }));
    await until(intruder, () => intruder.messages.some((m) => m.type === 'chat' && m.msg === 'done'));
    assert.isFalse(intruder.messages.some((m) => m.type === 'paint'), 'no stroke relayed to the intruder');
  });

  it('sends an embed connection the layers its page was rendered for, without a cookie', async function () {
    const ticket = await embedTicket(F.cookie(F.users.viewer));
    const embed = await open({ ticket });
    // the server looks the ticket up when the socket opens
    await new Promise((resolve) => { setTimeout(resolve, 300); });
    const { atlas } = await openLayer(embed, mri, { filename: hiddenFilename });
    assert.isTrue(atlas);
  });

  it('refuses an embed connection rendered for an anonymous visitor a hidden layer', async function () {
    const ticket = await embedTicket();
    const embed = await open({ ticket });
    await new Promise((resolve) => { setTimeout(resolve, 300); });
    const { atlas } = await openLayer(embed, mri, { filename: hiddenFilename });
    assert.isFalse(atlas);
    const publicLayer = await openLayer(embed, mri, { filename: publicFilename });
    assert.isTrue(publicLayer.atlas, 'the layers anyone sees still come');
  });

  it('says in the viewer that the layer is not shown, and stops editing', async function () {
    const browser = await puppeteer.launch({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
      const page = await browser.newPage();
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(err.message));
      await page.goto(`${U.serverURL}/mri?url=${U.localBertURL}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.AtlasMakerWidget && AtlasMakerWidget.isViewerReady(), { timeout: U.longTimeout });
      // a page loaded while the visitor could see the layer (e.g. logged in since logged out)
      await page.evaluate((filename) => {
        const info = JSON.parse(JSON.stringify(BrainBox.info));
        info.mri.atlas.push({ filename, project: 'whatever', name: 'Hidden layer', type: 'volume', labels: 'foreground.json', access: 'edit' });
        AtlasMakerWidget.configureAtlasMaker(info, info.mri.atlas.length - 1);
      }, hiddenFilename);
      await page.waitForFunction(() => AtlasMakerWidget.readRefused, { timeout: U.mediumTimeout });
      const state = await page.evaluate(() => ({
        editMode: AtlasMakerWidget.editMode,
        chat: document.querySelector('#logChat .text').textContent
      }));
      assert.strictEqual(state.editMode, 0);
      assert.include(state.chat, 'You can\'t see this layer: your access to the annotations of its project is \'none\'. Reload the page or log in again.');
      assert.deepEqual(pageErrors, []);
    } finally {
      await browser.close();
    }
  });
});
