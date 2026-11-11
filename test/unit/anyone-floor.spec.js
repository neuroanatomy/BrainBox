// 'anyone' is the minimum a named collaborator has: each of their levels is
// the higher of their own row and 'anyone' (shared suite 4.2, decided by the
// maintainer 2026-11-11). NWL's getUserOrPublicAccessLevel takes the own row
// first, so a member whose row was below 'anyone' had less than any user.

const { expect } = require('chai');
const { AccessType } = require('neuroweblab');
const BrainboxAccessControlService = require('../../services/BrainboxAccessControlService');

const row = (name, collaborators, annotations, files) => ({ userID: name, nickname: name, access: { collaborators, annotations, files } });
const project = (rows) => ({
  shortname: 'anyonefloorspec',
  owner: 'foo',
  collaborators: { list: rows },
  files: { list: [] },
  annotations: { list: [] }
});
const level = (p, user, type) => BrainboxAccessControlService.getUserOrPublicAccessLevel(p, user, type).toString();

describe('UNIT TESTING THAT ANYONE IS THE MINIMUM A NAMED COLLABORATOR HAS', function () {
  it('a member whose row is below anyone gets anyone\'s level, for every access type', function () {
    const p = project([row('anyone', 'view', 'edit', 'view'), row('low', 'none', 'none', 'none')]);
    expect(level(p, 'low', AccessType.ANNOTATIONS)).to.equal('edit');
    expect(level(p, 'low', AccessType.FILES)).to.equal('view');
    expect(level(p, 'low', AccessType.COLLABORATORS)).to.equal('view');
  });

  it('a member whose row is above anyone keeps their row; a member without anyone row keeps theirs', function () {
    const p = project([row('anyone', 'view', 'view', 'view'), row('high', 'edit', 'remove', 'add')]);
    expect(level(p, 'high', AccessType.ANNOTATIONS)).to.equal('remove');
    expect(level(p, 'high', AccessType.FILES)).to.equal('add');
    const noAnyone = project([row('member', 'view', 'edit', 'view')]);
    expect(level(noAnyone, 'member', AccessType.ANNOTATIONS)).to.equal('edit');
  });

  it('a logged-out visitor is still capped at view on annotations', function () {
    const p = project([row('anyone', 'view', 'edit', 'view'), row('low', 'none', 'none', 'none')]);
    expect(level(p, 'anonymous', AccessType.ANNOTATIONS)).to.equal('view');
  });
});
