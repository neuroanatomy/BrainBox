// temporary: T005 5g /data check — remove after enforcing (the whole file)
'use strict';

// The refusals of the /data access check are recorded (collection
// dataAccessLog) and listed for the admins at GET /admin/json/data-access

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');
const admins = require('../../controller/admin/admins');
const { collectionName } = require('../../controller/mri/data-access-log');

const source = `${U.testDataURL}/test_data/data-access-log-private.nii.gz`;
const md5 = crypto.createHash('md5').update(source)
  .digest('hex');
const shortname = 'dataaccesslogprivate';
const dataDir = path.join(__dirname, '..', '..', 'public', 'data', md5);
const adminToken = U.testToken + 'foo';
const otherUser = 'dataaccesslogother';
const otherToken = U.testToken + otherUser;
const referer = `${U.serverURL}/mri?url=${encodeURIComponent(source)}&token=secret`;

describe('Record of the /data access check, for the admin page (temporary)', function () {
  // eslint-disable-next-line no-invalid-this
  this.timeout(U.longTimeout);
  let previousAdmins;
  let savedMode;

  before(async function () {
    previousAdmins = admins.getAdmins();
    admins.setAdmins(['foo']);
    savedMode = process.env.DATA_ACCESS_CHECK;
    process.env.DATA_ACCESS_CHECK = 'log';
    await U.insertTestTokenForUser(otherUser);
    const db = U.getNativeDB();
    await db.collection(collectionName).deleteMany({});
    await db.collection('mri').insertOne({ source, url: `/data/${md5}/`, filename: 'brain.nii.gz', name: 'Data access log brain', owner: 'foo', mri: { atlas: [] } });
    await db.collection('project').insertOne({
      name: shortname,
      shortname,
      owner: 'foo',
      collaborators: { list: [{ userID: 'anyone', nickname: 'anyone', username: 'anyone', name: 'Any User', access: { collaborators: 'none', annotations: 'none', files: 'none' } }] },
      files: { list: [source] },
      annotations: { list: [] }
    });
    await fs.promises.mkdir(dataDir, { recursive: true });
    await fs.promises.writeFile(path.join(dataDir, 'brain.nii.gz'), Buffer.alloc(100));
  });

  after(async function () {
    admins.setAdmins(previousAdmins);
    if (typeof savedMode === 'undefined') {
      delete process.env.DATA_ACCESS_CHECK;
    } else {
      process.env.DATA_ACCESS_CHECK = savedMode;
    }
    await U.removeTestTokenForUser(otherUser);
    const db = U.getNativeDB();
    await db.collection(collectionName).deleteMany({});
    await db.collection('mri').deleteMany({ source });
    await db.collection('project').deleteMany({ shortname });
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  });

  it('records a file it would refuse, once per hour with a count, and still serves it', async function () {
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await chai.request(U.serverURL).get(`/data/${md5}/brain.nii.gz`)
        .set('Referer', referer);
      assert.equal(res.statusCode, 200);
    }
    // the record is written without making the request wait for it
    const collection = U.getNativeDB().collection(collectionName);
    let doc = null;
    for (let i = 0; i < 50 && !(doc && doc.count === 3); i += 1) {
      // eslint-disable-next-line no-await-in-loop
      [doc] = await collection.find({ md5 }).toArray();
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => { setTimeout(resolve, 20); });
    }
    assert.equal(await collection.countDocuments({ md5 }), 1);
    assert.include(doc, { user: 'anonymous', file: 'brain.nii.gz', source, reason: 'private MRI', mode: 'log', count: 3 });
    assert.equal(doc.referer, `${U.serverURL}/mri?url=${encodeURIComponent(source)}`);
  });

  it('refuses the list to anonymous users (401) and to non-admins (403)', async function () {
    assert.equal((await chai.request(U.serverURL).get('/admin/json/data-access')).statusCode, 401);
    assert.equal((await chai.request(U.serverURL).get('/admin/json/data-access')
      .query({ token: otherToken })).statusCode, 403);
  });

  it('gives the admins the mode, the totals by reason, and the latest records, by page', async function () {
    await U.getNativeDB().collection(collectionName)
      .insertMany([1, 2, 3].map((i) => ({
        hour: new Date('2026-10-01T10:00:00Z'),
        user: `older${i}`,
        md5,
        file: `layer${i}.nii.gz`,
        reason: 'hidden layer of project x',
        mode: 'log',
        count: i,
        firstSeen: new Date(`2026-10-01T10:0${i}:00Z`),
        lastSeen: new Date(`2026-10-01T10:0${i}:00Z`)
      })));
    const res = await chai.request(U.serverURL).get('/admin/json/data-access')
      .query({ token: adminToken, limit: 2 });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.mode, 'log');
    assert.equal(res.body.total, 4);
    assert.deepEqual(res.body.totals, [
      { reason: 'hidden layer of project x', entries: 3, requests: 6 },
      { reason: 'private MRI', entries: 1, requests: 3 }
    ]);
    assert.deepEqual(res.body.list.map((e) => e.user), ['anonymous', 'older3']);
    const next = await chai.request(U.serverURL).get('/admin/json/data-access')
      .query({ token: adminToken, limit: 2, page: 1 });
    assert.deepEqual(next.body.list.map((e) => e.user), ['older2', 'older1']);
  });
});
