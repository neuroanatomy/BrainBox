// The WebSocket server's 'saveMetadata': the user comes from the session
// cookie of the connection, the client's copy of the MRI document is merged
// into the stored one with only the changes the user may make, and the user is
// told once what was not saved. It used to store the client's copy as it was.

const crypto = require('crypto');
const { expect } = require('chai');
const sinon = require('sinon');
const atlasmakerServer = require('../../controller/atlasmakerServer/atlasmakerServer.js');
const U = require('../utils.js');

const source = 'https://example.org/ws-save-metadata-spec.nii.gz';
const dirname = `/data/${crypto.createHash('md5').update(source)
  .digest('hex')}/`;
const shortname = 'wssavemetadataspec';
const hidden = 'wssavemetadataspecprivate';

const projects = [
  {
    name: 'WS save metadata spec',
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
  },
  {
    name: 'WS save metadata spec, private',
    shortname: hidden,
    owner: 'foo',
    collaborators: { list: [{ userID: 'anyone', nickname: 'anyone', access: { collaborators: 'none', annotations: 'none', files: 'none' } }] },
    files: { list: [] },
    annotations: { list: [] }
  }
];

const mri = {
  source,
  url: dirname,
  filename: 'brain.nii.gz',
  name: 'Brain',
  owner: 'mowner',
  mri: {
    atlas: [
      { filename: 'Atlas.nii.gz', name: 'Default', access: 'edit' },
      { filename: 'project.nii.gz', project: shortname, name: 'Layer', access: 'view' },
      { filename: 'hidden.nii.gz', project: hidden, name: 'Hidden', access: 'none' }
    ],
    annotations: { [shortname]: { Note: { type: 'text', data: 'note' } } }
  }
};

const fakeSessionParser = (sessions) => (req, res, next) => {
  const user = sessions[req.headers.cookie];
  req.session = user ? { passport: { user } } : {};
  setImmediate(next);
};

const mockSocket = () => ({ send: sinon.spy(), close: sinon.spy(), readyState: 1, on: sinon.spy() });

// eslint-disable-next-line max-statements
describe('UNIT TESTING SAVEMETADATA OVER THE WEBSOCKET', function () {
  let AMS;
  const sessions = { 'connect.sid=editor': { username: 'editor' }, 'connect.sid=bar': { username: 'bar' }, 'connect.sid=mowner': { username: 'mowner' } };

  const db = () => U.getNativeDB();
  const storedDoc = () => db().collection('mri')
    .findOne({ source, backup: { $exists: false } }, { projection: { _id: 0 } });
  const layer = (doc, filename) => doc.mri.atlas.find((a) => a.filename === filename);

  /**
   * A connection, as a page opens it
   * @param {string} cookie The Cookie header of the upgrade request
   * @param {string} username What the client says its name is
   * @returns {object} The connection
   */
  const connect = (cookie, username = 'Anonymous') => {
    const ws = mockSocket();
    AMS._connectNewUser({ ws, req: { url: '/', headers: cookie ? { cookie } : {} } });
    const sourceUS = AMS.getUserFromSocket(ws);
    sourceUS.User = { username, source, dirname, atlasFilename: 'Atlas.nii.gz', projectPage: shortname };

    return sourceUS;
  };

  /**
   * Send a saveMetadata message as the client does, and wait for it
   * @param {object} sourceUS The connection
   * @param {object} metadata The document
   * @param {object} options { method, patch }
   * @returns {Promise<void>} Once the save is over
   */
  const saveMetadata = async (sourceUS, metadata, { method = 'append', patch } = {}) => {
    AMS._handleWebSocketMessage({ msg: JSON.stringify({ type: 'saveMetadata', metadata, method, patch, rnd: 'x' }), ws: sourceUS.socket });
    await sourceUS.metadataSave;
  };

  const notices = (sourceUS) => sourceUS.socket.send.args
    .map(([msg]) => JSON.parse(msg))
    .filter((msg) => msg.type === 'writeRefused');

  /**
   * The copy a project page has: the layers the user cannot see are left out
   * @returns {Promise<object>} The copy
   */
  const projectPageCopy = async () => {
    const doc = await storedDoc();
    doc.mri.atlas = doc.mri.atlas.filter((a) => a.project !== hidden);
    layer(doc, 'project.nii.gz').access = 'view';

    return doc;
  };

  before(function () {
    AMS = atlasmakerServer(U.getNativeDB());
  });

  beforeEach(async function () {
    await db().collection('mri')
      .deleteMany({ source });
    await db().collection('project')
      .deleteMany({ shortname: { $in: [shortname, hidden] } });
    await db().collection('mri')
      .insertOne(JSON.parse(JSON.stringify(mri)));
    await db().collection('project')
      .insertMany(JSON.parse(JSON.stringify(projects)));
    AMS.US = [];
    AMS.Atlases = {};
    AMS.sessionParser = fakeSessionParser(sessions);
    AMS.writeAccessMode = 'enforce';
  });

  afterEach(function () {
    sinon.restore();
    AMS.US = [];
  });

  after(async function () {
    await db().collection('mri')
      .deleteMany({ source });
    await db().collection('project')
      .deleteMany({ shortname: { $in: [shortname, hidden] } });
  });

  it('a viewer\'s project page that creates its layer keeps the layers it does not show', async function () {
    const sourceUS = connect('connect.sid=bar', 'bar');
    const copy = await projectPageCopy();
    copy.mri.atlas.push({ filename: 'new.nii.gz', name: 'Layer 2', project: shortname, access: 'view', owner: 'bar', type: 'volume' });
    await saveMetadata(sourceUS, copy);
    const doc = await storedDoc();
    expect(doc.mri.atlas.map((a) => a.filename)).to.deep.equal(['Atlas.nii.gz', 'project.nii.gz', 'hidden.nii.gz', 'new.nii.gz']);
    expect(layer(doc, 'hidden.nii.gz')).to.deep.equal(mri.mri.atlas[2]);
    expect(layer(doc, 'new.nii.gz')).to.include({ project: shortname, access: 'view', owner: 'bar' });
    expect(notices(sourceUS)).to.deep.equal([]);
  });

  it('refuses to detach a layer from its project or to raise its stored access', async function () {
    const sourceUS = connect(null, 'foo');
    const copy = await projectPageCopy();
    layer(copy, 'project.nii.gz').project = '';
    layer(copy, 'project.nii.gz').access = 'edit';
    await saveMetadata(sourceUS, copy);
    const doc = await storedDoc();
    expect(layer(doc, 'project.nii.gz')).to.include({ project: shortname, access: 'view' });
  });

  it('tells the user once what was not saved, without switching a layer to view only', async function () {
    const sourceUS = connect('connect.sid=bar', 'bar');
    const copy = await projectPageCopy();
    copy.name = 'Renamed';
    await saveMetadata(sourceUS, copy);
    await saveMetadata(sourceUS, copy);
    expect((await storedDoc()).name).to.equal('Brain');
    expect(notices(sourceUS)).to.deep.equal([{ type: 'writeRefused', write: 'saveMetadata', atlas: null, reason: 'you may not rename this MRI' }]);
  });

  it('applies the changes the user may make', async function () {
    const owner = connect('connect.sid=mowner', 'mowner');
    const copy = await storedDoc();
    copy.name = 'Renamed';
    await saveMetadata(owner, copy);
    expect((await storedDoc()).name).to.equal('Renamed');
    const editor = connect('connect.sid=editor', 'editor');
    const copy2 = await projectPageCopy();
    copy2.mri.annotations[shortname].Note.data = 'edited';
    layer(copy2, 'project.nii.gz').name = 'Renamed layer';
    await saveMetadata(editor, copy2);
    const doc = await storedDoc();
    expect(doc.mri.annotations[shortname].Note.data).to.equal('edited');
    expect(layer(doc, 'project.nii.gz').name).to.equal('Renamed layer');
    expect(doc.modifiedBy).to.equal('editor');
    expect(notices(owner).concat(notices(editor))).to.deep.equal([]);
  });

  it('a patch is checked the same way', async function () {
    const sourceUS = connect(null, 'foo');
    const copy = await storedDoc();
    await saveMetadata(sourceUS, copy, { method: 'patch', patch: [{ op: 'replace', path: '/mri/atlas/1/project', value: '' }] });
    expect(layer(await storedDoc(), 'project.nii.gz').project).to.equal(shortname);
  });

  it('does not create the document of an MRI that is not in the database', async function () {
    const sourceUS = connect('connect.sid=bar', 'bar');
    const copy = await storedDoc();
    await db().collection('mri')
      .deleteMany({ source });
    await saveMetadata(sourceUS, copy);
    expect(await storedDoc()).to.equal(null);
  });

  it('sends the other users what was saved, once saved', async function () {
    const sourceUS = connect('connect.sid=bar', 'bar');
    const broadcast = sinon.stub(AMS, '_handleBroadcastWebSocketMessage');
    const copy = await projectPageCopy();
    copy.name = 'Renamed';
    await saveMetadata(sourceUS, copy);
    const sent = broadcast.args.map(([{ data }]) => data).filter((d) => d.type === 'saveMetadata');
    expect(sent).to.have.length(1);
    expect(sent[0].metadata.name).to.equal('Brain');
    expect(sent[0].metadata.mri.atlas.map((a) => a.filename)).to.deep.equal(['Atlas.nii.gz', 'project.nii.gz']);
  });

  it('in "log" mode, saves the client\'s copy as before and tells nothing', async function () {
    AMS.writeAccessMode = 'log';
    const sourceUS = connect(null, 'foo');
    const copy = await projectPageCopy();
    copy.name = 'Renamed';
    await saveMetadata(sourceUS, copy);
    const doc = await storedDoc();
    expect(doc.name).to.equal('Renamed');
    expect(doc.mri.atlas.map((a) => a.filename)).to.deep.equal(['Atlas.nii.gz', 'project.nii.gz']);
    expect(doc.modifiedBy).to.equal('foo');
    expect(notices(sourceUS)).to.deep.equal([]);
  });

  it('stores the saves of a connection in the order they were sent, even when the first one takes longer to check', async function () {
    // a page sends the saves it held while disconnected all at once
    // (found while porting PR #342, 9db9de4, Nicolas Traut)
    let calls = 0;
    const parser = fakeSessionParser(sessions);
    AMS.sessionParser = (req, res, next) => {
      calls += 1;
      const delay = (calls === 1) ? 50 : 0; // the first session lookup is the slowest
      setTimeout(() => parser(req, res, next), delay);
    };
    const owner = connect('connect.sid=mowner', 'mowner');
    const first = await storedDoc();
    first.name = 'First';
    const second = await storedDoc();
    second.name = 'Second';
    AMS._handleWebSocketMessage({ msg: JSON.stringify({ type: 'saveMetadata', metadata: first, method: 'append', rnd: 'x' }), ws: owner.socket });
    AMS._handleWebSocketMessage({ msg: JSON.stringify({ type: 'saveMetadata', metadata: second, method: 'append', rnd: 'y' }), ws: owner.socket });
    await owner.metadataSave;
    await new Promise((resolve) => { setTimeout(resolve, 100); });
    expect((await storedDoc()).name).to.equal('Second');
  });
});
