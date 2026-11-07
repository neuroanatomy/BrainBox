// The viewer could stay on "Loading brain…" until a reload. A redraw made
// before configureBrainImage (a window resize while the atlas is on its way)
// asked for slice null of view null: the server sent nothing back, and the
// viewer, marked as loading, dropped the real request that came later. The
// viewer now waits until it knows what to ask for, and hears about a request
// that failed (the 'sliceFailed' message).

const { assert } = require('chai');
const { JSDOM } = require('jsdom');

const { AtlasMakerDraw } = require('../../view/atlasmaker/src/atlasmaker-draw.js');
const { AtlasMakerWS } = require('../../view/atlasmaker/src/atlasmaker-ws.js');

const savedGlobals = {};
const globalNames = ['window', 'document', 'CustomEvent', 'AtlasMakerWidget'];
const nothing = () => null;

// eslint-disable-next-line max-statements
describe('Atlasmaker slice requests', function () {
  let me;
  let sent;
  let states;
  // what the server does with a requestSlice: nothing, unless a test says so
  let onRequest;

  const requests = () => sent.filter((m) => m.type === 'requestSlice').map((m) => `${m.view} ${m.slice}`);
  const serverSays = (message) => me.socket.onmessage({ data: JSON.stringify(message) });
  const failed = () => serverSays({ type: 'sliceFailed', reason: 'cannot draw' });

  /**
   * A widget with the real drawing and WebSocket code, connected, before
   * configureBrainImage has run
   * @returns {Promise<void>} Resolves when the socket is open
   */
  const openWidget = async () => {
    me = {
      ...AtlasMakerDraw,
      ...AtlasMakerWS,
      debug: 0,
      wshostname: 'localhost:8080',
      flagConnected: 0,
      socket: null,
      receiveFunctions: {},
      _pendingMetadataSaves: [],
      User: { view: null, slice: null },
      brainImg: { img: null, view: null, slice: null },
      flagLoadingImg: { loading: false },
      canvas: {},
      brainOffcn: {},
      drawImagesNow: nothing,
      initCursor: nothing,
      setViewerState: ({ state }) => states.push(state),
      createSocket: () => ({
        send: (text) => {
          sent.push(JSON.parse(text));
          onRequest(JSON.parse(text));
        },
        close: nothing
      })
    };
    global.AtlasMakerWidget = me;
    const opened = me.initSocketConnection();
    me.socket.onopen();
    await opened;
  };

  // showing sagittal slice 10, nothing on its way
  const showSlice = () => {
    Object.assign(me.User, { view: 'sag', slice: 10 });
    Object.assign(me.brainImg, { img: {}, view: 'sag', slice: 10 });
    Object.assign(me.flagLoadingImg, { loading: false, view: 'sag', slice: 10 });
  };

  // the first request of a viewer, on its way
  const askFirstSlice = () => {
    Object.assign(me.User, { view: 'sag', slice: 10 });
    me.drawImages();
    assert.deepEqual(requests(), ['sag 10']);
    sent.length = 0;
  };

  beforeEach(async function () {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="notifications"></div><div id="slice"></div></body></html>');
    for (const name of globalNames) {
      savedGlobals[name] = global[name];
    }
    global.window = dom.window;
    global.window.requestAnimationFrame = () => 0;
    global.document = dom.window.document;
    global.CustomEvent = dom.window.CustomEvent;
    sent = [];
    states = [];
    onRequest = nothing;
    await openWidget();
  });

  afterEach(function () {
    for (const [name, value] of Object.entries(savedGlobals)) {
      if (typeof value === 'undefined') {
        delete global[name];
      } else {
        global[name] = value;
      }
    }
  });

  describe('before the view and the slice are known', function () {
    it('a redraw (the resize listener\'s) sends nothing and does not mark a slice as loading', function () {
      me.drawImages();
      assert.deepEqual(requests(), []);
      assert.isNotOk(me.flagLoadingImg.loading);
    });

    it('a view without a slice (?view=cor) sends nothing either', function () {
      me.User.view = 'cor';
      me.drawImages();
      assert.deepEqual(requests(), []);
      assert.isNotOk(me.flagLoadingImg.loading);
    });

    it('the redraw once they are known sends one request', function () {
      me.drawImages();
      Object.assign(me.User, { view: 'sag', slice: 10 });
      me.drawImages();
      me.drawImages();
      assert.deepEqual(requests(), ['sag 10']);
      assert.isTrue(me.flagLoadingImg.loading);
    });

    it('configureBrainImage after a resize asks for the slice', function () {
      me.drawImages();
      me.User.s2v = { sdim: [40, 50, 60], wpixdim: [1, 1, 1] };
      me.configureBrainImage();
      assert.deepEqual(requests(), ['sag 20']);
    });

    it('a slice from the URL is a string, and a known slice', function () {
      Object.assign(me.User, { view: 'sag', slice: '50' });
      me.drawImages();
      assert.deepEqual(requests(), ['sag 50']);
      assert.deepEqual(sent.filter((m) => m.type === 'requestSlice').map((m) => m.slice), ['50']);
    });

    it('configureBrainImage keeps a slice from the URL and asks for it', function () {
      me.User.slice = '30';
      me.User.s2v = { sdim: [40, 50, 60], wpixdim: [1, 1, 1] };
      me.configureBrainImage();
      assert.deepEqual(requests(), ['sag 30']);
    });

    it('an undefined slice is not known', function () {
      me.User.view = 'sag';
      delete me.User.slice;
      me.drawImages();
      assert.deepEqual(requests(), []);
      assert.isNotOk(me.flagLoadingImg.loading);
    });

    it('slice 0 is a known slice', function () {
      Object.assign(me.User, { view: 'axi', slice: 0 });
      me.drawImages();
      assert.deepEqual(requests(), ['axi 0']);
    });
  });

  describe('when the server says a request failed', function () {
    it('is no longer loading, so that a later request can go out', function () {
      askFirstSlice();
      failed();
      assert.isFalse(me.flagLoadingImg.loading);
      me.User.slice = 11;
      me.drawImages();
      assert.deepEqual(requests(), ['sag 11']);
    });

    it('asks once for the slice the user is on when the slice changed', function () {
      askFirstSlice();
      me.User.slice = 11;
      failed();
      assert.deepEqual(requests(), ['sag 11']);
      assert.isTrue(me.flagLoadingImg.loading);
      assert.deepEqual(states, [], 'the retry may work');
    });

    it('asks once for the view the user is on when the view changed', function () {
      askFirstSlice();
      me.User.view = 'cor';
      failed();
      assert.deepEqual(requests(), ['cor 10']);
    });

    it('shows the error when nothing has been drawn', function () {
      askFirstSlice();
      failed();
      assert.deepEqual(requests(), [], 'the same request would fail again');
      assert.deepEqual(states, ['error']);
    });

    it('keeps the slice on screen when there is one', function () {
      showSlice();
      me.User.slice = 11;
      me.drawImages();
      sent.length = 0;
      const { img } = me.brainImg;
      failed();
      assert.deepEqual(requests(), []);
      assert.deepEqual(states, []);
      assert.strictEqual(me.brainImg.img, img);
    });

    it('with a string slice, shows the error: the same slice is not asked again', function () {
      Object.assign(me.User, { view: 'sag', slice: '50' });
      me.drawImages();
      sent.length = 0;
      failed();
      assert.deepEqual(requests(), []);
      assert.deepEqual(states, ['error']);
    });

    it('with a slice that is not a number (?slice=abc in an embed), shows the error instead of asking for ever', function () {
      Object.assign(me.User, { view: 'sag', slice: NaN });
      me.drawImages();
      assert.lengthOf(requests(), 1);
      sent.length = 0;
      failed();
      assert.deepEqual(requests(), []);
      assert.deepEqual(states, ['error']);
    });

    it('does not loop when every request fails: one retry, then it stops', function () {
      askFirstSlice();
      let unanswered = 0;
      onRequest = (message) => {
        if (message.type === 'requestSlice') { unanswered += 1; }
      };
      me.User.slice = 11;
      failed();
      for (let i = 0; i < 10 && unanswered > 0; i++) {
        unanswered -= 1;
        failed();
      }
      assert.deepEqual(requests(), ['sag 11']);
      assert.deepEqual(states, ['error']);
      assert.isFalse(me.flagLoadingImg.loading);
    });

    it('ignores an answer when nothing is on its way, as after changing to another brain', function () {
      askFirstSlice();
      me.flagLoadingImg = { loading: false }; // as _configureMRI
      me.brainImg.img = null;
      failed();
      assert.deepEqual(requests(), []);
      assert.deepEqual(states, []);
    });
  });

  describe('once a string slice has arrived', function () {
    it('does not ask for it again', function () {
      Object.assign(me.User, { view: 'sag', slice: '50' });
      me.drawImages();
      sent.length = 0;
      // as the jpg branch of receiveBinaryMessage
      Object.assign(me.brainImg, { img: {}, view: me.flagLoadingImg.view, slice: me.flagLoadingImg.slice });
      me.flagLoadingImg.loading = false;
      assert.strictEqual(me.flagLoadingImg.slice, me.User.slice);
      me.drawImages();
      assert.deepEqual(requests(), []);
    });
  });

  describe('a tab opened before this message existed', function () {
    it('ignores the message, without throwing, and stays as it was', function () {
      askFirstSlice();
      delete me.receiveFunctions.sliceFailed;
      assert.doesNotThrow(failed);
      assert.isTrue(me.flagLoadingImg.loading);
      assert.deepEqual(states, []);
    });
  });
});
