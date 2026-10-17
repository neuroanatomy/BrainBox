'use strict';

// Who may see an MRI's files (controller/mri/mri-access.js): the owner of the
// MRI document always may; an anonymous visitor never by ownership

const { assert } = require('chai');
const { isMriOwner, mayViewMriFiles, mayEmbedMri } = require('../../controller/mri/mri-access.js');

const source = 'https://example.com/mri-access-spec.nii.gz';
const anyone = (files) => ({ userID: 'anyone', access: { collaborators: 'none', annotations: 'none', files } });
const member = (userID, files) => ({ userID, access: { collaborators: 'view', annotations: 'view', files } });
const project = (list, collaborators) => ({ shortname: 'p', files: { list }, collaborators: { list: collaborators } });
const privateListing = project([source], [anyone('none'), member('member', 'view')]);
const publicListing = project([source], [anyone('view')]);
const mri = (owner) => ({ source, owner });

describe('mri-access: who may see an MRI', function () {
  describe('isMriOwner', function () {
    it('is true for the user named in the document\'s owner field', function () {
      assert.isTrue(isMriOwner(mri('alice'), 'alice'));
      assert.isFalse(isMriOwner(mri('alice'), 'bob'));
    });

    it('is never true for an anonymous visitor, whatever the document says', function () {
      assert.isFalse(isMriOwner(mri('anonymous'), 'anonymous'));
      assert.isFalse(isMriOwner(mri(''), ''));
      assert.isFalse(isMriOwner(mri(), 'anonymous'));
      assert.isFalse(isMriOwner(mri(null), null));
      assert.isFalse(isMriOwner(null, 'alice'));
      assert.isFalse(isMriOwner({}, 'alice'));
    });
  });

  describe('mayViewMriFiles', function () {
    it('lets the owner see an MRI that only a private project lists', function () {
      assert.isTrue(mayViewMriFiles(source, [privateListing], 'alice', mri('alice')));
    });

    it('still refuses it to other users and to anonymous visitors', function () {
      assert.isFalse(mayViewMriFiles(source, [privateListing], 'bob', mri('alice')));
      assert.isFalse(mayViewMriFiles(source, [privateListing], 'anonymous', mri('anonymous')));
      assert.isFalse(mayViewMriFiles(source, [privateListing], 'anonymous', mri('::ffff:127.0.0.1')));
      assert.isFalse(mayViewMriFiles(source, [privateListing], 'anonymous', null));
    });

    it('is unchanged for members, public projects and MRIs no project lists', function () {
      assert.isTrue(mayViewMriFiles(source, [privateListing], 'member', mri('alice')));
      assert.isTrue(mayViewMriFiles(source, [privateListing, publicListing], 'anonymous', mri('alice')));
      assert.isTrue(mayViewMriFiles(source, [], 'anonymous', null));
    });
  });

  describe('mayEmbedMri', function () {
    it('lets the owner embed an MRI that only a private project lists', function () {
      assert.isTrue(mayEmbedMri(mri('alice'), [privateListing], 'alice'));
      assert.isFalse(mayEmbedMri(mri('alice'), [privateListing], 'bob'));
      assert.isFalse(mayEmbedMri(mri('anonymous'), [privateListing], 'anonymous'));
    });

    it('still refuses an MRI that no project lists, even to its owner', function () {
      assert.isFalse(mayEmbedMri(mri('alice'), [], 'alice'));
      assert.isFalse(mayEmbedMri(mri('alice'), [project([], [anyone('none')])], 'alice'));
    });

    it('is unchanged for members and public projects', function () {
      assert.isTrue(mayEmbedMri(mri('alice'), [privateListing], 'member'));
      assert.isTrue(mayEmbedMri(mri('alice'), [publicListing], 'anonymous'));
      // a project that only has a layer on it, but lets anyone see its files
      assert.isTrue(mayEmbedMri(mri('alice'), [project([], [anyone('view')])], 'anonymous'));
    });
  });
});
