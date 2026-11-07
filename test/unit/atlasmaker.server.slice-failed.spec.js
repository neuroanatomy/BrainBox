/* eslint-disable mocha/no-setup-in-describe */
// A slice request that cannot give a slice used to get no answer at all, and
// the viewer stayed on "Loading brain…", waiting for it. Whatever goes wrong,
// the user who asked now gets a 'sliceFailed' message, and only them.

const { expect } = require('chai');
const sinon = require('sinon');
const WebSocket = require('ws');
const atlasmakerServer = require('../../controller/atlasmakerServer/atlasmakerServer.js');
const U = require('../utils.js');

const mockSocket = () => ({ send: sinon.spy(), close: sinon.spy(), readyState: 1, on: sinon.spy() });

const flush = () => new Promise((resolve) => { setTimeout(resolve, 20); });

const asMessage = (args) => {
  try {
    return JSON.parse(args[0]);
  } catch (err) {
    return null;
  }
};

// eslint-disable-next-line max-statements
describe('UNIT TESTING ATLASMAKER SERVER: a slice request that fails gets an answer', function () {
  let AMS;
  let user;
  let other;
  const unhandled = [];
  const onUnhandled = (reason) => { unhandled.push(reason); };
  const previousListeners = [];

  const expectFailureOnly = () => {
    expect(user.socket.send.callCount).to.equal(1);
    const message = asMessage(user.socket.send.firstCall.args);
    expect(message).to.include({ type: 'sliceFailed' });
    expect(message.reason).to.be.a('string');
    expect(user.socket.send.firstCall.args[1], 'not binary').to.equal(undefined); // eslint-disable-line no-undefined
    expect(other.socket.send.called, 'only that user').to.equal(false);
    expect(unhandled).to.deep.equal([]);
  };

  before(function () {
    AMS = atlasmakerServer(U.getNativeDB());
  });

  beforeEach(function () {
    user = { uid: 'u1', socket: mockSocket(), User: { dirname: '/d/', mri: 'm.nii.gz', view: 'sag', slice: 3 } };
    other = { uid: 'u2', socket: mockSocket(), User: { dirname: '/d/', mri: 'm.nii.gz' } };
    AMS.US = [user, other];
    AMS.Atlases = [];
    AMS.Brains = [];
    unhandled.length = 0;
    previousListeners.push(...process.listeners('unhandledRejection'));
    process.removeAllListeners('unhandledRejection');
    process.on('unhandledRejection', onUnhandled);
  });

  afterEach(function () {
    sinon.restore();
    process.removeListener('unhandledRejection', onUnhandled);
    for (const listener of previousListeners.splice(0)) {
      process.on('unhandledRejection', listener);
    }
  });

  const handlers = [
    { type: 'requestSlice', receive: 'receiveRequestSliceMessage', draw: 'drawSlice' },
    { type: 'requestSlice2', receive: 'receiveRequestSlice2Message', draw: 'drawSlice2' }
  ];
  const badRequests = [
    { name: 'no view and no slice', view: null, slice: null },
    { name: 'an unknown view', view: 'top', slice: 10 },
    { name: 'a view that is not a string', view: ['sag'], slice: 10 },
    { name: 'no slice', view: 'sag', slice: null },
    { name: 'a slice that is not a number', view: 'sag', slice: 'ten' },
    { name: 'a missing slice', view: 'sag' }
  ];

  handlers.forEach(({ type, receive, draw }) => {
    describe(type, function () {
      badRequests.forEach(({ name, view, slice }) => {
        it(`refuses ${name} without drawing or changing the user`, async function () {
          const getBrain = sinon.stub(AMS, 'getBrainAtPath').resolves({});
          const drawSlice = sinon.stub(AMS, draw);
          AMS[receive]({ type, uid: user.uid, view, slice }, user.socket);
          await flush();
          expect(drawSlice.called).to.equal(false);
          expect(getBrain.called).to.equal(false);
          expect(user.User).to.include({ view: 'sag', slice: 3 });
          expectFailureOnly();
        });
      });

      [
        { sent: 50, drawn: 50 },
        { sent: '50', drawn: 50 },
        { sent: 10.5, drawn: 10 }
      ].forEach(({ sent, drawn }) => {
        it(`draws slice ${drawn} for ${JSON.stringify(sent)}, as a number`, async function () {
          sinon.stub(AMS, 'getBrainAtPath').resolves({});
          const drawSlice = sinon.stub(AMS, draw).returns({ data: Buffer.alloc(4) });
          AMS[receive]({ type, uid: user.uid, view: 'cor', slice: sent }, user.socket);
          await flush();
          expect(drawSlice.calledOnce).to.equal(true);
          expect(drawSlice.firstCall.args).to.include(drawn);
          expect(user.User.slice).to.equal(drawn);
          expect(Buffer.isBuffer(user.socket.send.firstCall.args[0])).to.equal(true);
        });
      });

      it('still accepts slice 0 of each view', async function () {
        const stub = sinon.stub(AMS, 'getBrainAtPath').resolves({});
        const drawSlice = sinon.stub(AMS, draw).returns({ data: Buffer.alloc(4) });
        for (const view of ['sag', 'cor', 'axi']) {
          AMS[receive]({ type, uid: user.uid, view, slice: 0 }, user.socket);
        }
        await flush();
        expect(stub.callCount).to.equal(3);
        expect(drawSlice.callCount).to.equal(3);
        expect(user.socket.send.getCalls().map((c) => Buffer.isBuffer(c.args[0]))).to.deep.equal([true, true, true]);
      });

      it('answers when drawing the slice throws', async function () {
        sinon.stub(AMS, 'getBrainAtPath').resolves({});
        sinon.stub(AMS, draw).throws(new Error('boom'));
        AMS[receive]({ type, uid: user.uid, view: 'sag', slice: 10 }, user.socket);
        await flush();
        expectFailureOnly();
      });

      it('answers when the brain cannot be loaded', async function () {
        const drawSlice = sinon.stub(AMS, draw);
        sinon.stub(AMS, 'getBrainAtPath').rejects(new Error('corrupted'));
        AMS[receive]({ type, uid: user.uid, view: 'sag', slice: 10 }, user.socket);
        await flush();
        expect(drawSlice.called).to.equal(false);
        expectFailureOnly();
      });

      it('answers a connection without a User structure', async function () {
        const getBrain = sinon.stub(AMS, 'getBrainAtPath').resolves({});
        delete user.User;
        AMS[receive]({ type, uid: user.uid, view: 'sag', slice: 10 }, user.socket);
        await flush();
        expect(getBrain.called).to.equal(false);
        expectFailureOnly();
      });
    });
  });

  it('a socket that cannot be written to does not throw', async function () {
    user.socket.send = sinon.stub().throws(new Error('closed'));
    expect(() => AMS.receiveRequestSliceMessage({ type: 'requestSlice', uid: user.uid, view: null, slice: null }, user.socket)).to.not.throw();
    await flush();
    expect(unhandled).to.deep.equal([]);
  });

  it('logs the exception when a slice cannot be drawn', function () {
    const error = new Error('boom');
    const log = sinon.spy(console, 'log');
    sinon.stub(AMS, 'drawSlice').throws(error);
    AMS.sendSliceToUser({}, 'sag', 10, user.socket);
    const line = log.getCalls().map((c) => c.args.join(' '))
      .find((l) => l.includes('Cannot send slice to user'));
    expect(line).to.include('boom');
  });

  describe('a sliceFailed sent by a client', function () {
    let client;

    before(function (done) {
      // a connected client, so that the broadcast has someone to look at
      client = new WebSocket(U.wsURL, { origin: U.serverURL });
      client.on('open', () => done());
      client.on('error', done);
    });

    after(function () {
      client.terminate();
    });

    it('is not relayed to the other users', function () {
      const look = sinon.spy(AMS, 'getUserFromSocket');
      AMS._handleBroadcastWebSocketMessage({ data: { type: 'sliceFailed' }, sourceUS: user });
      expect(look.called).to.equal(false);
      // and this test can see a relay
      AMS._handleBroadcastWebSocketMessage({ data: { type: 'chat' }, sourceUS: user });
      expect(look.called).to.equal(true);
    });
  });
});
