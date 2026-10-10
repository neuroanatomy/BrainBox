/* global AtlasMakerWidget */
'use strict';

/*
  Browser tests for the other users' cursors drawn by view/atlasmaker/src/atlasmaker-paint.js.
  When another user moves ('show' messages) or paints ('paint' messages), showxy()/paintxy()
  create a cursor inside #resizable, labelled with the user's name (or number, if anonymous),
  place it at the slice coordinates scaled to the displayed image, move that same cursor on
  later messages, and remove it when the user leaves the image ('u' / 'mu').
  Messages are fed through the same entry points the WebSocket uses (receiveShowMessage,
  receivePaintMessage), with a made-up collaborator, so no second browser is needed.
*/

const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');

/**
 * Add a made-up collaborator, send it messages, and describe the cursors after each one.
 * @param {Object} page A puppeteer page showing an MRI
 * @param {Object} options { uid, username, kind: 'show'|'paint', messages: [{c, x, y}] }
 * @returns {Promise<Array>} One snapshot per message
 */
const sendAsCollaborator = (page, options) => page.evaluate(({ uid, username, kind, messages }) => {
  const me = AtlasMakerWidget;
  me.Collab[uid] = {
    uid, username, view: me.User.view, slice: me.User.slice, penValue: 1, penSize: 1, x0: -1, y0: -1
  };
  const resizable = document.getElementById('resizable');
  const scale = {
    x: parseFloat(getComputedStyle(resizable).width) / me.brainW,
    y: parseFloat(getComputedStyle(resizable).height) / me.brainH
  };
  const snapshots = [];
  for (const data of messages) {
    if (kind === 'show') { me.receiveShowMessage({ uid, data }); } else { me.receivePaintMessage({ uid, data }); }
    // Cursors are the absolutely positioned divs holding an <img> that the code adds to #resizable
    const cursors = [...resizable.children].filter((el) => el.tagName === 'DIV' && el.querySelector(':scope > img'));
    snapshots.push({
      cursors: cursors.map((el) => ({
        text: el.textContent,
        left: parseFloat(el.style.left),
        top: parseFloat(el.style.top),
        position: getComputedStyle(el).position,
        sameAsStored: el === me.Collab[uid].pointer || el === (me.Collab[uid].pointer && me.Collab[uid].pointer[0])
      })),
      expected: { left: data.x * scale.x, top: data.y * scale.y },
      hasPointer: 'pointer' in me.Collab[uid]
    });
  }
  delete me.Collab[uid];

  return snapshots;
}, options);

describe('TESTING OTHER USERS\' CURSORS', function () {
  let browser;
  let page;

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout * 2);
    browser = await puppeteer.launch({ headless: true, ignoreHTTPSErrors: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900 });
    await U.blockExternalRequests(page);
    await page.goto(`${U.serverURL}/mri?url=${U.localBertURL}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.AtlasMakerWidget && AtlasMakerWidget.brainImg && AtlasMakerWidget.brainImg.img && AtlasMakerWidget.brainW > 0,
      { timeout: U.longTimeout }
    );
  });

  after(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    if (browser) { await browser.close(); }
    // Like the other suites using the test brain, leave it removed: workflow-ws.js expects to download it afresh.
    // (It may have been there before us: inserting U.projectTest, in test/runner.js, starts downloading it.)
    const res = await chai.request(U.serverURL).get('/mri/json')
      .query({ url: U.localBertURL });
    if (res.body && res.body.url) {
      await U.removeMRI({ dirPath: './public' + res.body.url, srcURL: U.localBertURL });
    }
  });

  const assertPlaced = (snapshot, text) => {
    assert.strictEqual(snapshot.cursors.length, 1, 'exactly one cursor for the collaborator');
    const [cursor] = snapshot.cursors;
    assert.strictEqual(cursor.text, text);
    assert.strictEqual(cursor.position, 'absolute');
    assert.isTrue(cursor.sameAsStored, 'the cursor on screen is the one kept in usr.pointer');
    assert.closeTo(cursor.left, snapshot.expected.left, 0.01, 'left = x scaled to the displayed width');
    assert.closeTo(cursor.top, snapshot.expected.top, 0.01, 'top = y scaled to the displayed height');
  };

  it('shows a moving user\'s cursor, moves the same cursor, and removes it when they leave', async function () {
    const snaps = await sendAsCollaborator(page, {
      uid: 'u101',
      username: 'alice',
      kind: 'show',
      messages: [{ c: 'm', x: 40, y: 30 }, { c: 'm', x: 100, y: 120 }, { c: 'u', x: 100, y: 120 }]
    });
    assertPlaced(snaps[0], 'alice');
    assertPlaced(snaps[1], 'alice');
    assert.strictEqual(snaps[2].cursors.length, 0, 'the cursor is removed from the page');
    assert.isFalse(snaps[2].hasPointer, 'and forgotten');
  }).timeout(U.mediumTimeout);

  it('labels an anonymous user with their number', async function () {
    const snaps = await sendAsCollaborator(page, {
      uid: 'u102',
      username: 'Anonymous',
      kind: 'show',
      messages: [{ c: 'm', x: 10, y: 20 }, { c: 'u', x: 10, y: 20 }]
    });
    assertPlaced(snaps[0], 'u102');
    assert.strictEqual(snaps[1].cursors.length, 0);
  }).timeout(U.mediumTimeout);

  it('shows a painting user\'s cursor, moves it, and removes it on mouse up', async function () {
    // 'le' (erase along a line) on a fresh annotation changes nothing, but goes through the full paint path
    const snaps = await sendAsCollaborator(page, {
      uid: 'u103',
      username: 'bob',
      kind: 'paint',
      messages: [{ c: 'le', x: 50, y: 60 }, { c: 'le', x: 55, y: 65 }, { c: 'mu', x: 55, y: 65 }]
    });
    assertPlaced(snaps[0], 'bob');
    assertPlaced(snaps[1], 'bob');
    assert.strictEqual(snaps[2].cursors.length, 0);
    assert.isFalse(snaps[2].hasPointer);
  }).timeout(U.mediumTimeout);

  it('keeps one cursor per collaborator when several are active', async function () {
    const counts = await page.evaluate(() => {
      const me = AtlasMakerWidget;
      const base = { view: me.User.view, slice: me.User.slice, penValue: 1, penSize: 1, x0: -1, y0: -1 };
      me.Collab.u201 = { ...base, uid: 'u201', username: 'carol' };
      me.Collab.u202 = { ...base, uid: 'u202', username: 'dave' };
      const count = () => [...document.getElementById('resizable').children].filter((el) => el.querySelector(':scope > img')).length;
      // [uid, command, x, y]; the cursor count is recorded after each message
      const sequence = [['u201', 'm', 10, 10], ['u202', 'm', 20, 20], ['u201', 'm', 30, 30], ['u201', 'u', 30, 30], ['u202', 'u', 20, 20]];
      const after = sequence.map(([uid, c, x, y]) => {
        me.receiveShowMessage({ uid, data: { c, x, y } });

        return count();
      });
      delete me.Collab.u201;
      delete me.Collab.u202;

      return after;
    });
    assert.deepEqual(counts, [1, 2, 2, 1, 0], 'one cursor per collaborator, moved rather than duplicated, removed on leave');
  }).timeout(U.mediumTimeout);

  describe('between two real clients', function () {
    // A second browser, so the two clients do not share a session: the whole path
    // from B's mouse, through the WebSocket server, to the cursor drawn in A.
    let browserB;
    let pageB;

    before(async function () {
      // eslint-disable-next-line no-invalid-this
      this.timeout(U.longTimeout * 2);
      const connected = () => window.AtlasMakerWidget && AtlasMakerWidget.brainImg && AtlasMakerWidget.brainImg.img && AtlasMakerWidget.flagConnected === 1;
      await page.waitForFunction(connected, { timeout: U.longTimeout });
      browserB = await puppeteer.launch({ headless: true, ignoreHTTPSErrors: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      pageB = await browserB.newPage();
      await pageB.setViewport({ width: 1200, height: 900 });
      await U.blockExternalRequests(pageB);
      await pageB.goto(`${U.serverURL}/mri?url=${U.localBertURL}`, { waitUntil: 'domcontentloaded' });
      await pageB.waitForFunction(connected, { timeout: U.longTimeout });
      // A learns about B once B has announced itself
      await page.waitForFunction(() => Object.keys(AtlasMakerWidget.Collab).length > 0, { timeout: U.mediumTimeout });
    });

    after(async function () {
      // eslint-disable-next-line no-invalid-this
      this.timeout(U.longTimeout);
      if (browserB) { await browserB.close(); }
    });

    const cursorsInA = () => page.evaluate(() => [...document.getElementById('resizable').children]
      .filter((el) => el.tagName === 'DIV' && el.querySelector(':scope > img'))
      .map((el) => ({ left: parseFloat(el.style.left), top: parseFloat(el.style.top), width: parseFloat(getComputedStyle(el.parentNode).width) })));

    it('draws B\'s cursor in A while B drags with the Show tool, and removes it when B lets go', async function () {
      const box = await pageB.$eval('#canvas', (el) => {
        const r = el.getBoundingClientRect();

        return { x: r.x, y: r.y, w: r.width, h: r.height };
      });
      await pageB.mouse.move(box.x + (box.w * 0.3), box.y + (box.h * 0.3));
      await pageB.mouse.down();
      await page.waitForFunction(() => document.querySelectorAll('#resizable > div > img').length === 1, { timeout: U.shortTimeout });

      await pageB.mouse.move(box.x + (box.w * 0.5), box.y + (box.h * 0.6), { steps: 5 });
      await page.waitForFunction(() => {
        const el = document.querySelector('#resizable > div > img');

        return el && parseFloat(el.parentNode.style.left) > parseFloat(getComputedStyle(el.parentNode.parentNode).width) * 0.45;
      }, { timeout: U.shortTimeout });
      const [cursor] = await cursorsInA();
      // B is at half the image's width; the cursor lands there in A, within a voxel or two
      assert.closeTo(cursor.left / cursor.width, 0.5, 0.02);

      await pageB.mouse.up();
      await page.waitForFunction(() => document.querySelectorAll('#resizable > div > img').length === 0, { timeout: U.shortTimeout });
    }).timeout(U.mediumTimeout);
  });
});
