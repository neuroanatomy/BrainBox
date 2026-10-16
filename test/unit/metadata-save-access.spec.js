/* eslint-disable max-lines */
// What each kind of user may change when they save an MRI document over the
// WebSocket ('saveMetadata'). The server used to store the client's copy as it
// was: anyone could detach a layer from its project or raise its stored access
// (and then paint on it), and a page that did not show some layers deleted them.

const { expect } = require('chai');
const { mergeMetadata, savedView } = require('../../controller/atlasmakerServer/metadata-save-access.js');

const source = 'https://example.org/metadata-save-access-spec.nii.gz';

const projectP = {
  shortname: 'mdsavespec',
  owner: 'pown',
  collaborators: {
    list: [
      { userID: 'anyone', nickname: 'anyone', access: { collaborators: 'view', annotations: 'view', files: 'view' } },
      { userID: 'editor', nickname: 'editor', access: { collaborators: 'view', annotations: 'edit', files: 'view' } },
      { userID: 'fileditor', nickname: 'fileditor', access: { collaborators: 'view', annotations: 'view', files: 'edit' } }
    ]
  },
  files: { list: [{ source }] },
  annotations: { list: [{ type: 'volume', name: 'Layer', values: 'foreground.json' }] }
};

const projectQ = {
  shortname: 'mdsavespecprivate',
  owner: 'qown',
  collaborators: { list: [{ userID: 'anyone', nickname: 'anyone', access: { collaborators: 'none', annotations: 'none', files: 'none' } }] },
  files: { list: [] },
  annotations: { list: [] }
};

const projects = new Map([[projectP.shortname, projectP], [projectQ.shortname, projectQ]]);

const stored = {
  source,
  url: '/data/0123456789abcdef/',
  filename: 'brain.nii.gz',
  name: 'Brain',
  owner: 'mowner',
  dim: [2, 2, 2],
  modified: '2026-01-01T00:00:00.000Z',
  modifiedBy: 'mowner',
  mri: {
    atlas: [
      { filename: 'Atlas.nii.gz', name: 'Default', access: 'edit', labels: 'foreground.json' },
      { filename: 'viewonly.nii.gz', name: 'View only', access: 'view', labels: 'foreground.json' },
      { filename: 'p.nii.gz', name: 'Layer', project: projectP.shortname, access: 'view', owner: 'pown', labels: 'foreground.json' },
      { filename: 'q.nii.gz', name: 'Hidden', project: projectQ.shortname, access: 'none', owner: 'qown', labels: 'foreground.json' }
    ],
    annotations: {
      [projectP.shortname]: { Note: { type: 'text', data: 'stored note' } },
      [projectQ.shortname]: { Secret: { type: 'text', data: 'secret' } }
    }
  }
};

// the users, by their server-verified username (null: anonymous)
const users = {
  mriOwner: 'mowner',
  projectOwner: 'pown',
  annotationsEditor: 'editor',
  filesEditor: 'fileditor',
  viewer: 'bar',
  anonymous: null
};

const copy = () => JSON.parse(JSON.stringify(stored));
const layer = (doc, filename) => doc.mri.atlas.find((a) => a.filename === filename);

/**
 * Save a changed copy of the stored document as a user
 * @param {string|null} username The user
 * @param {function} change Changes the copy
 * @returns {object} { doc, refused }
 */
const save = (username, change) => {
  const incoming = copy();
  change(incoming);

  return mergeMetadata({ stored: copy(), incoming, username, projects });
};

/**
 * The users for whom a change is applied, and those told it was not
 * @param {function} change Changes the copy
 * @param {function} applied Whether the change is in the merged document
 * @returns {object} { applied: [user classes], told: [user classes] }
 */
const whoMay = (change, applied) => {
  const res = { applied: [], told: [] };
  for (const [who, username] of Object.entries(users)) {
    const { doc, refused } = save(username, change);
    if (applied(doc)) {
      res.applied.push(who);
    }
    if (refused.some((r) => r.notify)) {
      res.told.push(who);
    }
  }

  return res;
};

const allUsers = Object.keys(users);
const nobody = [];

// eslint-disable-next-line max-statements
describe('UNIT TESTING WHAT A METADATA SAVE MAY CHANGE', function () {
  it('a layer cannot be detached from its project, by anyone', function () {
    const res = whoMay((d) => { layer(d, 'p.nii.gz').project = ''; }, (doc) => !layer(doc, 'p.nii.gz').project);
    expect(res).to.deep.equal({ applied: nobody, told: allUsers });
    const res2 = whoMay((d) => { layer(d, 'p.nii.gz').project = projectQ.shortname; }, (doc) => layer(doc, 'p.nii.gz').project !== projectP.shortname);
    expect(res2.applied).to.deep.equal(nobody);
    // a field left out is kept
    const res3 = whoMay((d) => { delete layer(d, 'p.nii.gz').project; }, (doc) => !layer(doc, 'p.nii.gz').project);
    expect(res3.applied).to.deep.equal(nobody);
  });

  it('the stored access of a layer without a project: only the MRI\'s owner may change it', function () {
    const res = whoMay((d) => { layer(d, 'viewonly.nii.gz').access = 'edit'; }, (doc) => layer(doc, 'viewonly.nii.gz').access === 'edit');
    expect(res).to.deep.equal({ applied: ['mriOwner'], told: allUsers.filter((u) => u !== 'mriOwner') });
  });

  it('the stored access of a project layer is kept, without telling (pages send the user\'s own access there)', function () {
    const res = whoMay((d) => { layer(d, 'p.nii.gz').access = 'edit'; }, (doc) => layer(doc, 'p.nii.gz').access === 'edit');
    expect(res).to.deep.equal({ applied: nobody, told: nobody });
  });

  it('a layer left out of the copy (one the user cannot see) is kept, without telling', function () {
    for (const filename of ['q.nii.gz', 'p.nii.gz', 'Atlas.nii.gz']) {
      const res = whoMay((d) => { d.mri.atlas = d.mri.atlas.filter((a) => a.filename !== filename); }, (doc) => Boolean(layer(doc, filename)));
      expect(res, filename).to.deep.equal({ applied: allUsers, told: nobody });
    }
  });

  it('a hidden layer kept is not changed', function () {
    const { doc } = save(users.viewer, (d) => { d.mri.atlas = d.mri.atlas.filter((a) => a.filename !== 'q.nii.gz'); });
    expect(layer(doc, 'q.nii.gz')).to.deep.equal(stored.mri.atlas[3]);
    expect(doc.mri.atlas.map((a) => a.filename)).to.deep.equal(stored.mri.atlas.map((a) => a.filename));
  });

  it('a new layer in a project the user can see is added, with the user\'s access and the user as owner (as a project page does)', function () {
    const newLayer = (d) => d.mri.atlas.push({ filename: 'new.nii.gz', name: 'Layer 2', project: projectP.shortname, access: 'view', owner: 'whoever', labels: 'foreground.json' });
    const res = whoMay(newLayer, (doc) => Boolean(layer(doc, 'new.nii.gz')));
    expect(res).to.deep.equal({ applied: allUsers, told: nobody });
    expect(layer(save(users.viewer, newLayer).doc, 'new.nii.gz')).to.include({ access: 'view', owner: 'bar', name: 'Layer 2' });
    expect(layer(save(users.anonymous, newLayer).doc, 'new.nii.gz')).to.include({ access: 'view', owner: 'anonymous' });
    expect(layer(save(users.annotationsEditor, newLayer).doc, 'new.nii.gz')).to.include({ access: 'edit', owner: 'editor' });
    expect(layer(save(users.projectOwner, newLayer).doc, 'new.nii.gz')).to.include({ access: 'remove', owner: 'pown' });
  });

  it('a new layer cannot claim more access than the user has', function () {
    const { doc, refused } = save(users.viewer, (d) => d.mri.atlas.push({ filename: 'new.nii.gz', name: 'L', project: projectP.shortname, access: 'edit' }));
    expect(layer(doc, 'new.nii.gz').access).to.equal('view');
    expect(refused.filter((r) => r.notify)).to.have.length(1);
  });

  it('a new layer in a project whose annotations the user cannot see is dropped, without telling', function () {
    const res = whoMay((d) => d.mri.atlas.push({ filename: 'new.nii.gz', name: 'L', project: projectQ.shortname, access: 'none' }), (doc) => Boolean(layer(doc, 'new.nii.gz')));
    expect(res).to.deep.equal({ applied: nobody, told: nobody });
  });

  it('a new layer in a project that does not exist is refused', function () {
    const res = whoMay((d) => d.mri.atlas.push({ filename: 'new.nii.gz', name: 'L', project: 'nosuchproject', access: 'edit' }), (doc) => Boolean(layer(doc, 'new.nii.gz')));
    expect(res).to.deep.equal({ applied: nobody, told: allUsers });
  });

  it('a new layer without a project: only the MRI\'s owner may add it', function () {
    const res = whoMay((d) => d.mri.atlas.push({ filename: 'new.nii.gz', name: 'L', access: 'edit' }), (doc) => Boolean(layer(doc, 'new.nii.gz')));
    expect(res).to.deep.equal({ applied: ['mriOwner'], told: allUsers.filter((u) => u !== 'mriOwner') });
  });

  it('a new layer whose file name is not a plain file name is refused', function () {
    for (const filename of ['../evil.nii.gz', '.hidden', '', 3]) {
      const { doc, refused } = save(users.mriOwner, (d) => d.mri.atlas.push({ filename, name: 'L', project: projectP.shortname }));
      expect(doc.mri.atlas, String(filename)).to.have.length(stored.mri.atlas.length);
      expect(refused.filter((r) => r.notify), String(filename)).to.have.length(1);
    }
  });

  it('the MRI may be renamed by its owner and by those who may edit the files of a project that lists it', function () {
    const res = whoMay((d) => { d.name = 'Renamed'; }, (doc) => doc.name === 'Renamed');
    expect(res).to.deep.equal({ applied: ['mriOwner', 'projectOwner', 'filesEditor'], told: ['annotationsEditor', 'viewer', 'anonymous'] });
  });

  it('the MRI\'s owner cannot be changed, by anyone', function () {
    const res = whoMay((d) => { d.owner = 'bar'; }, (doc) => doc.owner === 'bar');
    expect(res).to.deep.equal({ applied: nobody, told: allUsers });
    const res2 = whoMay((d) => { delete d.owner; }, (doc) => doc.owner !== 'mowner');
    expect(res2.applied).to.deep.equal(nobody);
  });

  it('the server\'s fields (source, url, file name, dimensions...) are kept, without telling', function () {
    const res = whoMay((d) => { d.dim = [9, 9, 9]; d.url = '/data/other/'; d.filename = 'other.nii.gz'; d.extra = 1; },
      (doc) => doc.url !== stored.url || doc.filename !== stored.filename || doc.dim[0] === 9 || 'extra' in doc);
    expect(res).to.deep.equal({ applied: nobody, told: nobody });
  });

  it('modified and modifiedBy are set by the server, with the verified user', function () {
    const { doc } = save(users.viewer, (d) => { d.modifiedBy = 'mowner'; });
    expect(doc.modifiedBy).to.equal('bar');
    expect(doc.modified).not.to.equal(stored.modified);
    expect(save(users.anonymous, () => null).doc.modifiedBy).to.equal('anonymous');
  });

  it('a project layer\'s name and labels: those who may edit the project\'s annotations', function () {
    const res = whoMay((d) => { layer(d, 'p.nii.gz').labels = 'cerebrum.json'; }, (doc) => layer(doc, 'p.nii.gz').labels === 'cerebrum.json');
    expect(res).to.deep.equal({ applied: ['projectOwner', 'annotationsEditor'], told: ['mriOwner', 'filesEditor', 'viewer', 'anonymous'] });
  });

  it('a field a page sends empty because it is not set is no change, and is not stored', function () {
    const res = whoMay((d) => { layer(d, 'Atlas.nii.gz').project = ''; layer(d, 'p.nii.gz').modified = ''; d.included = null; },
      (doc) => 'project' in layer(doc, 'Atlas.nii.gz') || 'modified' in layer(doc, 'p.nii.gz') || 'included' in doc);
    expect(res).to.deep.equal({ applied: nobody, told: nobody });
  });

  it('a layer\'s owner cannot be changed', function () {
    const res = whoMay((d) => { layer(d, 'p.nii.gz').owner = 'bar'; }, (doc) => layer(doc, 'p.nii.gz').owner === 'bar');
    expect(res).to.deep.equal({ applied: nobody, told: allUsers });
  });

  it('a layer without a project: as its stored access says (and its MRI\'s owner)', function () {
    const res = whoMay((d) => { layer(d, 'Atlas.nii.gz').name = 'Renamed'; }, (doc) => layer(doc, 'Atlas.nii.gz').name === 'Renamed');
    expect(res).to.deep.equal({ applied: allUsers, told: nobody });
    const res2 = whoMay((d) => { layer(d, 'viewonly.nii.gz').name = 'Renamed'; }, (doc) => layer(doc, 'viewonly.nii.gz').name === 'Renamed');
    expect(res2).to.deep.equal({ applied: ['mriOwner'], told: allUsers.filter((u) => u !== 'mriOwner') });
  });

  it('text annotations of a project: those who may edit the project\'s annotations', function () {
    const note = (doc) => doc.mri.annotations[projectP.shortname].Note.data;
    const res = whoMay((d) => { d.mri.annotations[projectP.shortname].Note.data = 'changed'; }, (doc) => note(doc) === 'changed');
    expect(res).to.deep.equal({ applied: ['projectOwner', 'annotationsEditor'], told: ['mriOwner', 'filesEditor', 'viewer', 'anonymous'] });
    const res2 = whoMay((d) => { d.mri.annotations[projectP.shortname].Other = { type: 'text', data: 'new' }; },
      (doc) => Boolean(doc.mri.annotations[projectP.shortname].Other));
    expect(res2.applied).to.deep.equal(['projectOwner', 'annotationsEditor']);
  });

  it('a page that only initialises a text annotation, or updates its date, is not told', function () {
    const res = whoMay((d) => {
      d.mri.annotations[projectP.shortname].Empty = { type: 'text', created: 'now', modified: 'now' };
      d.mri.annotations[projectP.shortname].Note.modified = 'now';
    }, (doc) => Boolean(doc.mri.annotations[projectP.shortname].Empty));
    expect(res).to.deep.equal({ applied: ['projectOwner', 'annotationsEditor'], told: nobody });
  });

  it('text annotations are never removed, and those of a hidden project are kept', function () {
    const res = whoMay((d) => { delete d.mri.annotations[projectQ.shortname]; delete d.mri.annotations[projectP.shortname].Note; },
      (doc) => doc.mri.annotations[projectQ.shortname].Secret.data === 'secret' && doc.mri.annotations[projectP.shortname].Note.data === 'stored note');
    expect(res).to.deep.equal({ applied: allUsers, told: nobody });
    const res2 = whoMay((d) => { d.mri.annotations[projectQ.shortname].Secret.data = 'leaked'; },
      (doc) => doc.mri.annotations[projectQ.shortname].Secret.data === 'leaked');
    expect(res2.applied).to.deep.equal(nobody);
  });

  it('text annotations of a project that does not exist: only the MRI\'s owner', function () {
    const res = whoMay((d) => { d.mri.annotations.nosuchproject = { Note: { data: 'x' } }; }, (doc) => Boolean(doc.mri.annotations.nosuchproject));
    expect(res).to.deep.equal({ applied: ['mriOwner'], told: allUsers.filter((u) => u !== 'mriOwner') });
  });

  it('a copy without layers or annotations changes neither', function () {
    const { doc, refused } = save(users.viewer, (d) => { delete d.mri; });
    expect(doc.mri).to.deep.equal(stored.mri);
    expect(refused).to.deep.equal([]);
  });

  it('what the user is told is about their own access, without usernames', function () {
    const { refused } = save(users.viewer, (d) => { d.name = 'x'; layer(d, 'p.nii.gz').labels = 'x'; layer(d, 'p.nii.gz').project = ''; });
    const told = refused.filter((r) => r.notify).map((r) => r.userReason);
    expect(told).to.deep.equal([
      'you may not rename this MRI',
      'the project of the layer \'Layer\' cannot be changed',
      'your access to the layer \'Layer\' is \'view\''
    ]);
    expect(told.join()).not.to.match(/bar|pown|mowner/);
  });

  describe('savedView: what the other users are sent', function () {
    it('the sender\'s copy, with what was stored', function () {
      const incoming = copy();
      incoming.mri.atlas = incoming.mri.atlas.filter((a) => a.filename !== 'q.nii.gz');
      delete incoming.mri.annotations[projectQ.shortname];
      incoming.mri.annotations[projectP.shortname].Empty = { type: 'text', data: 'refused' };
      incoming.name = 'Refused name';
      incoming.mri.atlas.push({ filename: 'refused.nii.gz', name: 'L', project: 'nosuchproject' });
      const { doc } = mergeMetadata({ stored: copy(), incoming, username: 'bar', projects });
      const view = savedView(doc, incoming);
      expect(view.name).to.equal('Brain');
      expect(view.modifiedBy).to.equal('bar');
      expect(view.mri.atlas.map((a) => a.filename)).to.deep.equal(['Atlas.nii.gz', 'viewonly.nii.gz', 'p.nii.gz']);
      expect(view.mri.annotations).to.deep.equal({ [projectP.shortname]: { Note: { type: 'text', data: 'stored note' }, Empty: { type: 'text' } } });
    });
  });
});
