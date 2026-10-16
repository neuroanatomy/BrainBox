/* global AtlasMakerWidget BrainBox */
'use strict';

// Over the real stack: the WebSocket server knows who opened a connection from
// the session cookie the browser sends with the upgrade request, and applies
// paint and save messages only from users who may edit the atlas. A write that
// is applied is relayed to the other users on the same atlas; a refused one is
// not, which is what these tests watch from a second connection. The page of
// a user whose write is refused is told, and stops editing.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { assert } = require('chai');
const WebSocket = require('ws');
const puppeteer = require('puppeteer');
const U = require('../utils.js');

const Config = JSON.parse(fs.readFileSync('./cfg.json'));
const wshost = (Config.secure ? 'wss://' : 'ws://') + 'localhost:8080';

const shortname = 'wswriteaccesstest';
const atlasFilename = 'ws-write-access-test.nii.gz';
const sid = 'brainbox-test-ws-write-access-session';

/* express-session's signed cookie, with NeuroWebLab's secret (as in session.test.js) */
const SESSION_SECRET = process.env.SESSION_SECRET || 'a mi no me gusta la sémola';
const sessionCookie = (id) => {
  const mac = crypto.createHmac('sha256', SESSION_SECRET).update(id)
    .digest('base64')
    .replace(/[=]+$/, '');

  return `connect.sid=${encodeURIComponent(`s:${id}.${mac}`)}`;
};

const project = {
  name: 'WS write access test',
  shortname,
  owner: 'foo',
  collaborators: {
    list: [{ userID: 'anyone', nickname: 'anyone', access: { collaborators: 'view', annotations: 'view', files: 'view' } }]
  },
  files: { list: [{ source: U.localBertURL }] },
  annotations: { list: [{ type: 'volume', name: 'WS layer', values: 'foreground.json' }] }
};

/**
 * Open a socket and the test atlas on it, as the viewer does
 * @param {object} mri The MRI document
 * @param {object} options { cookie, username }
 * @returns {Promise<object>} { socket, messages }: the JSON messages received
 */
const openAtlas = (mri, { cookie, username, writeAtOnce }) => new Promise((resolve, reject) => {
  const socket = new WebSocket(wshost, cookie ? { headers: { Cookie: cookie } } : {});
  const messages = [];
  socket.on('error', reject);
  socket.on('message', (data) => {
    if (typeof data === 'string') {
      messages.push(JSON.parse(data));
    } else {
      // the atlas: give the server a moment to finish checking the access,
      // as a person would take to start drawing
      setTimeout(() => resolve({ socket, messages }), 300);
    }
  });
  socket.on('open', () => {
    socket.send(JSON.stringify({
      type: 'userData',
      description: 'allUserData',
      user: {
        username,
        dirname: mri.url,
        atlasFilename,
        mri: mri.filename,
        source: U.localBertURL,
        specimenName: 'bert',
        dim: mri.dim,
        view: 'sag',
        slice: 10,
        x0: -1,
        y0: -1,
        penSize: 1,
        penValue: 1,
        isMRILoaded: false
      }
    }));
    socket.send(JSON.stringify({ type: 'userData', description: 'sendAtlas' }));
    if (writeAtOnce) {
      // before the server has checked the access
      writeAtOnce(socket);
    }
  });
});

const paint = (socket) => socket.send(JSON.stringify({ type: 'paint', data: { c: 'mf', x: 3, y: 4 } }));
const save = (socket) => socket.send(JSON.stringify({ type: 'save' }));

/**
 * On the MRI page, as an anonymous visitor, open the test layer (view only)
 * and paint on it anyway, as a client that ignores its editMode would
 * @param {object} browser A puppeteer browser
 * @returns {Promise<object>} { before, after, pageErrors }: the state before painting and once the server answered
 */
const paintOnViewOnlyLayer = async (browser) => {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.goto(`${U.serverURL}/mri?url=${U.localBertURL}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.AtlasMakerWidget && AtlasMakerWidget.isViewerReady(), { timeout: U.longTimeout });
  const before = await page.evaluate(async (filename) => {
    const me = AtlasMakerWidget;
    const index = BrainBox.info.mri.atlas.findIndex((a) => a.filename === filename);
    await me.configureAtlasMaker(BrainBox.info, index);
    const res = { access: BrainBox.info.mri.atlas[index].access, editMode: me.editMode };
    me.editMode = 1;
    me._paintToolDown(10, 10);
    me._paintToolUp();

    return res;
  }, atlasFilename);
  await page.waitForFunction(() => AtlasMakerWidget.writeRefused !== null, { timeout: U.mediumTimeout });
  const after = await page.evaluate(() => ({
    editMode: AtlasMakerWidget.editMode,
    writeRefused: AtlasMakerWidget.writeRefused,
    chat: document.querySelector('#logChat .text').textContent,
    // the dialog's box (its modal backdrop is the other fixed div, empty)
    dialog: [...document.querySelectorAll('body > div')].filter((el) => el.style.position === 'fixed' && el.querySelector('button'))
      .map((el) => el.textContent)
  }));

  return { before, after, pageErrors };
};

describe('TESTING WEBSOCKET WRITE ACCESS', function () {
  let mri;
  let observer;
  const sockets = [];

  /**
   * Open the atlas as a writer, paint and save, and say what the observer and
   * the writer saw
   * @param {object} options { cookie, username }
   * @returns {Promise<object>} { relayed, saved }
   */
  const paintAndSave = async (options) => {
    const from = observer.messages.length;
    const writer = await openAtlas(mri, options);
    sockets.push(writer.socket);
    if (!options.writeAtOnce) {
      paint(writer.socket);
      save(writer.socket);
    }
    await U.delay(1000);
    const relayed = observer.messages.slice(from).some((m) => m.type === 'paint' && m.data && m.data.x === 3);
    const saved = writer.messages.some((m) => m.type === 'serverMessage' && (/Atlas saved/).test(m.msg));

    return { relayed, saved };
  };

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout * 2);
    const db = U.getNativeDB();
    await U.waitForTestBrain(U.longTimeout);
    await db.collection('project').deleteMany({ shortname });
    await db.collection('project').insertOne(JSON.parse(JSON.stringify(project)));
    await db.collection('mri').updateOne(
      { source: U.localBertURL, backup: { $exists: false } },
      { $push: { 'mri.atlas': { filename: atlasFilename, project: shortname, name: 'WS layer', type: 'volume', labels: 'foreground.json' } } }
    );
    mri = await db.collection('mri').findOne({ source: U.localBertURL, backup: { $exists: false } });
    await db.collection('sessions').deleteMany({ _id: sid });
    await db.collection('sessions').insertOne({
      _id: sid,
      expires: new Date(Date.now() + 24 * 3600 * 1000),
      session: JSON.stringify({
        cookie: { originalMaxAge: null, expires: null, httpOnly: true, path: '/' },
        passport: { user: { username: 'foo', nickname: 'foo' } }
      })
    });
    observer = await openAtlas(mri, { username: 'observer' });
    sockets.push(observer.socket);
  });

  after(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    for (const socket of sockets) {
      socket.close();
    }
    await U.delay(1000); // the server unloads (and saves) the atlas
    const db = U.getNativeDB();
    await db.collection('mri').updateMany({ source: U.localBertURL }, { $pull: { 'mri.atlas': { filename: atlasFilename } } });
    await db.collection('project').deleteMany({ shortname });
    await db.collection('sessions').deleteMany({ _id: sid });
    await fs.promises.rm(path.join(__dirname, '../../public', mri.url, atlasFilename), { force: true });
  });

  it('refuses the paint and save of an anonymous user with view access', async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.mediumTimeout);
    const { relayed, saved } = await paintAndSave({ username: 'Anonymous' });
    assert.isFalse(relayed, 'the paint must not reach the other users');
    assert.isFalse(saved, 'the save must not be applied');
  });

  it('refuses the paint and save of a client that only says it is the owner', async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.mediumTimeout);
    const { relayed, saved } = await paintAndSave({ username: 'foo' });
    assert.isFalse(relayed);
    assert.isFalse(saved);
  });

  it('refuses the paint and save of a session that does not exist', async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.mediumTimeout);
    const { relayed, saved } = await paintAndSave({ username: 'foo', cookie: sessionCookie('no-such-session') });
    assert.isFalse(relayed);
    assert.isFalse(saved);
  });

  it('applies the paint and save of the owner, known from the session cookie', async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.mediumTimeout);
    const { relayed, saved } = await paintAndSave({ username: 'foo', cookie: sessionCookie(sid) });
    assert.isTrue(relayed, 'the paint must reach the other users');
    assert.isTrue(saved, 'the save must be applied');
  });

  it('applies the paint and save the owner sends right after opening the atlas, before the access is checked', async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.mediumTimeout);
    const writeAtOnce = (socket) => { paint(socket); save(socket); };
    const { relayed, saved } = await paintAndSave({ username: 'foo', cookie: sessionCookie(sid), writeAtOnce });
    assert.isTrue(relayed, 'the paint must reach the other users');
    assert.isTrue(saved, 'the save must be applied');
  });

  it('the MRI page of a user who paints on a layer they may only view says so and stops editing', async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    const browser = await puppeteer.launch({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
      const { before, after, pageErrors } = await paintOnViewOnlyLayer(browser);
      assert.deepEqual(before, { access: 'view', editMode: 0 });
      const message = 'You can\'t edit this layer: your changes are not saved. Reload the page or log in again.';
      assert.deepEqual(after.writeRefused, {
        write: 'paint',
        atlas: mri.url + atlasFilename,
        reason: 'your access to this layer is \'view\''
      });
      assert.strictEqual(after.editMode, 0);
      assert.include(after.chat, message);
      assert.deepEqual(after.dialog, [message + 'OK'], 'a dialog says it until the user closes it');
      assert.deepEqual(pageErrors, []);
    } finally {
      await browser.close();
    }
  });
});
