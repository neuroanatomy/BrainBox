// A page's first messages can reach the server before it has read the ticket of
// the connection: an embed that had just reconnected had its sendAtlas refused
// for that reason alone. The messages of an embed connection now wait for the
// answer, in order, and are decided then, as they were: fail closed.

const { expect } = require('chai');
const sinon = require('sinon');
const atlasmakerServer = require('../../controller/atlasmakerServer/atlasmakerServer.js');
const EmbedAccessService = require('../../services/EmbedAccessService.js');
const U = require('../utils.js');

const dirname = '/data/embedscope/';
const source = 'http://example.com/b.nii.gz';
const mockSocket = () => ({ send: sinon.spy(), close: sinon.spy(), readyState: 1, on: sinon.spy() });
const flush = () => new Promise((resolve) => { setTimeout(resolve, 20); });
const allUserData = (user) => JSON.stringify({ type: 'userData', description: 'allUserData', user });
const sendAtlas = JSON.stringify({ type: 'userData', description: 'sendAtlas' });
const paint = JSON.stringify({ type: 'paint', data: { c: 'me', x: 1, y: 1 } });
const sent = (ws) => ws.send.getCalls().map((call) => JSON.parse(call.args[0]));

// eslint-disable-next-line max-statements
describe('UNIT TESTING ATLASMAKER SERVER: messages wait for the embed ticket', function () {
  const user = { dirname, mri: 'm.nii.gz', atlasFilename: 'a.nii.gz', source };
  const unhandled = [];
  const onUnhandled = (reason) => { unhandled.push(reason); };
  const ticket = { dirname, mriSource: source };
  let AMS;
  let previousListeners;
  let lookup;
  let ws;

  const receive = (msg) => AMS._handleWebSocketMessage({ msg, ws });
  const connect = (ticketParameter = '?embedTicket=abc') => {
    AMS._connectNewUser({ ws, req: { url: `/${ticketParameter}` } });

    return AMS.getUserFromSocket(ws);
  };
  const answer = async (value) => {
    lookup.resolve(value);
    await flush();
  };

  before(function () {
    AMS = atlasmakerServer(U.getNativeDB());
  });

  beforeEach(function () {
    previousListeners = process.listeners('unhandledRejection');
    process.removeAllListeners('unhandledRejection');
    process.on('unhandledRejection', onUnhandled);
    unhandled.length = 0;

    lookup = {};
    lookup.promise = new Promise((resolve, reject) => {
      lookup.resolve = resolve;
      lookup.reject = reject;
    });
    sinon.stub(EmbedAccessService, 'findWsTicket').returns(lookup.promise);
    sinon.stub(AMS, 'addAtlas').callsFake((u) => Promise.resolve({ filename: u.atlasFilename }));
    sinon.stub(AMS, 'sendAtlasToUser');
    sinon.stub(AMS, 'refreshWriteAccess');
    sinon.stub(AMS, 'refreshReadAccess').resolves(true);
    sinon.stub(AMS, '_mayRead').returns(true);
    AMS.US = [];
    ws = mockSocket();
  });

  afterEach(function () {
    sinon.restore();
    AMS.US = [];
    process.removeListener('unhandledRejection', onUnhandled);
    previousListeners.forEach((listener) => process.on('unhandledRejection', listener));
  });

  it('serves a sendAtlas sent before the lookup answers, with a valid ticket', async function () {
    connect();
    receive(allUserData(user));
    receive(sendAtlas);
    await flush();
    expect(AMS.sendAtlasToUser.called, 'nothing before the answer').to.equal(false);

    await answer(ticket);

    expect(AMS.sendAtlasToUser.callCount).to.equal(1);
    expect(AMS.addAtlas.firstCall.args[0]).to.include({ dirname, atlasFilename: 'a.nii.gz' });
  });

  it('decides nothing before the lookup answers', async function () {
    const decide = sinon.spy(AMS, '_handleUserWebSocketMessage');
    const us = connect();
    receive(allUserData(user));
    receive(paint);
    await flush();

    expect(decide.called).to.equal(false);
    expect(us.User).to.equal(undefined); // eslint-disable-line no-undefined
    expect(ws.send.called).to.equal(false);
  });

  it('keeps the order of the messages held, and of those that follow', async function () {
    const decide = sinon.spy(AMS, '_handleUserWebSocketMessage');
    connect();
    receive(allUserData({ ...user, slice: 1 }));
    receive(sendAtlas);
    receive(JSON.stringify({ type: 'userData', description: JSON.stringify({ slice: 2 }) }));
    receive(JSON.stringify({ type: 'show', n: 1 }));

    await answer(ticket);
    receive(JSON.stringify({ type: 'show', n: 2 }));

    const handled = decide.getCalls().map(({ args: [{ data }] }) => data.n || data.description.slice(0, 11));
    expect(handled).to.deep.equal(['allUserData', 'sendAtlas', '{"slice":2}', 1, 2]);
    expect(AMS.getUserFromSocket(ws).User.slice).to.equal(2);
    expect(AMS.sendAtlasToUser.callCount, 'the atlas of the user data before it').to.equal(1);
  });

  it('refuses a sendAtlas for an unknown ticket, and sends no atlas', async function () {
    const us = connect();
    receive(allUserData(user));
    receive(sendAtlas);

    await answer(null);

    expect(us.isEmbed).to.equal(true);
    expect(us.embedScope).to.equal(null);
    expect(AMS.addAtlas.called).to.equal(false);
    expect(AMS.sendAtlasToUser.called).to.equal(false);
    expect(unhandled).to.deep.equal([]);
  });

  it('refuses a sendAtlas when the lookup fails, and sends no atlas', async function () {
    const us = connect();
    receive(allUserData(user));
    receive(sendAtlas);

    lookup.reject(new Error('the database is gone'));
    await flush();

    expect(us.isEmbed).to.equal(true);
    expect(us.embedScope).to.equal(null);
    expect(AMS.addAtlas.called).to.equal(false);
    expect(AMS.sendAtlasToUser.called).to.equal(false);
    expect(unhandled).to.deep.equal([]);
  });

  it('refuses a sendAtlas for another dirname, with a valid ticket', async function () {
    connect();
    receive(allUserData({ ...user, dirname: '/data/another/' }));
    receive(sendAtlas);

    await answer(ticket);

    expect(AMS.addAtlas.called).to.equal(false);
    expect(AMS.sendAtlasToUser.called).to.equal(false);
  });

  it('refuses and answers a write held with the others', async function () {
    const write = sinon.spy(AMS, 'receivePaintMessage');
    connect();
    receive(allUserData(user));
    receive(paint);
    expect(ws.send.called).to.equal(false);

    await answer(ticket);

    expect(write.called).to.equal(false);
    expect(sent(ws)).to.deep.equal([{ type: 'writeRefused', write: 'paint', atlas: null, reason: 'an embedded viewer cannot edit' }]);
  });

  it('handles at once the messages of a connection with no ticket', function () {
    const decide = sinon.spy(AMS, '_handleUserWebSocketMessage');
    const us = connect('');
    receive(allUserData(user));

    expect(EmbedAccessService.findWsTicket.called).to.equal(false);
    expect(decide.calledOnce, 'in the same tick').to.equal(true);
    expect(us.User.dirname).to.equal(dirname);
    expect(us.messageQueue).to.equal(undefined); // eslint-disable-line no-undefined
  });

  it('does not make a connection with no ticket wait for another\'s lookup', function () {
    connect();
    ws = mockSocket();
    const us = connect('');
    receive(allUserData(user));

    expect(us.User.dirname).to.equal(dirname);
  });

  it('drops the messages held when the socket closed meanwhile', async function () {
    const decide = sinon.spy(AMS, '_handleUserWebSocketMessage');
    connect();
    receive(allUserData(user));
    receive(sendAtlas);
    await AMS._disconnectUser({ ws });
    expect(AMS.getUserFromSocket(ws)).to.equal(-1);

    await answer(ticket);

    expect(decide.called).to.equal(false);
    expect(unhandled).to.deep.equal([]);
  });

  it('survives the socket closing before a failed lookup', async function () {
    connect();
    receive(sendAtlas);
    await AMS._disconnectUser({ ws });

    lookup.reject(new Error('the database is gone'));
    await flush();

    expect(unhandled).to.deep.equal([]);
  });

  it('still handles the other messages held when one of them throws', async function () {
    const decide = sinon.stub(AMS, '_handleUserWebSocketMessage');
    decide.onFirstCall().throws(new Error('a bad message'));
    decide.returns(false);
    connect();
    receive(JSON.stringify({ type: 'show', n: 1 }));
    receive(JSON.stringify({ type: 'show', n: 2 }));

    await answer(ticket);

    expect(decide.callCount).to.equal(2);
    expect(unhandled).to.deep.equal([]);
  });
});
