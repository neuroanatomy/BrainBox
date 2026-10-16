/* eslint-disable max-lines */
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
  files: { list: [U.localBertURL] },
  annotations: { list: [{ type: 'volume', name: 'WS layer', values: 'foreground.json' }, { type: 'volume', name: 'WS layer 2', values: 'foreground.json' }] }
};

// a project whose files anyone can see, but not its annotations
const hiddenShortname = 'wswriteaccesshidden';
const hiddenFilename = 'ws-write-access-hidden.nii.gz';
const hiddenProject = {
  name: 'WS write access test, hidden annotations',
  shortname: hiddenShortname,
  owner: 'foo',
  collaborators: {
    list: [{ userID: 'anyone', nickname: 'anyone', access: { collaborators: 'none', annotations: 'none', files: 'view' } }]
  },
  files: { list: [U.localBertURL] },
  annotations: { list: [{ type: 'volume', name: 'Hidden layer', values: 'foreground.json' }] }
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
const saveMetadata = (socket, metadata) => socket.send(JSON.stringify({ type: 'saveMetadata', metadata, method: 'append' }));

/**
 * The stored MRI document
 * @returns {Promise<object>} The document
 */
const storedMRI = () => U.getNativeDB().collection('mri')
  .findOne({ source: U.localBertURL, backup: { $exists: false } }, { projection: { _id: 0 } });

/**
 * The copy of the MRI document a project page gets, as the user with this cookie
 * @param {string} projectName The project
 * @param {string} cookie The Cookie header, if any
 * @returns {Promise<object>} The document
 */
const projectPageCopy = async (projectName, cookie) => {
  const res = await fetch(`${U.serverURL}/project/json/${projectName}/files?start=0&length=20`, cookie ? { headers: { Cookie: cookie } } : {});
  const files = await res.json();

  return files.find((f) => f.source === U.localBertURL);
};

/**
 * Add the layer of a volume annotation, as a project page does for every visitor
 * @param {object} doc The MRI document
 * @param {object} params { project, name, access }: access is the user's access to the project's annotations
 * @returns {string} The layer's file name
 */
const addLayerAsProjectPage = (doc, { project: projectShortname, name, access }) => {
  const filename = Math.random().toString(36)
    .slice(2) + '.nii.gz';
  const date = new Date().toJSON();
  doc.mri.atlas.push({ name, project: projectShortname, created: date, modified: date, modifiedBy: 'Anonymous', filename, labels: 'foreground.json', owner: 'Anonymous', type: 'volume', access });

  return filename;
};

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

/**
 * On the MRI page, as an anonymous visitor, save the MRI document renamed, as
 * a page that lets anyone change the name would
 * @param {object} browser A puppeteer browser
 * @returns {Promise<object>} { before, after, pageErrors }: the editMode before, and the state once the server answered
 */
const renameOnMRIPage = async (browser) => {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.goto(`${U.serverURL}/mri?url=${U.localBertURL}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.AtlasMakerWidget && AtlasMakerWidget.isViewerReady(), { timeout: U.longTimeout });
  const before = await page.evaluate(() => {
    AtlasMakerWidget.editMode = 1;
    AtlasMakerWidget.sendSaveMetadataMessage({ ...BrainBox.info, name: 'Renamed on the MRI page' });

    return AtlasMakerWidget.editMode;
  });
  await page.waitForFunction(() => AtlasMakerWidget.writeRefused !== null, { timeout: U.mediumTimeout });
  const after = await page.evaluate(() => ({
    editMode: AtlasMakerWidget.editMode,
    writeRefused: AtlasMakerWidget.writeRefused,
    chat: document.querySelector('#logChat .text').textContent,
    modal: [...document.querySelectorAll('body > div')].filter((el) => el.style.position === 'fixed' && el.querySelector('button')).length
  }));

  return { before, after, pageErrors };
};

// eslint-disable-next-line max-statements
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
    await db.collection('project').deleteMany({ shortname: { $in: [shortname, hiddenShortname] } });
    await db.collection('project').insertMany(JSON.parse(JSON.stringify([project, hiddenProject])));
    await db.collection('mri').updateOne(
      { source: U.localBertURL, backup: { $exists: false } },
      {
        $push: {
          'mri.atlas': {
            $each: [
              { filename: atlasFilename, project: shortname, name: 'WS layer', type: 'volume', labels: 'foreground.json' },
              { filename: hiddenFilename, project: hiddenShortname, name: 'Hidden layer', type: 'volume', labels: 'foreground.json' }
            ]
          }
        }
      }
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
    await db.collection('mri').updateMany({ source: U.localBertURL }, { $pull: { 'mri.atlas': { $or: [{ filename: atlasFilename }, { project: { $in: [shortname, hiddenShortname] } }] } } });
    await db.collection('mri').updateMany({ source: U.localBertURL }, typeof mri.name === 'string' ? { $set: { name: mri.name } } : { $unset: { name: '' } });
    await db.collection('project').deleteMany({ shortname: { $in: [shortname, hiddenShortname] } });
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

  it('refuses the paint and save of a user who first detaches the layer from its project and makes it editable', async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.mediumTimeout);
    const writeAtOnce = async (socket) => {
      const doc = await storedMRI();
      const layer = doc.mri.atlas.find((a) => a.filename === atlasFilename);
      layer.project = '';
      layer.access = 'edit';
      saveMetadata(socket, doc);
      paint(socket);
      save(socket);
    };
    const { relayed, saved } = await paintAndSave({ username: 'Anonymous', writeAtOnce });
    assert.isFalse(relayed, 'the paint must not reach the other users');
    assert.isFalse(saved, 'the save must not be applied');
    const layer = (await storedMRI()).mri.atlas.find((a) => a.filename === atlasFilename);
    assert.strictEqual(layer.project, shortname);
    assert.notProperty(layer, 'access');
  });

  it('a project page that does not show a layer keeps it when it saves the MRI document', async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.mediumTimeout);
    const doc = await projectPageCopy(hiddenShortname);
    assert.notInclude(doc.mri.atlas.map((a) => a.filename), hiddenFilename, 'an anonymous visitor does not see the layer');
    const created = addLayerAsProjectPage(doc, { project: hiddenShortname, name: 'Hidden layer', access: 'none' });
    const visitor = await openAtlas(mri, { username: 'Anonymous' });
    sockets.push(visitor.socket);
    saveMetadata(visitor.socket, doc);
    await U.delay(1000);
    const filenames = (await storedMRI()).mri.atlas.map((a) => a.filename);
    assert.include(filenames, hiddenFilename, 'the layer the visitor cannot see is kept');
    assert.notInclude(filenames, created, 'nor can the visitor add one to that project');
    assert.deepEqual(visitor.messages.filter((m) => m.type === 'writeRefused'), [], 'and the visitor is not told anything');
  });

  it('a viewer\'s project page creates the layer of a volume annotation', async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.mediumTimeout);
    const doc = await projectPageCopy(shortname);
    const created = addLayerAsProjectPage(doc, { project: shortname, name: 'WS layer 2', access: 'view' });
    const visitor = await openAtlas(mri, { username: 'Anonymous' });
    sockets.push(visitor.socket);
    saveMetadata(visitor.socket, doc);
    await U.delay(1000);
    const stored = await storedMRI();
    const layer = stored.mri.atlas.find((a) => a.filename === created);
    assert.include(layer, { project: shortname, name: 'WS layer 2', access: 'view' });
    assert.include(stored.mri.atlas.map((a) => a.filename), hiddenFilename);
    assert.deepEqual(visitor.messages.filter((m) => m.type === 'writeRefused'), []);
  });

  it('the MRI can be renamed by the owner of a project that lists it, not by an anonymous visitor, who is told', async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.mediumTimeout);
    const visitor = await openAtlas(mri, { username: 'foo' });
    const owner = await openAtlas(mri, { username: 'foo', cookie: sessionCookie(sid) });
    sockets.push(visitor.socket, owner.socket);
    saveMetadata(visitor.socket, { ...await storedMRI(), name: 'Renamed by a visitor' });
    await U.delay(500);
    assert.strictEqual((await storedMRI()).name, mri.name);
    assert.deepEqual(visitor.messages.filter((m) => m.type === 'writeRefused'), [{ type: 'writeRefused', write: 'saveMetadata', atlas: null, reason: 'you may not rename this MRI' }]);
    saveMetadata(owner.socket, { ...await storedMRI(), name: 'Renamed by its project\'s owner' });
    await U.delay(500);
    assert.strictEqual((await storedMRI()).name, 'Renamed by its project\'s owner');
    assert.deepEqual(owner.messages.filter((m) => m.type === 'writeRefused'), []);
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

  it('the page of a user whose change to the MRI\'s information is refused says so, and goes on editing', async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    const browser = await puppeteer.launch({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
      const { before, after, pageErrors } = await renameOnMRIPage(browser);
      assert.deepEqual(after.writeRefused, { write: 'saveMetadata', atlas: null, reason: 'you may not rename this MRI' });
      assert.strictEqual(after.editMode, before, 'the layer is still editable');
      assert.include(after.chat, 'Some of your changes to this brain\'s information were not saved: you may not rename this MRI.');
      assert.strictEqual(after.modal, 0, 'no dialog waits for the user');
      assert.notStrictEqual((await storedMRI()).name, 'Renamed on the MRI page');
      assert.deepEqual(pageErrors, []);
    } finally {
      await browser.close();
    }
  });
});
