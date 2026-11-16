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
  files list as having 0 files, and no longer throws. The save still throws,
  later: the per-list rights check reads `files.list` of the stored project
  (BrainBox's loop, until merge M12), so this case still tests the wrapper.
*/

const chai = require('chai');
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const { assert } = chai;
const sinon = require('sinon');
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

describe('Project handlers answer an error instead of crashing (catchErrors)', function () {
  const rejections = [];
  const onRejection = (reason) => rejections.push(reason);
  let consoleError;

  before(async function () {
    await U.getNativeDB().collection('project')
      .insertOne({ ...damagedProject });
    process.on('unhandledRejection', onRejection);
  });

  after(async function () {
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
    const calls = consoleError.getCalls().filter((c) => c.args[1] === 'unhandled error in route handler');
    assert.lengthOf(calls, 1);

    return calls[0].args[0].err;
  };

  it('GET /project/json/:p?var=a/b (apiProject) answers 500 JSON', async function () {
    const res = await chai.request(U.serverURL).get(`/project/json/${U.projectTest.shortname}`)
      .query({ var: 'a/b' });
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { error: 'Server error' });
    assert.instanceOf(loggedOnce(), TypeError);
    await checkServerAlive();
  });

  it('GET /project/:p of a damaged project (project page) answers 500 as text', async function () {
    const res = await chai.request(U.serverURL).get(`/project/${DAMAGED}`);
    assert.equal(res.status, 500);
    assert.match(res.headers['content-type'], /^text\/html/);
    assert.equal(res.text, 'Server error');
    assert.match(loggedOnce().message, /Access level not found for type "annotations"/);
    await checkServerAlive();
  });

  it('GET /project/:p/settings of a damaged project (settings page) answers 500 as text', async function () {
    const res = await chai.request(U.serverURL).get(`/project/${DAMAGED}/settings`);
    assert.equal(res.status, 500);
    assert.equal(res.text, 'Server error');
    assert.match(loggedOnce().message, /reading 'list'/);
    await checkServerAlive();
  });

  // past the files list guard (filesLoaded.count is the 0 files stored), it throws in the per-list check
  it('POST /project/json/:p of a damaged project (postProject) answers 500 JSON and saves nothing', async function () {
    const res = await chai.request(U.serverURL).post(`/project/json/${DAMAGED}?token=${U.testToken}foo`)
      .send(saveBody());
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { error: 'Server error' });
    assert.match(loggedOnce().message, /reading 'list'/);
    assert.equal(await U.getNativeDB().collection('project')
      .countDocuments({ shortname: DAMAGED }), 1);
    await checkServerAlive();
  });
});
