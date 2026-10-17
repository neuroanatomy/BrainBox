/* eslint-disable max-lines */
'use strict';

const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');
const admins = require('../../controller/admin/admins');
const notifier = require('../../notifier');
const WebSocket = require('ws');

const wshost = U.wsURL;

const goneProject = 'admintestgone';
const source1 = 'http://admin-test.localhost/brain1.nii.gz';
const source2 = 'http://admin-test.localhost/brain2.nii.gz';
const adminToken = U.testToken + 'foo';
const otherToken = U.testToken + 'bar';

const volume = (filename, project, extra = {}) => ({
  name: '',
  project,
  filename,
  owner: 'Anonymous',
  created: '2021-04-15T07:31:57.301Z',
  modified: '2021-04-15T07:31:57.301Z',
  labels: 'corpus_callosum.json',
  type: 'volume',
  access: 'remove',
  vectorial: [],
  ...extra
});

const mriDocs = () => [
  // an older version of the first MRI
  {
    source: source1,
    name: 'Admin test brain 1',
    backup: true,
    mri: { atlas: [volume('Atlas.nii.gz')] }
  },
  {
    source: source1,
    name: 'Admin test brain 1',
    mri: {
      atlas: [
        { name: 'Default', filename: 'Atlas.nii.gz', labels: 'foreground.json', type: 'volume', access: 'edit' },
        volume('gone1.nii.gz', goneProject),
        volume('gone2.nii.gz', goneProject),
        volume('gone3.nii.gz', goneProject),
        volume('live1.nii.gz', U.projectTest.shortname, { name: 'annotation' })
      ],
      annotations: {
        [goneProject]: { Comments: { value: 'a comment' } },
        [U.projectTest.shortname]: { Comments: { value: 'keep me' } }
      }
    }
  },
  {
    source: source2,
    name: 'Admin test brain 2',
    mri: {
      atlas: [volume('gone4.nii.gz', goneProject)],
      annotations: { [goneProject]: { Comments: { value: 'another comment' } } }
    }
  }
];

const liveMRI = (source) => U.getNativeDB().collection('mri')
  .findOne({ source, backup: { $exists: false } });

describe('TESTING THE /admin ROUTE', function () {
  let previousAdmins;

  before(async function () {
    previousAdmins = admins.getAdmins();
    admins.setAdmins(['foo']);
    await U.insertTestTokenForUser('bar');
  });

  after(async function () {
    admins.setAdmins(previousAdmins);
    await U.removeTestTokenForUser('bar');
  });

  beforeEach(async function () {
    await U.getNativeDB().collection('mri')
      .insertMany(mriDocs());
  });

  afterEach(async function () {
    await U.getNativeDB().collection('mri')
      .deleteMany({ source: { $in: [source1, source2] } });
    await U.getNativeDB().collection('log')
      .deleteMany({ key: 'adminRemoveAnnotations', 'value.source': { $in: [source1, source2] } });
  });

  describe('Access', function () {
    it('asks anonymous users to log in on the admin page', async function () {
      const res = await chai.request(U.serverURL).get('/admin');
      assert.equal(res.statusCode, 200);
      assert.include(res.text, 'use the admin tools');
      assert.notInclude(res.text, 'admin-page.js');
    });

    it('refuses the admin page to users who are not admins', async function () {
      const res = await chai.request(U.serverURL).get('/admin')
        .query({ token: otherToken });
      assert.equal(res.statusCode, 403);
      assert.notInclude(res.text, 'admin-page.js');
    });

    it('shows the admin page to admins', async function () {
      const res = await chai.request(U.serverURL).get('/admin')
        .query({ token: adminToken });
      assert.equal(res.statusCode, 200);
      assert.include(res.text, '/js/admin-page.js');
    });

    it('refuses the JSON endpoints to anonymous users (401) and to non-admins (403)', async function () {
      const requests = [
        (agent) => agent.get('/admin/json/orphans'),
        (agent) => agent.get('/admin/json/mri').query({ url: source1 }),
        (agent) => agent.post('/admin/json/mri/remove-annotations').send({ url: source1, volume: ['gone1.nii.gz'] }),
        (agent) => agent.post('/admin/json/orphans/remove').send({ project: goneProject })
      ];
      for (const request of requests) {
        // eslint-disable-next-line no-await-in-loop
        const anonymous = await request(chai.request(U.serverURL));
        assert.equal(anonymous.statusCode, 401);
        // eslint-disable-next-line no-await-in-loop
        const other = await request(chai.request(U.serverURL)).query({ token: otherToken });
        assert.equal(other.statusCode, 403);
      }
      const mri = await liveMRI(source1);
      assert.equal(mri.mri.atlas.length, 5, 'nothing was removed');
    });

    it('lets admins broadcast a message', async function () {
      const res = await chai.request(U.serverURL).post('/admin/broadcast-message')
        .query({ token: adminToken })
        .send({ msg: 'Testing' });
      assert.equal(res.statusCode, 200);
      assert.isTrue(res.body.success);
    });

    it('sends the broadcast message to the connected users', async function () {
      const socket = new WebSocket(wshost);
      try {
        await new Promise((resolve, reject) => {
          socket.once('open', resolve);
          socket.once('error', reject);
        });
        const received = new Promise((resolve) => {
          socket.on('message', (data) => {
            if (Buffer.isBuffer(data) && data[0] !== 0x7b) { return; } // binary data, not JSON
            const msg = JSON.parse(data);
            if (msg.type === 'serverMessage') { resolve(msg); }
          });
        });
        const res = await chai.request(U.serverURL).post('/admin/broadcast-message')
          .query({ token: adminToken })
          .send({ msg: 'Testing the broadcast' });
        assert.isAtLeast(res.body.users, 1, 'the answer says how many users got the message');
        const msg = await Promise.race([
          received,
          new Promise((resolve) => { setTimeout(resolve, U.shortTimeout / 2); })
        ]);
        assert.isDefined(msg, 'the connected user received no message');
        assert.equal(msg.msg, 'Testing the broadcast');
        assert.equal(msg.dialogType, 'modal');
      } finally {
        socket.close();
      }
    }).timeout(U.shortTimeout);

    it('counts the users connected to an MRI', async function () {
      const socket = new WebSocket(wshost);
      try {
        await new Promise((resolve, reject) => {
          socket.once('open', resolve);
          socket.once('error', reject);
        });
        socket.send(JSON.stringify({
          type: 'userData',
          description: 'allUserData',
          user: { username: 'anonymous', source: source1 }
        }));
        // let the server read the user data
        await new Promise((resolve) => { setTimeout(resolve, 500); });
        const res = await chai.request(U.serverURL).get('/admin/json/mri')
          .query({ token: adminToken, url: source1 });
        assert.equal(res.body.usersConnected, 1);
      } finally {
        socket.close();
      }
    }).timeout(U.shortTimeout);

    // Apache connects to the app over loopback (::1 in production) and adds X-Forwarded-For
    const proxyHeaders = { 'X-Forwarded-For': '203.0.113.7', 'X-Forwarded-Host': 'brainbox.example.org' };

    it('does not let other users broadcast a message', async function () {
      const res = await chai.request(U.serverURL).post('/admin/broadcast-message')
        .set(proxyHeaders)
        .query({ token: otherToken })
        .send({ msg: 'Testing' });
      assert.equal(res.statusCode, 403);
    });

    it('does not let anonymous visitors coming through the proxy save or broadcast', async function () {
      for (const url of [U.serverURL, U.testDataURL]) {
        // eslint-disable-next-line no-await-in-loop
        const broadcast = await chai.request(url).post('/admin/broadcast-message')
          .set(proxyHeaders)
          .send({ msg: 'Testing' });
        assert.equal(broadcast.statusCode, 403, url);
        assert.deepEqual(broadcast.body, { error: 'Unauthorized address' });
        // eslint-disable-next-line no-await-in-loop
        const save = await chai.request(url).post('/admin/save-all-atlases')
          .set(proxyHeaders);
        assert.equal(save.statusCode, 403, url);
      }
    });

    it('lets admins coming through the proxy broadcast a message', async function () {
      const res = await chai.request(U.serverURL).post('/admin/broadcast-message')
        .set(proxyHeaders)
        .query({ token: adminToken })
        .send({ msg: 'Testing' });
      assert.equal(res.statusCode, 200);
    });

    it('lets scripts on the server call the app directly, without a proxy', async function () {
      for (const url of [U.serverURL, U.testDataURL]) {
        // eslint-disable-next-line no-await-in-loop
        const broadcast = await chai.request(url).post('/admin/broadcast-message')
          .send({ msg: 'Testing' });
        assert.equal(broadcast.statusCode, 200, url);
        // eslint-disable-next-line no-await-in-loop
        const save = await chai.request(url).post('/admin/save-all-atlases');
        assert.equal(save.statusCode, 200, url);
        assert.isTrue(save.body.success);
      }
    });
  });

  describe('GET /admin/json/orphans', function () {
    it('lists the annotations of missing projects, by project and by MRI', async function () {
      const res = await chai.request(U.serverURL).get('/admin/json/orphans')
        .query({ token: adminToken });
      assert.equal(res.statusCode, 200);
      const entry = res.body.list.find((o) => o.project === goneProject);
      assert.exists(entry);
      assert.equal(entry.volume, 4);
      assert.equal(entry.text, 2);
      assert.deepEqual(entry.mris, [
        { source: source1, name: 'Admin test brain 1', volume: 3, text: 1 },
        { source: source2, name: 'Admin test brain 2', volume: 1, text: 1 }
      ]);
    });

    it('does not list annotations of existing projects, or without a project', async function () {
      const res = await chai.request(U.serverURL).get('/admin/json/orphans')
        .query({ token: adminToken });
      const projects = res.body.list.map((o) => o.project);
      assert.notInclude(projects, U.projectTest.shortname);
      assert.notInclude(projects, '');
      assert.notInclude(projects, null);
    });
  });

  describe('GET /admin/json/mri', function () {
    it('lists the annotations of the current version of an MRI', async function () {
      const res = await chai.request(U.serverURL).get('/admin/json/mri')
        .query({ token: adminToken, url: source1 });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.name, 'Admin test brain 1');
      assert.equal(res.body.usersConnected, 0);
      assert.deepEqual(res.body.volume.map((a) => [a.filename, a.projectExists]), [
        ['Atlas.nii.gz', null],
        ['gone1.nii.gz', false],
        ['gone2.nii.gz', false],
        ['gone3.nii.gz', false],
        ['live1.nii.gz', true]
      ]);
      assert.deepEqual(res.body.text, [
        { project: goneProject, projectExists: false, keys: ['Comments'] },
        { project: U.projectTest.shortname, projectExists: true, keys: ['Comments'] }
      ]);
    });

    it('answers 400 without url and 404 for an unknown MRI', async function () {
      const noURL = await chai.request(U.serverURL).get('/admin/json/mri')
        .query({ token: adminToken });
      assert.equal(noURL.statusCode, 400);
      const unknown = await chai.request(U.serverURL).get('/admin/json/mri')
        .query({ token: adminToken, url: 'http://admin-test.localhost/none.nii.gz' });
      assert.equal(unknown.statusCode, 404);
    });
  });

  describe('POST /admin/json/mri/remove-annotations', function () {
    // eslint-disable-next-line max-statements
    it('removes the selected annotations, keeping the previous version as a backup', async function () {
      const before = await liveMRI(source1);
      const res = await chai.request(U.serverURL).post('/admin/json/mri/remove-annotations')
        .query({ token: adminToken })
        .send({ url: source1, volume: ['gone1.nii.gz', 'gone3.nii.gz'], text: [goneProject] });
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body.removed.volume.map((a) => a.filename), ['gone1.nii.gz', 'gone3.nii.gz']);
      assert.deepEqual(res.body.removed.text, [goneProject]);

      const after = await liveMRI(source1);
      assert.deepEqual(after.mri.atlas.map((a) => a.filename), ['Atlas.nii.gz', 'gone2.nii.gz', 'live1.nii.gz']);
      assert.deepEqual(Object.keys(after.mri.annotations), [U.projectTest.shortname]);
      assert.equal(after.modifiedBy, 'foo');

      const previous = await U.getNativeDB().collection('mri')
        .findOne({ _id: before._id });
      assert.isTrue(previous.backup);
      assert.equal(previous.mri.atlas.length, 5);

      const versions = await U.getNativeDB().collection('mri')
        .countDocuments({ source: source1 });
      assert.equal(versions, 3);

      const log = await U.getNativeDB().collection('log')
        .findOne({ key: 'adminRemoveAnnotations', 'value.source': source1 });
      assert.equal(log.value.username, 'foo');
      assert.deepEqual(log.value.volume.map((a) => a.filename), ['gone1.nii.gz', 'gone3.nii.gz']);
    });

    it('does not create a new version when there is nothing to remove', async function () {
      const res = await chai.request(U.serverURL).post('/admin/json/mri/remove-annotations')
        .query({ token: adminToken })
        .send({ url: source1, volume: ['none.nii.gz'], text: ['none'] });
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body.removed, { volume: [], text: [] });
      const versions = await U.getNativeDB().collection('mri')
        .countDocuments({ source: source1 });
      assert.equal(versions, 2);
    });

    it('validates its input', async function () {
      const noURL = await chai.request(U.serverURL).post('/admin/json/mri/remove-annotations')
        .query({ token: adminToken })
        .send({ volume: ['gone1.nii.gz'] });
      assert.equal(noURL.statusCode, 400);
      const badList = await chai.request(U.serverURL).post('/admin/json/mri/remove-annotations')
        .query({ token: adminToken })
        .send({ url: source1, volume: 'gone1.nii.gz' });
      assert.equal(badList.statusCode, 400);
      const unknown = await chai.request(U.serverURL).post('/admin/json/mri/remove-annotations')
        .query({ token: adminToken })
        .send({ url: 'http://admin-test.localhost/none.nii.gz', volume: ['gone1.nii.gz'] });
      assert.equal(unknown.statusCode, 404);
    });

    describe('when someone has the MRI open', function () {
      const pretendOpen = (source, callback) => {
        if (source === source1) {
          // eslint-disable-next-line callback-return
          callback(1);
        }
      };

      before(function () {
        notifier.on('usersOnMRI', pretendOpen);
      });

      after(function () {
        notifier.off('usersOnMRI', pretendOpen);
      });

      it('refuses to remove annotations (409)', async function () {
        const res = await chai.request(U.serverURL).post('/admin/json/mri/remove-annotations')
          .query({ token: adminToken })
          .send({ url: source1, volume: ['gone1.nii.gz'] });
        assert.equal(res.statusCode, 409);
        const mri = await liveMRI(source1);
        assert.equal(mri.mri.atlas.length, 5);
      });

      it('reports the connected users', async function () {
        const res = await chai.request(U.serverURL).get('/admin/json/mri')
          .query({ token: adminToken, url: source1 });
        assert.equal(res.body.usersConnected, 1);
      });

      it('skips that MRI when removing the annotations of a missing project', async function () {
        const res = await chai.request(U.serverURL).post('/admin/json/orphans/remove')
          .query({ token: adminToken })
          .send({ project: goneProject });
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body.skipped, [source1]);
        assert.deepEqual(res.body.removed, [{ source: source2, volume: 1, text: 1 }]);
        assert.equal((await liveMRI(source1)).mri.atlas.length, 5);
      });
    });
  });

  describe('POST /admin/json/orphans/remove', function () {
    it('removes all the annotations of a missing project, and only those', async function () {
      const res = await chai.request(U.serverURL).post('/admin/json/orphans/remove')
        .query({ token: adminToken })
        .send({ project: goneProject });
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body.skipped, []);
      assert.sameDeepMembers(res.body.removed, [
        { source: source1, volume: 3, text: 1 },
        { source: source2, volume: 1, text: 1 }
      ]);

      const mri1 = await liveMRI(source1);
      assert.deepEqual(mri1.mri.atlas.map((a) => a.filename), ['Atlas.nii.gz', 'live1.nii.gz']);
      assert.deepEqual(Object.keys(mri1.mri.annotations), [U.projectTest.shortname]);
      const mri2 = await liveMRI(source2);
      assert.deepEqual(mri2.mri.atlas, []);
      assert.deepEqual(mri2.mri.annotations, {});

      const orphans = await chai.request(U.serverURL).get('/admin/json/orphans')
        .query({ token: adminToken });
      assert.notInclude(orphans.body.list.map((o) => o.project), goneProject);
    });

    it('refuses to remove the annotations of an existing project', async function () {
      const res = await chai.request(U.serverURL).post('/admin/json/orphans/remove')
        .query({ token: adminToken })
        .send({ project: U.projectTest.shortname });
      assert.equal(res.statusCode, 409);
      const mri = await liveMRI(source1);
      assert.include(mri.mri.atlas.map((a) => a.filename), 'live1.nii.gz');
    });

    it('answers 400 without a project', async function () {
      const res = await chai.request(U.serverURL).post('/admin/json/orphans/remove')
        .query({ token: adminToken })
        .send({});
      assert.equal(res.statusCode, 400);
    });
  });
});
