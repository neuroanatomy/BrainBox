'use strict';

// Who may download the files under /data (controller/mri/data-access.js): the
// MRI's rule for every file of its folder, and the layer's access for layer
// files and their earlier versions

const { assert } = require('chai');
const { dataAccessMode, publicPath, decideDataAccess, dataAccessMiddleware } = require('../../controller/mri/data-access.js');

const source = 'https://example.com/data-access-spec.nii.gz';
const md5 = '0123456789abcdef0123456789abcdef';
const anyone = (files, annotations) => ({ userID: 'anyone', access: { collaborators: 'none', annotations, files } });
const member = (userID, files, annotations) => ({ userID, access: { collaborators: 'view', annotations, files } });
const project = (shortname, list, collaborators) => ({ shortname, files: { list }, collaborators: { list: collaborators } });
// lists the MRI, lets only 'member' see its files and annotations
const privateListing = project('private', [source], [anyone('none', 'none'), member('member', 'view', 'view')]);
// does not list it; its annotations are hidden from all but 'member'
const privateLayers = project('layers', [], [anyone('none', 'none'), member('member', 'view', 'view')]);
// (a project that lets anyone see its files makes every MRI it relates to public, as /mri/json decides)
const publicLayers = project('public', [], [anyone('none', 'view')]);
const mri = (owner) => ({
  source,
  url: `/data/${md5}/`,
  filename: 'brain.nii.gz',
  owner,
  mri: {
    atlas: [
      { filename: 'Atlas.nii.gz', access: 'edit' },
      { filename: 'pub123.nii.gz', project: 'public' },
      { filename: 'priv456.nii.gz', project: 'layers' },
      { filename: 'gone789.nii.gz', project: 'no-such-project' }
    ]
  }
});
const decide = (projects, username, filename, owner = 'alice') => decideDataAccess({ mri: mri(owner), projects, username, filename });

describe('data-access: who may download the files under /data', function () {
  describe('dataAccessMode', function () {
    it('logs only, unless DATA_ACCESS_CHECK is "enforce"', function () {
      assert.equal(dataAccessMode(), 'log');
      assert.equal(dataAccessMode(''), 'log');
      assert.equal(dataAccessMode('log'), 'log');
      assert.equal(dataAccessMode('enforce'), 'enforce');
    });
  });

  describe('publicPath', function () {
    it('decodes and normalises the path as express.static does', function () {
      assert.equal(publicPath(`/data/${md5}/a.nii.gz`), `data/${md5}/a.nii.gz`);
      assert.equal(publicPath(`/x/../data/${md5}/a.nii.gz`), `data/${md5}/a.nii.gz`);
      assert.equal(publicPath(`//data/./${md5}//a.nii.gz`), `data/${md5}/a.nii.gz`);
      assert.equal(publicPath(`/%64ata/${md5}/a%2Enii.gz`), `data/${md5}/a.nii.gz`);
      assert.equal(publicPath('/lib/x.js'), 'lib/x.js');
      assert.isNull(publicPath('/data/%E0%A4%A'));
    });
  });

  describe('decideDataAccess', function () {
    it('serves the files of a folder that has no MRI document, as before', function () {
      assert.isTrue(decideDataAccess({ mri: null, projects: [], username: 'anonymous', filename: 'x.nii.gz' }).allow);
    });

    it('serves every file of an MRI that no project lists, except the layers its projects hide', function () {
      const projects = [publicLayers, privateLayers];
      for (const filename of ['brain.nii.gz', 'Atlas.nii.gz', 'pub123.nii.gz', 'gone789.nii.gz', 'unlisted.nii.gz']) {
        assert.isTrue(decide(projects, 'anonymous', filename).allow, filename);
      }
      assert.deepEqual(decide(projects, 'anonymous', 'priv456.nii.gz'), { allow: false, reason: 'hidden layer of project layers' });
      assert.isFalse(decide(projects, 'bob', 'priv456.nii.gz').allow);
      assert.isTrue(decide(projects, 'member', 'priv456.nii.gz').allow);
    });

    it('hides the earlier versions of a hidden layer as the layer, whatever the case of the name', function () {
      const projects = [privateLayers];
      assert.isFalse(decide(projects, 'anonymous', '1776065741470_priv456.nii.gz').allow);
      assert.isFalse(decide(projects, 'anonymous', 'PRIV456.nii.gz').allow);
      assert.isTrue(decide(projects, 'member', '1776065741470_priv456.nii.gz').allow);
      assert.isTrue(decide(projects, 'anonymous', '1776065741470_Atlas.nii.gz').allow);
    });

    it('refuses every file of an MRI whose files the user may not see', function () {
      const projects = [privateListing, publicLayers];
      assert.deepEqual(decide(projects, 'anonymous', 'brain.nii.gz'), { allow: false, reason: 'private MRI' });
      for (const filename of ['Atlas.nii.gz', 'pub123.nii.gz', 'unlisted.nii.gz', '1776065741470_Atlas.nii.gz']) {
        assert.deepEqual(decide(projects, 'bob', filename), { allow: false, reason: 'file of a private MRI' }, filename);
      }
      assert.isTrue(decide(projects, 'member', 'brain.nii.gz').allow);
      assert.isTrue(decide(projects, 'member', 'pub123.nii.gz').allow);
    });

    it('lets the owner see the MRI, and its layers as their projects decide', function () {
      const projects = [privateListing, privateLayers];
      assert.isTrue(decide(projects, 'alice', 'brain.nii.gz').allow);
      assert.isTrue(decide(projects, 'alice', 'Atlas.nii.gz').allow);
      assert.isFalse(decide(projects, 'alice', 'priv456.nii.gz').allow);
      // an MRI added by an anonymous visitor gives nothing to anyone
      assert.isFalse(decide(projects, 'anonymous', 'brain.nii.gz', 'anonymous').allow);
    });

    it('finds the image from the source when the document has no filename', function () {
      const doc = mri('alice');
      delete doc.filename;
      assert.deepEqual(decideDataAccess({ mri: doc, projects: [privateListing], username: 'anonymous', filename: 'data-access-spec.nii.gz' }),
        { allow: false, reason: 'private MRI' });
    });
  });

  describe('dataAccessMiddleware', function () {
    // a database with one MRI, listed by a private project
    const fakeDb = (counter) => ({
      collection: (name) => ({
        findOne: (query) => {
          if (name === 'mri') {
            counter.mri += 1;

            return Promise.resolve(query.url === `/data/${md5}/` ? mri('alice') : null);
          }

          return Promise.resolve(null);
        },
        find: () => ({ toArray: () => Promise.resolve(name === 'project' ? [privateListing] : []) })
      })
    });
    const request = (url, user) => ({
      method: 'GET',
      path: url,
      query: {},
      isAuthenticated: () => Boolean(user),
      user: user && { username: user }
    });
    const run = (mw, req) => new Promise((resolve) => { mw(req, {}, resolve); });

    it('refuses with Express\'s own 404 when enforcing, logs and serves otherwise', async function () {
      const logs = [];
      let mode = 'enforce';
      const mw = dataAccessMiddleware({ nativeDb: fakeDb({ mri: 0 }), mode: () => mode, log: (s) => logs.push(s) });
      assert.equal(await run(mw, request(`/data/${md5}/brain.nii.gz`)), 'router');
      assert.isUndefined(await run(mw, request(`/data/${md5}/brain.nii.gz`, 'member')));
      mode = 'log';
      assert.isUndefined(await run(mw, request(`/data/${md5}/brain.nii.gz`)));
      assert.deepEqual(logs, [
        `DATA_ACCESS REFUSED GET /data/${md5}/brain.nii.gz (user: anonymous, reason: private MRI)`,
        `DATA_ACCESS WOULD REFUSE GET /data/${md5}/brain.nii.gz (user: anonymous, reason: private MRI)`
      ]);
    });

    it('leaves other paths, and other methods, to the next middleware', async function () {
      const counter = { mri: 0 };
      const mw = dataAccessMiddleware({ nativeDb: fakeDb(counter), mode: () => 'enforce', log: () => null });
      assert.isUndefined(await run(mw, request('/lib/x.js')));
      assert.isUndefined(await run(mw, request(`/data/${md5}/`)));
      assert.isUndefined(await run(mw, { ...request(`/data/${md5}/brain.nii.gz`), method: 'POST' }));
      assert.equal(counter.mri, 0);
      // under /data but not a file of an MRI folder
      assert.equal(await run(mw, request(`/data/${md5}/sub/brain.nii.gz`)), 'router');
    });

    it('looks the folder up once per 10 s, for all users', async function () {
      const counter = { mri: 0 };
      const mw = dataAccessMiddleware({ nativeDb: fakeDb(counter), mode: () => 'enforce', log: () => null, ttl: 50 });
      await run(mw, request(`/data/${md5}/brain.nii.gz`));
      await run(mw, request(`/data/${md5}/Atlas.nii.gz`, 'member'));
      assert.equal(counter.mri, 1);
      await new Promise((resolve) => { setTimeout(resolve, 60); });
      await run(mw, request(`/data/${md5}/brain.nii.gz`));
      assert.equal(counter.mri, 2);
      mw.clearCache();
      await run(mw, request(`/data/${md5}/brain.nii.gz`));
      assert.equal(counter.mri, 3);
    });
  });
});
