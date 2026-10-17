// The WebSocket server sent the content of any layer it was asked for, told
// every user which layer the others had open, and relayed strokes to anyone
// who said they were on the same layer. Now a layer is sent only to users who
// may see it, as the HTTP API decides it, and the other users are not told
// the layer's file name.

const crypto = require('crypto');
const { expect } = require('chai');
const atlasmakerServer = require('../../controller/atlasmakerServer/atlasmakerServer.js');
const { atlasReadAccess } = require('../../controller/atlasmakerServer/atlas-write-access.js');
const U = require('../utils.js');

const source = 'https://example.org/ws-read-access-spec.nii.gz';
const dirname = `/data/${crypto.createHash('md5').update(source)
  .digest('hex')}/`;
const shortname = 'wsreadaccessspec';

const project = {
  name: 'WS read access spec',
  shortname,
  owner: 'foo',
  collaborators: {
    list: [
      { userID: 'anyone', nickname: 'anyone', access: { collaborators: 'none', annotations: 'none', files: 'view' } },
      { userID: 'viewer', nickname: 'viewer', access: { collaborators: 'view', annotations: 'view', files: 'view' } }
    ]
  },
  files: { list: [{ source }] },
  annotations: { list: [] }
};

const mri = {
  source,
  url: dirname,
  filename: 'brain.nii.gz',
  mri: {
    atlas: [
      { filename: 'hidden.nii.gz', project: shortname, name: 'Hidden', access: 'edit' }, // stored access ignored
      { filename: 'public.nii.gz', name: 'Default', access: 'edit' },
      { filename: 'stored-none.nii.gz', name: 'No project', access: 'none' },
      { filename: 'orphan.nii.gz', name: 'Orphan', project: 'nosuchprojectwsread', access: 'none' }
    ]
  }
};

const read = (params) => atlasReadAccess(U.getNativeDB(), { dirname, source, ...params });

describe('UNIT TESTING WEBSOCKET READ ACCESS', function () {
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

  describe('atlasReadAccess', function () {
    it('hides a layer of a project whose annotations the user cannot see', async function () {
      expect(await read({ username: null, filename: 'hidden.nii.gz' })).to.deep.equal({ hidden: true, level: 'none' });
      expect(await read({ username: 'nonmember', filename: 'hidden.nii.gz' })).to.include({ hidden: true });
    });

    it('shows it to a collaborator who may view the annotations, and to the project\'s owner', async function () {
      expect(await read({ username: 'viewer', filename: 'hidden.nii.gz' })).to.deep.equal({ hidden: false, level: 'view' });
      expect(await read({ username: 'foo', filename: 'hidden.nii.gz' })).to.include({ hidden: false });
    });

    it('shows the layers without a project, or whose project is gone, as the HTTP API does', async function () {
      expect(await read({ username: null, filename: 'public.nii.gz' })).to.include({ hidden: false });
      expect(await read({ username: null, filename: 'stored-none.nii.gz' })).to.include({ hidden: false });
      expect(await read({ username: null, filename: 'orphan.nii.gz' })).to.include({ hidden: false });
    });

    it('shows a file the MRI does not list (a layer a project page has just created)', async function () {
      expect(await read({ username: null, filename: 'not-listed-yet.nii.gz' })).to.include({ hidden: false });
    });

    it('finds the MRI by its directory, whatever source the client says', async function () {
      expect(await read({ username: null, filename: 'hidden.nii.gz', source: 'https://example.org/other.nii.gz' })).to.include({ hidden: true });
      expect(await read({ username: null, filename: 'hidden.nii.gz', source: undefined })).to.include({ hidden: true }); // eslint-disable-line no-undefined
    });

    it('uses the latest version of the document, also while a save replaces it', async function () {
      await U.getNativeDB().collection('mri')
        .updateMany({ source }, { $set: { backup: true } });
      try {
        expect(await read({ username: null, filename: 'hidden.nii.gz' })).to.include({ hidden: true });
      } finally {
        await U.getNativeDB().collection('mri')
          .updateMany({ source }, { $unset: { backup: '' } });
      }
    });

    it('hides what it cannot place', async function () {
      expect(await read({ username: null, filename: null })).to.include({ hidden: true });
      expect(await read({ username: null, filename: 'hidden.nii.gz', dirname: 42 })).to.include({ hidden: true });
    });
  });

  describe('what the other users are told', function () {
    let AMS;

    before(function () {
      AMS = atlasmakerServer(U.getDB(), U.getNativeDB());
    });

    it('leaves the open layer out of a user\'s data', function () {
      const data = { type: 'userData', uid: 'u1', description: 'allUserData', user: { username: 'x', source, dirname, atlasFilename: 'hidden.nii.gz', iAtlas: 'a3', view: 'sag', slice: 4 } };
      const told = AMS._publicUserData(data);
      expect(told.user).to.deep.equal({ username: 'x', source, dirname, view: 'sag', slice: 4 });
      expect(data.user.atlasFilename).to.equal('hidden.nii.gz', 'the server keeps it');
    });

    it('leaves it out of a change, and keeps the other changes', function () {
      const told = AMS._publicUserData({ type: 'userData', uid: 'u1', description: JSON.stringify({ atlasFilename: 'hidden.nii.gz', iAtlas: 'a3', slice: 5 }) });
      expect(JSON.parse(told.description)).to.deep.equal({ slice: 5 });
      expect(AMS._publicUserData({ type: 'userData', uid: 'u1', description: 'sendAtlas' }).description).to.equal('sendAtlas');
    });

    it('relays strokes on an atlas only to a connection that opened it and may see it', function () {
      const target = { dirname, filename: 'hidden.nii.gz' };
      const now = Date.now();
      expect(AMS._mayRelayAtlas({ uid: 'u9' }, target)).to.equal(AMS.writeAccessMode === 'log');
      const allowed = { uid: 'u10', readAccess: { [dirname + 'hidden.nii.gz']: { readable: true, checkedAt: now, target } } };
      expect(AMS._mayRelayAtlas(allowed, target)).to.equal(true);
      const refused = { uid: 'u11', socket: { send: () => null }, readAccess: { [dirname + 'hidden.nii.gz']: { readable: false, checkedAt: now, target } } };
      expect(AMS._mayRelayAtlas(refused, target)).to.equal(AMS.writeAccessMode === 'log');
    });
  });
});
