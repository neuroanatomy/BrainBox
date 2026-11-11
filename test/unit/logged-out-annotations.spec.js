// A logged-out visitor never writes annotations, even where 'anyone' may edit
// them: 'anyone: edit' means any logged-in user (shared suite 4.4, decided
// 2026-11-11). Reads are unchanged: a logged-out visitor views what 'anyone'
// may view.

const { expect } = require('chai');
const { AccessType } = require('neuroweblab');
const BrainboxAccessControlService = require('../../services/BrainboxAccessControlService');

const anyone = (annotations) => ({ userID: 'anyone', nickname: 'anyone', access: { collaborators: 'view', annotations, files: 'view' } });
const project = (annotations, shortname = 'loggedoutspec') => ({
  shortname,
  owner: 'foo',
  collaborators: { list: [anyone(annotations), { userID: 'editor', nickname: 'editor', access: { collaborators: 'view', annotations: 'edit', files: 'view' } }] },
  files: { list: [] },
  annotations: { list: [] }
});
const level = (p, user, type = AccessType.ANNOTATIONS) => BrainboxAccessControlService.getUserOrPublicAccessLevel(p, user, type).toString();

describe('UNIT TESTING WHAT A LOGGED-OUT VISITOR MAY DO WITH ANNOTATIONS', function () {
  it('anyone: edit (or more) gives a logged-out visitor view, and a logged-in user edit', function () {
    for (const annotations of ['edit', 'add', 'remove']) {
      const p = project(annotations);
      expect([null, '', 'anonymous'].map((user) => level(p, user))).to.deep.equal(['view', 'view', 'view']);
      expect(level(p, 'bar')).to.equal(annotations);
    }
  });

  it('reads and the other access types are unchanged', function () {
    expect(level(project('view'), 'anonymous')).to.equal('view');
    expect(level(project('none'), 'anonymous')).to.equal('none');
    const p = project('edit');
    p.collaborators.list[0].access.files = 'edit';
    expect(level(p, 'anonymous', AccessType.FILES)).to.equal('edit');
  });

  it('the layers an MRI is sent with: view for a logged-out visitor, with a project or not', function () {
    const p = project('edit');
    const mri = () => ({
      mri: {
        atlas: [
          { filename: 'p.nii.gz', project: p.shortname, access: 'edit' },
          { filename: 'n.nii.gz', access: 'edit' },
          { filename: 'v.nii.gz', access: 'view' }
        ]
      }
    });
    const access = (user, projects) => {
      const m = mri();
      BrainboxAccessControlService.setVolumeAnnotationsAccessByProjects(m, projects, user);

      return m.mri.atlas.map((a) => a.access);
    };
    expect(access('anonymous', [p])).to.deep.equal(['view', 'view', 'view']);
    expect(access('anonymous', [])).to.deep.equal(['view', 'view', 'view']);
    expect(access('bar', [p])).to.deep.equal(['edit', 'edit', 'view']);
    expect(access('bar', [])).to.deep.equal(['edit', 'edit', 'view']);
  });
});
