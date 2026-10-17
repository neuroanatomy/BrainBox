// temporary: T005 5g /data check — remove after enforcing (the whole file)
'use strict';

// The record of the /data refusals for the admin page (controller/mri/data-access-log.js)

const { assert } = require('chai');
const U = require('../utils.js');
const { dataAccessMiddleware } = require('../../controller/mri/data-access.js');
const { collectionName, cleanReferer, dataAccessRecorder } = require('../../controller/mri/data-access-log.js');

const md5 = '00112233445566778899aabbccddeeff';
const source = 'https://example.com/data-access-log-spec.nii.gz';
const user = 'dataaccesslogspec';
// an MRI listed by a project that hides its files from all but 'member'
const fakeDb = {
  collection: (name) => ({
    findOne: (query) => Promise.resolve(name === 'mri' && query.url === `/data/${md5}/`
      ? { source, url: query.url, filename: 'brain.nii.gz', owner: 'alice', mri: { atlas: [] } }
      : null),
    find: () => ({
      toArray: () => Promise.resolve(name === 'project'
        ? [
          { shortname: 'p',
            files: { list: [source] },
            collaborators: { list: [
              { userID: 'anyone', access: { collaborators: 'none', annotations: 'none', files: 'none' } },
              { userID: 'member', access: { collaborators: 'view', annotations: 'view', files: 'view' } }
            ] } }
        ]
        : [])
    })
  })
};
const request = (url, username, headers = {}) => ({
  method: 'GET',
  path: url,
  query: {},
  headers,
  isAuthenticated: () => Boolean(username),
  user: username && { username }
});
const run = (mw, req) => new Promise((resolve) => { mw(req, {}, resolve); });

describe('data-access-log: the record of the /data refusals (temporary)', function () {
  describe('the middleware', function () {
    it('records what it would refuse, with the MRI and the page that asked, and nothing it serves', async function () {
      const records = [];
      const mw = dataAccessMiddleware({ nativeDb: fakeDb, mode: () => 'log', log: () => null, record: (e) => records.push(e) });
      assert.isUndefined(await run(mw, request(`/data/${md5}/brain.nii.gz`, null, { referer: 'https://brainbox.example/mri?url=x' })));
      assert.isUndefined(await run(mw, request(`/data/${md5}/brain.nii.gz`, 'member')));
      assert.deepEqual(records, [
        {
          user: 'anonymous',
          md5,
          file: 'brain.nii.gz',
          source,
          reason: 'private MRI',
          mode: 'log',
          referer: 'https://brainbox.example/mri?url=x'
        }
      ]);
    });

    it('serves the file even if recording throws', async function () {
      const mw = dataAccessMiddleware({ nativeDb: fakeDb, mode: () => 'log', log: () => null, record: () => { throw new Error('boom'); } });
      const originalError = console.error;
      console.error = () => null;
      try {
        assert.isUndefined(await run(mw, request(`/data/${md5}/brain.nii.gz`)));
      } finally {
        console.error = originalError;
      }
    });
  });

  describe('cleanReferer', function () {
    it('keeps the page, without a token', function () {
      assert.equal(cleanReferer('https://b.example/mri?url=a&token=secret'), 'https://b.example/mri?url=a');
      assert.equal(cleanReferer('not a url?token=secret&x=1'), 'not a url?&x=1');
      assert.isNull(cleanReferer());
      assert.isNull(cleanReferer(''));
      assert.lengthOf(cleanReferer('https://b.example/' + 'a'.repeat(1000)), 500);
    });
  });

  describe('dataAccessRecorder', function () {
    const collection = () => U.getNativeDB().collection(collectionName);
    const entry = { user, md5, file: 'brain.nii.gz', source, reason: 'private MRI', mode: 'log', referer: 'https://b.example/p?token=t' };

    afterEach(async function () {
      await collection().deleteMany({ user });
    });

    it('keeps one record per user, file, reason and hour, counting the requests', async function () {
      let time = new Date('2026-10-17T10:05:00Z');
      const record = dataAccessRecorder(U.getNativeDB(), { now: () => time });
      await record(entry);
      time = new Date('2026-10-17T10:40:00Z');
      await record({ ...entry, referer: null });
      await record({ ...entry, file: 'other.nii.gz' });
      time = new Date('2026-10-17T11:01:00Z');
      await record(entry);
      const docs = await collection().find({ user }, { projection: { _id: 0 } })
        .sort({ firstSeen: 1 })
        .toArray();
      assert.deepEqual(docs.map((d) => [d.file, d.hour.toISOString(), d.count]), [
        ['brain.nii.gz', '2026-10-17T10:00:00.000Z', 2],
        ['other.nii.gz', '2026-10-17T10:00:00.000Z', 1],
        ['brain.nii.gz', '2026-10-17T11:00:00.000Z', 1]
      ]);
      assert.deepEqual(docs[0], {
        hour: new Date('2026-10-17T10:00:00Z'),
        user,
        md5,
        file: 'brain.nii.gz',
        reason: 'private MRI',
        mode: 'log',
        firstSeen: new Date('2026-10-17T10:05:00Z'),
        source,
        lastSeen: new Date('2026-10-17T10:40:00Z'),
        referer: 'https://b.example/p',
        count: 2
      });
    });

    it('never rejects: a failed write is only logged', async function () {
      const errors = [];
      const originalError = console.error;
      console.error = (...args) => errors.push(args.join(' '));
      try {
        const failing = { collection: () => ({ updateOne: () => Promise.reject(new Error('down')) }) };
        await dataAccessRecorder(failing)(entry);
        await dataAccessRecorder({ collection: () => { throw new Error('no db'); } })(entry);
      } finally {
        console.error = originalError;
      }
      assert.deepEqual(errors, [
        'ERROR: could not record a DATA_ACCESS refusal down',
        'ERROR: could not record a DATA_ACCESS refusal no db'
      ]);
    });
  });
});
