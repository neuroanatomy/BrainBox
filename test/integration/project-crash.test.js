'use strict';

/*
  T002 M1 (2026-11-15): the four project handlers (project, apiProject, settings,
  postProject) are wrapped in NeuroWebLab's catchErrors. An error they threw was
  an unhandled rejection: no answer (the request hung) and, on Node >= 15, the
  end of the process. Now the server answers 500, the page routes as plain text
  (as their other errors), the JSON routes as JSON {error: 'Server error'}, the
  error is logged (console.error: BrainBox has no pino-http), and the next
  request is served.

  What throws: `?var=a/b` reads a field of an undefined value; a damaged stored
  project, without a files list and whose 'anyone' row has no annotations
  access: the project page asks the public annotations level (NeuroWebLab
  throws 'Access level not found'), the settings page and a save read
  `files.list` of the stored project.

  T002 M2 (NeuroWebLab 1.9.0, 2026-11-16): the save's incomplete files list
  guard is NWL's filesListIncomplete, which takes a stored project without a
  files list as having 0 files, and no longer throws. The save still threw,
  later: the per-list rights check read `files.list` of the stored project
  (BrainBox's loop, until merge M12).

  T002 M12c (NeuroWebLab 1.19.0, 2026-11-18): the per-list rights check is
  NWL's keepListsWithoutEditRights, which takes a stored list that is missing
  as []: the save of the damaged project now succeeds. The wrapper of
  postProject is tested with a save whose insert fails.

  T002 M14c (NeuroWebLab 1.21.0, 2026-11-18): the page, settings, JSON, save
  and delete routes are NWL's route factories, which pass an error to `next`:
  the app's errorHandler answers it (NWL routes/notFound.js) and logs it
  (console.error('ERROR:', method, url, err)). Outside development, a page
  answers the error page (`<h1>Server error</h1>`, was the text `Server
  error`), JSON `{error: 'Server error'}`; in development, the message (and the
  stack on a page). The tests run as production. A delete whose write fails
  answers 500 (it answered 200 {success: false}).
*/

const chai = require('chai');
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const { assert } = chai;
const sinon = require('sinon');
const { Collection } = require('mongodb');
const U = require('../utils.js');

const DAMAGED = 'crashtestdamaged';

const damagedProject = {
  name: 'Crash test: damaged project',
  shortname: DAMAGED,
  url: '',
  brainboxURL: `/project/${DAMAGED}`,
  created: (new Date()).toJSON(),
  owner: 'foo',
  collaborators: { list: [{ userID: 'anyone', access: { collaborators: 'view', files: 'view' } }] },
  annotations: { list: [{ type: 'volume', values: 'foreground.json', display: 'true', name: 'Vol A' }] },
  description: ''
};

// what the settings page sends: a whole project, as it was loaded
const saveBody = () => ({
  data: {
    ...damagedProject,
    files: { list: [] },
    collaborators: {
      list: [{ userID: 'anyone', access: { collaborators: 'view', annotations: 'edit', files: 'view' } }]
    },
    filesLoaded: { count: 0 }
  }
});

// eslint-disable-next-line max-statements
describe('Project handlers answer an error instead of crashing (the errorHandler)', function () {
  const rejections = [];
  const onRejection = (reason) => rejections.push(reason);
  let consoleError;
  let env;

  before(async function () {
    await U.getNativeDB().collection('project')
      .insertOne({ ...damagedProject });
    process.on('unhandledRejection', onRejection);
    // a server error's message stays on the server, as in production
    env = U.getApp().get('env');
    U.getApp().set('env', 'production');
  });

  after(async function () {
    U.getApp().set('env', env);
    process.removeListener('unhandledRejection', onRejection);
    await U.removeProject(DAMAGED);
  });

  beforeEach(function () {
    rejections.length = 0;
    consoleError = sinon.stub(console, 'error');
  });

  afterEach(function () {
    consoleError.restore();
  });

  // the server still answers, and logged the handler's error once
  const checkServerAlive = async () => {
    consoleError.restore();
    const res = await chai.request(U.serverURL).get(`/project/json/${U.projectTest.shortname}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.shortname, U.projectTest.shortname);
    assert.lengthOf(rejections, 0, 'no unhandled rejection');
  };

  const loggedOnce = () => {
    const calls = consoleError.getCalls().filter((c) => c.args[0] === 'ERROR:');
    assert.lengthOf(calls, 1);

    return calls[0].args[3];
  };

  it('GET /project/json/:p?var=a/b (apiProject) answers 500 JSON', async function () {
    const res = await chai.request(U.serverURL).get(`/project/json/${U.projectTest.shortname}`)
      .query({ var: 'a/b' });
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { error: 'Server error' });
    assert.instanceOf(loggedOnce(), TypeError);
    await checkServerAlive();
  });

  it('GET /project/:p of a damaged project (project page) answers 500, the error page', async function () {
    const res = await chai.request(U.serverURL).get(`/project/${DAMAGED}`);
    assert.equal(res.status, 500);
    assert.match(res.headers['content-type'], /^text\/html/);
    assert.include(res.text, '<h1>Server error</h1>');
    assert.notMatch(res.text, /Access level not found/);
    assert.match(loggedOnce().message, /Access level not found for type "annotations"/);
    await checkServerAlive();
  });

  it('GET /project/:p/settings of a damaged project (settings page) answers 500, the error page', async function () {
    const res = await chai.request(U.serverURL).get(`/project/${DAMAGED}/settings`);
    assert.equal(res.status, 500);
    assert.include(res.text, '<h1>Server error</h1>');
    assert.match(loggedOnce().message, /reading 'list'/);
    await checkServerAlive();
  });

  it('POST /project/json/:p (postProject) whose insert fails answers 500 JSON and saves nothing', async function () {
    const insertOne = sinon.stub(Collection.prototype, 'insertOne').rejects(new Error('insert failed'));
    let res;
    try {
      res = await chai.request(U.serverURL).post(`/project/json/${DAMAGED}?token=${U.testToken}foo`)
        .send(saveBody());
    } finally {
      insertOne.restore();
    }
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { error: 'Server error' });
    assert.match(loggedOnce().message, /insert failed/);
    assert.equal(await U.getNativeDB().collection('project')
      .countDocuments({ shortname: DAMAGED }), 1);
    await checkServerAlive();
  });

  // past the files list guard (filesLoaded.count is the 0 files stored), the stored files list
  // that is missing counts as [] in the per-list check (M12c; it threw, 500)
  it('POST /project/json/:p of a damaged project (postProject) saves it, with the files list sent', async function () {
    const res = await chai.request(U.serverURL).post(`/project/json/${DAMAGED}?token=${U.testToken}foo`)
      .send(saveBody());
    assert.equal(res.status, 200);
    assert.include(res.body, { success: true });
    assert.notInclude(res.body.message, 'ignored');
    const stored = await U.getNativeDB().collection('project')
      .findOne({ shortname: DAMAGED, backup: { $exists: false } });
    assert.deepEqual(stored.files, { list: [] });
    await checkServerAlive();
  });

  it('DELETE /project/json/:p whose write fails answers 500 JSON and keeps the project', async function () {
    const deleteOne = sinon.stub(Collection.prototype, 'deleteOne').rejects(new Error('delete failed'));
    let res;
    try {
      res = await chai.request(U.serverURL).delete(`/project/json/${DAMAGED}?token=${U.testToken}foo`);
    } finally {
      deleteOne.restore();
    }
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { error: 'Server error' });
    assert.match(loggedOnce().message, /delete failed/);
    assert.equal(await U.getNativeDB().collection('project')
      .countDocuments({ shortname: DAMAGED, backup: { $exists: false } }), 1);
    await checkServerAlive();
  });
});
