'use strict';

/*
  A user's projects (/user/json/:u/projects) are filtered by the visitor's access first, then
  sliced (shared suite 3.4). The user page asks for 100 at a time and stops at the first empty
  answer: a first batch of 100 projects the visitor may not view must not hide the ones after
  it. The projects are inserted directly in the database.
*/

const chai = require('chai');
const { assert } = chai;
const sinon = require('sinon');
const { Collection } = require('mongodb');
const U = require('../utils.js');

const owner = 'listing-owner';
const [anyone] = U.projectTest.collaborators.list;
const PRIVATE = { ...anyone, access: { collaborators: 'none', annotations: 'none', files: 'none' } };

const project = (shortname, row) => ({
  shortname,
  name: shortname,
  brainboxURL: `/project/${shortname}`,
  owner,
  created: new Date('2025-01-01T00:00:00Z'),
  modified: new Date('2026-01-01T00:00:00Z'),
  collaborators: { list: [row] },
  files: { list: [] },
  annotations: { list: [] }
});

const removeAll = () => U.getNativeDB().collection('project')
  .deleteMany({ shortname: { $regex: '^listingproj' } });

describe('User projects: filtered, then sliced', function () {
  before(async function () {
    await removeAll();
    const hidden = Array.from({ length: 100 }, (_x, i) => project(`listingproj${String(i).padStart(3, '0')}`, PRIVATE));
    await U.getNativeDB().collection('project')
      .insertMany([...hidden, project('listingprojvisible', anyone)]);
  });

  after(async function () {
    await removeAll();
  });

  it('anonymous, as the user page asks (start=0, length=100): the project after 100 hidden ones is listed', async function () {
    const res = await fetch(`${U.serverURL}/user/json/${owner}/projects?start=0&length=100`);
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.isTrue(body.success);
    assert.deepEqual(body.list.map((p) => p.project), ['listingprojvisible']);
  });

  it('anonymous, the next batch (start=100, length=100): empty, so the page stops', async function () {
    const res = await fetch(`${U.serverURL}/user/json/${owner}/projects?start=100&length=100`);
    assert.deepEqual(await res.json(), { success: false, list: [] });
  });

  describe('User projects: a project without a files list, and a failed read', function () {
    const nofilesOwner = 'listing-nofiles-owner';

    before(async function () {
      const noFiles = { ...project('listingprojnofiles', anyone), owner: nofilesOwner };
      delete noFiles.files;
      await U.getNativeDB().collection('project')
        .insertOne(noFiles);
    });

    it('a project without a files list is listed, with numFiles 0', async function () {
      const res = await fetch(`${U.serverURL}/user/json/${nofilesOwner}/projects`);
      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.isTrue(body.success);
      assert.deepEqual(body.list.map((p) => [p.project, p.numFiles]), [['listingprojnofiles', 0]]);
    });

    it('a failed read answers the errorHandler\'s 500 {error} (it answered 200 {success: false, list: []})', async function () {
      const env = U.getApp().get('env');
      // a server error's message stays on the server, as in production
      U.getApp().set('env', 'production');
      const { find } = Collection.prototype;
      /* eslint-disable no-invalid-this -- the stubbed method's collection */
      const findStub = sinon.stub(Collection.prototype, 'find').callsFake(function (...args) {
        return this.collectionName === 'project' && args[0] && args[0].$or
          ? { toArray: () => Promise.reject(new Error('simulated read failure')) }
          : find.apply(this, args);
      });
      /* eslint-enable no-invalid-this */
      const consoleError = sinon.stub(console, 'error');
      try {
        const res = await fetch(`${U.serverURL}/user/json/${nofilesOwner}/projects`);
        assert.strictEqual(res.status, 500);
        assert.deepEqual(await res.json(), { error: 'Server error' });
      } finally {
        consoleError.restore();
        findStub.restore();
        U.getApp().set('env', env);
      }
    });
  });
});
