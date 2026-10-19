/* eslint-disable max-lines */
// The atlasmaker WebSocket server runs inside the web server's process: an
// exception thrown from a message handler, or a rejected promise nobody
// handles, takes the whole site down. These tests send bad input and simulate
// failures, and check that nothing escapes (from PR #342, 7ea9c02, 8a75d9c).

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const { expect } = require('chai');
const sinon = require('sinon');
const amri = require('../../controller/atlasmakerServer/atlasmaker-mri.js');
const atlasmakerServer = require('../../controller/atlasmakerServer/atlasmakerServer.js');
const U = require('../utils.js');

let AMS;

const mockSocket = () => ({
  send: sinon.spy(),
  close: sinon.spy(),
  readyState: 1,
  on: sinon.spy()
});

const addUser = (User) => {
  AMS.uidcounter += 1;
  const entry = { uid: 'u' + AMS.uidcounter, socket: mockSocket() };
  if (User) {
    entry.User = User;
  }
  AMS.US.push(entry);

  return entry;
};

/**
 * Run fn and collect the promise rejections nobody handled, which would kill
 * the server's process. mocha's own listeners are set aside meanwhile.
 * @param {function} fn Code to run
 * @returns {Promise<Array>} Reasons of the unhandled rejections
 */
const unhandledRejectionsOf = async (fn) => {
  const reasons = [];
  const collect = (reason) => { reasons.push(reason); };
  const previous = process.listeners('unhandledRejection');
  process.removeAllListeners('unhandledRejection');
  process.on('unhandledRejection', collect);
  try {
    await fn();
    await new Promise((resolve) => { setTimeout(resolve, 20); });
  } finally {
    process.removeListener('unhandledRejection', collect);
    for (const listener of previous) {
      process.on('unhandledRejection', listener);
    }
  }

  return reasons;
};

const messageTypes = [
  { type: 'paint', data: { c: 'mf', x: 1, y: 1 } },
  { type: 'vectorial', data: [] },
  { type: 'requestSlice', view: 'sag', slice: 10 },
  { type: 'requestSlice2', view: 'sag', slice: 10 },
  { type: 'save' },
  { type: 'atlas', data: Buffer.from(zlib.deflateSync(Buffer.alloc(8))) }, // eslint-disable-line no-sync
  { type: 'userData', description: 'sendAtlas' },
  { type: 'userData', description: '{"view":"sag"}' },
  { type: 'autocompleteClient' }
];

/**
 * Send each message type with sourceUS and uid, and list the types that
 * threw or left an unhandled rejection.
 * @param {function} getSource Gives { sourceUS, uid, ws } for each message
 * @returns {Promise<Array>} The types that failed, with the error
 */
const failingTypes = async (getSource) => {
  const failures = [];
  const server = AMS;
  for (const message of messageTypes) {
    const { sourceUS, uid, ws } = getSource();
    const data = { ...message, uid };
    let reasons;
    try {
      // eslint-disable-next-line no-await-in-loop
      reasons = await unhandledRejectionsOf(() => {
        server._handleUserWebSocketMessage({ data, ws, sourceUS });
      });
    } catch (err) {
      reasons = [err];
    }
    if (reasons.length) {
      failures.push(`${message.type} ${message.description || ''}: ${reasons[0].message}`);
    }
  }

  return failures;
};

describe('UNIT TESTING ATLASMAKER SERVER: bad input and failures do not crash the server', function () {
  before(function () {
    AMS = atlasmakerServer(U.getNativeDB());
  });

  beforeEach(function () {
    AMS.US = [];
    AMS.Atlases = [];
    AMS.Brains = [];
  });

  afterEach(function () {
    sinon.restore();
  });

  describe('messages from a connection without a User structure', function () {
    it('every message type is ignored without throwing or leaving a rejection', async function () {
      const failures = await failingTypes(() => {
        const sourceUS = addUser();

        return { sourceUS, uid: sourceUS.uid, ws: sourceUS.socket };
      });
      expect(failures).to.deep.equal([]);
    });

    it('every handler called with an unknown uid is ignored without throwing', async function () {
      const failures = await failingTypes(() => ({ sourceUS: null, uid: 'nobody', ws: mockSocket() }));
      expect(failures).to.deep.equal([]);
    });

    it('saveMetadata from an unknown uid does not throw', async function () {
      const data = { type: 'saveMetadata', uid: 'nobody', metadata: { source: 'none' }, method: 'patch', patch: [] };
      const reasons = await unhandledRejectionsOf(() => {
        AMS._handleUserWebSocketMessage({ data, ws: mockSocket(), sourceUS: null });
      });
      expect(reasons).to.deep.equal([]);
    });

    it('requestSlice without a User does not try to load a brain', function () {
      const sourceUS = addUser();
      const getBrain = sinon.spy(AMS, 'getBrainAtPath');
      AMS.receiveRequestSliceMessage({ type: 'requestSlice', view: 'sag', slice: 1, uid: sourceUS.uid }, sourceUS.socket);
      expect(getBrain.called).to.equal(false);
    });

    it('a valid paint message from a user with a User structure still paints', function () {
      const sourceUS = addUser({ username: 'a', iAtlas: 'a1', slice: 0, view: 'sag', x0: -1 });
      const paintxy = sinon.stub(AMS, 'paintxy');
      AMS.receivePaintMessage({ uid: sourceUS.uid, data: { c: 'mf', x: 1, y: 2 } });
      expect(paintxy.calledOnce).to.equal(true);
    });
  });

  describe('malformed messages', function () {
    it('a message that is not JSON is ignored', function () {
      const sourceUS = addUser({});
      expect(() => AMS._handleWebSocketMessage({ msg: 'not json {', ws: sourceUS.socket })).to.not.throw();
    });

    it('a message from a socket that is no longer connected is ignored', function () {
      const handle = sinon.spy(AMS, '_handleUserWebSocketMessage');
      expect(() => AMS._handleWebSocketMessage({ msg: JSON.stringify({ type: 'paint', data: {} }), ws: mockSocket() })).to.not.throw();
      expect(handle.called).to.equal(false);
    });

    it('userData allUserData without a user object is ignored', function () {
      const sourceUS = addUser();
      expect(() => AMS.receiveUserDataMessage({ uid: sourceUS.uid, description: 'allUserData' }, sourceUS.socket)).to.not.throw();
    });

    it('userData with a description that is not JSON is ignored', function () {
      const sourceUS = addUser({ username: 'a' });
      expect(() => AMS.receiveUserDataMessage({ uid: sourceUS.uid, description: 'not json {' }, sourceUS.socket)).to.not.throw();
      expect(sourceUS.User).to.deep.equal({ username: 'a' });
    });

    it('vectorial annotations for an atlas that is not loaded are ignored', function () {
      const sourceUS = addUser({ iAtlas: 'a404' });
      expect(() => AMS.receiveVectorialAnnotationMessage({ uid: sourceUS.uid, data: [] })).to.not.throw();
    });

    it('a ws message listener never throws', function () {
      const ws = mockSocket();
      AMS._handleWebSocketConnection(ws, { connection: { remoteAddress: '127.0.0.1' }, url: '/' });
      const [, onMessage] = ws.on.getCalls().find((c) => c.args[0] === 'message').args;
      sinon.stub(AMS, '_handleUserWebSocketMessage').throws(new Error('boom'));
      expect(() => onMessage(JSON.stringify({ type: 'echo' }))).to.not.throw();
    });
  });

  describe('failures while saving or unloading atlases', function () {
    it('saveAtlasAtIndex keeps the original error as the cause', async function () {
      const original = new Error('disk full');
      sinon.stub(AMS, '_saveAtlasVoxelData').rejects(original);
      let error;
      try {
        await AMS.saveAtlasAtIndex('a1');
      } catch (err) {
        error = err;
      }
      expect(error).to.be.an('error');
      expect(error.cause).to.equal(original);
    });

    it('the periodic backup of an atlas does not leave a rejection when saving fails', async function () {
      const atlas = { dirname: '/d/', filename: 'a.nii.gz' };
      sinon.stub(AMS, 'loadAtlas').resolves(atlas);
      sinon.stub(AMS, 'saveAtlasAtIndex').rejects(new Error('disk full'));
      const { backupInterval } = AMS;
      AMS.backupInterval = 1;
      try {
        const reasons = await unhandledRejectionsOf(async () => {
          await AMS.addAtlas({ atlasFilename: 'a.nii.gz', dirname: '/d/', source: 's' });
        });
        expect(AMS.saveAtlasAtIndex.called).to.equal(true);
        expect(reasons).to.deep.equal([]);
      } finally {
        clearInterval(atlas.timer);
        AMS.backupInterval = backupInterval;
      }
    });

    it('saveAllAtlases saves the other atlases when one fails, and resolves', async function () {
      AMS.Atlases.a1 = {};
      AMS.Atlases.a2 = {};
      const save = sinon.stub(AMS, 'saveAtlasAtIndex');
      save.withArgs('a1').rejects(new Error('disk full'));
      save.withArgs('a2').resolves();
      await AMS.saveAllAtlases();
      expect(save.calledWith('a2')).to.equal(true);
    });

    it('a save message whose save fails does not leave a rejection', async function () {
      const sourceUS = addUser({ dirname: '/d/', atlasFilename: 'a.nii.gz' });
      // an editor, as checked when the atlas was opened
      sourceUS.writeAccess = { '/d/a.nii.gz': { allowed: true, checkedAt: Date.now(), pending: null } };
      AMS.Atlases.a1 = { dirname: '/d/', filename: 'a.nii.gz' };
      sinon.stub(AMS, 'saveAtlasAtIndex').rejects(new Error('disk full'));
      const reasons = await unhandledRejectionsOf(() => {
        AMS._handleUserWebSocketMessage({ data: { type: 'save', uid: sourceUS.uid }, ws: sourceUS.socket, sourceUS });
      });
      expect(AMS.saveAtlasAtIndex.called).to.equal(true);
      expect(reasons).to.deep.equal([]);
    });

    it('unloadUnusedAtlases resolves when unloading an atlas fails', async function () {
      AMS.Atlases.a1 = { dirname: '/d/', filename: 'a.nii.gz' };
      sinon.stub(AMS, 'unloadAtlas').rejects(new Error('disk full'));
      await AMS.unloadUnusedAtlases();
    });

    it('a disconnecting user is removed even when unloading their atlas fails', async function () {
      const sourceUS = addUser({ dirname: '/d/', mri: 'm.nii.gz', atlasFilename: 'a.nii.gz' });
      sinon.stub(AMS, 'unloadAtlas').rejects(new Error('disk full'));
      await AMS._disconnectUser({ ws: sourceUS.socket });
      expect(AMS.US.filter((us) => us && us.uid === sourceUS.uid)).to.deep.equal([]);
    });

    it('the ws close listener does not reject when disconnecting fails', async function () {
      const ws = mockSocket();
      AMS._handleWebSocketConnection(ws, { connection: { remoteAddress: '127.0.0.1' }, url: '/' });
      const [, onClose] = ws.on.getCalls().find((c) => c.args[0] === 'close').args;
      sinon.stub(AMS, '_disconnectUser').rejects(new Error('boom'));
      await onClose();
    });
  });

  describe('unreadable MGZ files', function () {
    let dir;

    before(async function () {
      dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bb-mgz-'));
      // a valid header announcing 2x2x2 float voxels, but no voxel data
      const hdr = Buffer.alloc(284);
      [1, 2, 2, 2, 1, 3].forEach((v, i) => hdr.writeInt32BE(v, i * 4));
      await fs.promises.writeFile(path.join(dir, 'truncated.mgz'), await promisify(zlib.gzip)(hdr));
    });

    after(async function () {
      await fs.promises.rm(dir, { recursive: true, force: true });
    });

    it('a missing .mgz file gives a rejection, not an uncaught exception', async function () {
      let error;
      try {
        await amri.readMGZ(path.join(dir, 'missing.mgz'));
      } catch (err) {
        error = err;
      }
      expect(error).to.be.an('error');
    });

    it('a truncated .mgz file gives a rejection, not an uncaught exception', async function () {
      let error;
      try {
        await amri.readMGZ(path.join(dir, 'truncated.mgz'));
      } catch (err) {
        error = err;
      }
      expect(error).to.be.an('error');
    });
  });
});
