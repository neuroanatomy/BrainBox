/* eslint-disable max-lines */
// The WebSocket server applied every paint, vectorial, save and atlas message,
// whatever the user's access to the atlas: only embed connections were
// refused, and the username it knew came from the client's own 'userData'
// message. Now the user comes from the session cookie sent when the socket was
// opened, and the access from the database, as the HTTP API computes it.

const crypto = require('crypto');
const zlib = require('zlib');
const { expect } = require('chai');
const sinon = require('sinon');
const atlasmakerServer = require('../../controller/atlasmakerServer/atlasmakerServer.js');
const { usernameFromCookie, atlasAccessLevel, canEdit } = require('../../controller/atlasmakerServer/atlas-write-access.js');
const U = require('../utils.js');

const source = 'https://example.org/ws-write-access-spec.nii.gz';
const dirname = `/data/${crypto.createHash('md5').update(source)
  .digest('hex')}/`;
const shortname = 'wswriteaccessspec';

const project = {
  name: 'WS write access spec',
  shortname,
  owner: 'foo',
  collaborators: {
    list: [
      { userID: 'anyone', nickname: 'anyone', access: { collaborators: 'view', annotations: 'view', files: 'view' } },
      { userID: 'editor', nickname: 'editor', access: { collaborators: 'view', annotations: 'edit', files: 'view' } }
    ]
  },
  files: { list: [{ source }] },
  annotations: { list: [{ type: 'volume', name: 'Layer', values: 'foreground.json' }] }
};

const mri = {
  source,
  url: dirname,
  filename: 'brain.nii.gz',
  mri: {
    atlas: [
      { filename: 'project.nii.gz', project: shortname, name: 'Layer', access: 'edit' }, // stored access ignored
      { filename: 'public.nii.gz', name: 'Default', access: 'edit' },
      { filename: 'viewonly.nii.gz', name: 'View only', access: 'view' },
      { filename: 'orphan.nii.gz', name: 'Orphan', project: 'nosuchproject', access: 'view' }
    ]
  }
};

/**
 * A session middleware like express-session's, with sessions from a table
 * @param {object} sessions cookie -> passport user
 * @returns {function} The middleware
 */
const fakeSessionParser = (sessions) => (req, res, next) => {
  const user = sessions[req.headers.cookie];
  req.session = user ? { passport: { user } } : {};
  setImmediate(next);
};

const mockSocket = () => ({ send: sinon.spy(), close: sinon.spy(), readyState: 1, on: sinon.spy() });

let AMS;

/**
   * A connection that opened an atlas, as a client does: connect (with the
   * cookie, if any), send its User, ask for the atlas
   * @param {object} params Parameters
   * @param {string} params.cookie The Cookie header of the upgrade request
   * @param {string} params.username What the client says its name is
   * @param {string} params.filename The atlas
   * @returns {Promise<object>} The connection
   */
const openAtlas = async ({ cookie, username = 'Anonymous', filename }) => {
  const ws = mockSocket();
  const headers = cookie ? { cookie } : {};
  AMS._connectNewUser({ ws, req: { url: '/', headers } });
  const sourceUS = AMS.getUserFromSocket(ws);
  AMS.Atlases.a1 = { dirname, filename, data: Buffer.alloc(8), dim: [2, 2, 2] };
  sinon.stub(AMS, 'sendAtlasToUser');
  AMS.receiveUserDataMessage({
    uid: sourceUS.uid,
    description: 'allUserData',
    user: { username, dirname, atlasFilename: filename, source, mri: 'brain.nii.gz', iAtlas: 'a1', slice: 0, view: 'sag', x0: -1, y0: -1 }
  }, ws);
  AMS.receiveUserDataMessage({ uid: sourceUS.uid, description: 'sendAtlas' }, ws);
  await sourceUS.writeAccess[dirname + filename].pending;
  sinon.restore();

  return sourceUS;
};

const writes = [
  { type: 'paint', receiver: 'receivePaintMessage', data: { c: 'mf', x: 1, y: 1 } },
  { type: 'vectorial', receiver: 'receiveVectorialAnnotationMessage', data: [] },
  { type: 'save', receiver: 'receiveSaveMessage' },
  { type: 'atlas', receiver: 'receiveAtlasFromUserMessage', data: zlib.deflateSync(Buffer.alloc(8)) } // eslint-disable-line no-sync
];

/**
   * Send each write message, and list those that were applied
   * @param {object} sourceUS The connection
   * @returns {Array} The types applied
   */
const appliedWrites = (sourceUS) => {
  const applied = [];
  for (const { type, receiver, data } of writes) {
    const stub = sinon.stub(AMS, receiver).resolves();
    AMS._handleUserWebSocketMessage({ data: { type, uid: sourceUS.uid, data }, ws: sourceUS.socket, sourceUS });
    if (stub.called) {
      applied.push(type);
    }
    stub.restore();
  }

  return applied;
};

const allWrites = writes.map((w) => w.type);

describe('UNIT TESTING WEBSOCKET WRITE ACCESS', function () {
  before(async function () {
    const db = U.getNativeDB();
    await db.collection('mri').deleteMany({ source });
    await db.collection('project').deleteMany({ shortname });
    await db.collection('mri').insertOne(JSON.parse(JSON.stringify(mri)));
    await db.collection('project').insertOne(JSON.parse(JSON.stringify(project)));
  });

  after(async function () {
    const db = U.getNativeDB();
    await db.collection('mri').deleteMany({ source });
    await db.collection('project').deleteMany({ shortname });
  });

  describe('usernameFromCookie', function () {
    let parser;

    before(function () {
      parser = fakeSessionParser({
        'connect.sid=a': { username: 'editor', nickname: 'editor' },
        'connect.sid=old': { nickname: 'olduser', passhash: 'x' }, // stored by NeuroWebLab 0.0.1
        'connect.sid=bad': { username: '' }
      });
    });

    it('gives the username of the session', async function () {
      expect(await usernameFromCookie(parser, 'connect.sid=a')).to.equal('editor');
    });

    it('reads sessions stored by earlier versions', async function () {
      expect(await usernameFromCookie(parser, 'connect.sid=old')).to.equal('olduser');
    });

    it('gives null without a cookie, a session, a user or a parser', async function () {
      expect(await usernameFromCookie(parser)).to.equal(null);
      expect(await usernameFromCookie(parser, 'connect.sid=unknown')).to.equal(null);
      expect(await usernameFromCookie(parser, 'connect.sid=bad')).to.equal(null);
      expect(await usernameFromCookie(null, 'connect.sid=a')).to.equal(null);
    });

    it('gives null when the session store fails', async function () {
      const failing = (req, res, next) => next(new Error('store down'));
      expect(await usernameFromCookie(failing, 'connect.sid=a')).to.equal(null);
    });
  });

  describe('atlasAccessLevel, as the HTTP API gives it', function () {
    const level = (username, filename, src = source, dir = dirname) => atlasAccessLevel(U.getNativeDB(), { username, dirname: dir, filename, source: src });

    it('a project layer: the project\'s annotation access for the user', async function () {
      expect(await level('foo', 'project.nii.gz')).to.equal('remove'); // owner
      expect(await level('editor', 'project.nii.gz')).to.equal('edit');
      expect(await level('bar', 'project.nii.gz')).to.equal('view'); // as anyone
      expect(await level(null, 'project.nii.gz')).to.equal('view'); // anonymous
    });

    it('a layer without a project, or whose project is gone: the stored access', async function () {
      expect(await level(null, 'public.nii.gz')).to.equal('edit');
      expect(await level('editor', 'viewonly.nii.gz')).to.equal('view');
      expect(await level('editor', 'orphan.nii.gz')).to.equal('view');
    });

    it('none for a layer that is not in the MRI document', async function () {
      expect(await level('foo', 'nosuchlayer.nii.gz')).to.equal('none');
    });

    it('none when the source does not match the atlas directory', async function () {
      expect(await level('foo', 'public.nii.gz', 'https://example.org/other.nii.gz')).to.equal('none');
      expect(await level('foo', 'public.nii.gz', source, '/data/0123/')).to.equal('none');
      expect(await level('foo', 'public.nii.gz', null)).to.equal('none');
    });

    it('canEdit is true from edit up', function () {
      expect(['none', 'view', 'edit', 'add', 'remove', undefined].map(canEdit)) // eslint-disable-line no-undefined
        .to.deep.equal([false, false, true, true, true, false]);
    });
  });

  // eslint-disable-next-line max-statements
  describe('the WebSocket server', function () {
    const sessions = { 'connect.sid=editor': { username: 'editor' }, 'connect.sid=bar': { username: 'bar' } };

    before(function () {
      AMS = atlasmakerServer(U.getDB(), U.getNativeDB());
    });

    beforeEach(function () {
      AMS.US = [];
      AMS.Atlases = {};
      AMS.sessionParser = fakeSessionParser(sessions);
      AMS.writeAccessMode = 'enforce';
    });

    afterEach(function () {
      sinon.restore();
      AMS.US = [];
      AMS.Atlases = {};
    });


    it('applies the writes of a collaborator with edit access', async function () {
      const sourceUS = await openAtlas({ cookie: 'connect.sid=editor', username: 'editor', filename: 'project.nii.gz' });
      expect(appliedWrites(sourceUS)).to.deep.equal(allWrites);
    });

    it('refuses the writes of a logged-in user with view access', async function () {
      const sourceUS = await openAtlas({ cookie: 'connect.sid=bar', username: 'bar', filename: 'project.nii.gz' });
      expect(appliedWrites(sourceUS)).to.deep.equal([]);
    });

    it('refuses the writes of an anonymous user with view access', async function () {
      const sourceUS = await openAtlas({ filename: 'project.nii.gz' });
      expect(appliedWrites(sourceUS)).to.deep.equal([]);
    });

    it('refuses the writes of a client that says it is the project\'s owner', async function () {
      const sourceUS = await openAtlas({ username: 'foo', filename: 'project.nii.gz' });
      expect(sourceUS.User.username).to.equal('foo');
      expect(appliedWrites(sourceUS)).to.deep.equal([]);
    });

    it('applies the writes of an anonymous user on a layer anyone can edit', async function () {
      const sourceUS = await openAtlas({ filename: 'public.nii.gz' });
      expect(appliedWrites(sourceUS)).to.deep.equal(allWrites);
    });

    it('refuses writes to a view-only layer without a project', async function () {
      const sourceUS = await openAtlas({ cookie: 'connect.sid=editor', filename: 'viewonly.nii.gz' });
      expect(appliedWrites(sourceUS)).to.deep.equal([]);
    });

    it('checks the atlas actually written, not the one the client says it has open', async function () {
      // allowed on the public layer, then points iAtlas at a view-only one
      const sourceUS = await openAtlas({ filename: 'public.nii.gz' });
      AMS.Atlases.a2 = { dirname, filename: 'viewonly.nii.gz', data: Buffer.alloc(8), dim: [2, 2, 2] };
      AMS.receiveUserDataMessage({ uid: sourceUS.uid, description: JSON.stringify({ iAtlas: 'a2' }) }, sourceUS.socket);
      const paint = sinon.stub(AMS, 'receivePaintMessage');
      AMS._handleUserWebSocketMessage({ data: { type: 'paint', uid: sourceUS.uid, data: { c: 'mf', x: 1, y: 1 } }, ws: sourceUS.socket, sourceUS });
      expect(paint.called).to.equal(false);
      await sourceUS.writeAccess[dirname + 'viewonly.nii.gz'].pending;
      AMS._handleUserWebSocketMessage({ data: { type: 'paint', uid: sourceUS.uid, data: { c: 'mf', x: 1, y: 1 } }, ws: sourceUS.socket, sourceUS });
      expect(paint.called).to.equal(false);
    });

    it('refuses writes when no atlas is open', function () {
      const ws = mockSocket();
      AMS._connectNewUser({ ws, req: { url: '/', headers: {} } });
      const sourceUS = AMS.getUserFromSocket(ws);
      sourceUS.User = { iAtlas: 'a404', dirname, atlasFilename: 'public.nii.gz', source };
      expect(appliedWrites(sourceUS)).to.deep.equal([]);
    });

    it('refuses writes until the access has been checked', function () {
      const ws = mockSocket();
      AMS._connectNewUser({ ws, req: { url: '/', headers: {} } });
      const sourceUS = AMS.getUserFromSocket(ws);
      AMS.Atlases.a1 = { dirname, filename: 'public.nii.gz' };
      sourceUS.User = { iAtlas: 'a1', dirname, atlasFilename: 'public.nii.gz', source };
      expect(appliedWrites(sourceUS)).to.deep.equal([]);
      expect(sourceUS.writeAccess[dirname + 'public.nii.gz'].pending).to.be.a('promise');
    });

    it('checks again after a while: a logout or a lost access is seen', async function () {
      const sourceUS = await openAtlas({ cookie: 'connect.sid=editor', filename: 'project.nii.gz' });
      expect(appliedWrites(sourceUS)).to.deep.equal(allWrites);
      delete sessions['connect.sid=editor']; // logged out
      try {
        sourceUS.writeAccess[dirname + 'project.nii.gz'].checkedAt -= 60 * 1000;
        // the next write starts a new check (and is decided by the previous one)
        appliedWrites(sourceUS);
        await sourceUS.writeAccess[dirname + 'project.nii.gz'].pending;
        expect(appliedWrites(sourceUS)).to.deep.equal([]);
      } finally {
        sessions['connect.sid=editor'] = { username: 'editor' };
      }
    });

    it('checks again when the MRI document is saved', async function () {
      // a project page opens a layer, then saves the MRI document that lists it
      const sourceUS = await openAtlas({ cookie: 'connect.sid=editor', filename: 'newlayer.nii.gz' });
      expect(appliedWrites(sourceUS)).to.deep.equal([]);
      const db = U.getNativeDB();
      const doc = await db.collection('mri').findOne({ source, backup: { $exists: false } }, { projection: { _id: 0 } });
      doc.mri.atlas.push({ filename: 'newlayer.nii.gz', project: shortname, name: 'Layer' });
      await AMS.receiveSaveMetadataMessage({ uid: sourceUS.uid, metadata: doc, method: 'append' });
      await sourceUS.writeAccess[dirname + 'newlayer.nii.gz'].pending;
      expect(appliedWrites(sourceUS)).to.deep.equal(allWrites);
    });

    it('does not broadcast refused writes to the other users', async function () {
      const sourceUS = await openAtlas({ filename: 'viewonly.nii.gz' });
      const broadcast = sinon.stub(AMS, '_handleBroadcastWebSocketMessage');
      sinon.stub(AMS, 'receivePaintMessage');
      AMS._handleWebSocketMessage({ msg: JSON.stringify({ type: 'paint', data: { c: 'mf', x: 1, y: 1 } }), ws: sourceUS.socket });
      expect(broadcast.called).to.equal(false);
      AMS._handleWebSocketMessage({ msg: JSON.stringify({ type: 'show', data: { x: 1, y: 1 } }), ws: sourceUS.socket });
      expect(broadcast.called).to.equal(true);
    });

    it('in "log" mode, logs the writes it would refuse and applies them', async function () {
      const sourceUS = await openAtlas({ filename: 'viewonly.nii.gz' });
      AMS.writeAccessMode = 'log';
      expect(appliedWrites(sourceUS)).to.deep.equal(allWrites);
    });

    it('the session cookie of the upgrade request is kept with the connection', function () {
      const ws = mockSocket();
      AMS._connectNewUser({ ws, req: { url: '/', headers: { cookie: 'connect.sid=editor' } } });
      expect(AMS.getUserFromSocket(ws).cookie).to.equal('connect.sid=editor');
    });
  });
});
