// drawImages redraws the slice (brain, atlas and information overlay) at the
// next animation frame. Painting, other users' strokes, the slice slider and
// the slices that arrive call it, often several times per frame, and each
// redraw goes over every pixel of the slice: the calls made before a frame
// give one redraw. The slice request is still sent at the call
// (from PR #342, bb8e33b, Nicolas Traut).

const { assert } = require('chai');

const { AtlasMakerDraw } = require('../../view/atlasmaker/src/atlasmaker-draw.js');

const savedGlobals = {};

// A widget showing sagittal slice 10, with what the redraw does recorded in `log`
const makeWidget = (log) => {
  const canvas = { width: 200, height: 300 };
  const me = {
    ...AtlasMakerDraw,
    canvas,
    context: {
      canvas,
      clearRect: () => log.push('clear'),
      drawImage: () => log.push('brain')
    },
    brainW: 200,
    brainH: 150,
    brainWdim: 1,
    brainHdim: 2,
    brainImg: { img: {}, view: 'sag', slice: 10 },
    flagLoadingImg: { loading: false, view: 'sag', slice: 10 },
    User: { view: 'sag', slice: 10 },
    displayInformation: () => log.push('info'),
    drawAtlasImage: (view, slice) => log.push(`atlas ${view} ${slice}`),
    // as atlasmaker-ws.js: one request at a time, for the user's slice
    sendRequestSliceMessage: () => {
      if (me.flagLoadingImg.loading) { return; }
      log.push(`request ${me.User.view} ${me.User.slice}`);
      Object.assign(me.flagLoadingImg, { loading: true, view: me.User.view, slice: me.User.slice });
    }
  };

  return me;
};

describe('Atlasmaker drawImages: one redraw per animation frame', function () {
  let me;
  let log;
  let frames;
  const nextFrame = () => {
    const callbacks = frames;
    frames = [];
    callbacks.forEach((cb) => cb(16));
  };

  beforeEach(function () {
    for (const name of ['window', 'AtlasMakerWidget']) {
      savedGlobals[name] = global[name];
    }
    log = [];
    frames = [];
    global.window = { requestAnimationFrame: (cb) => { frames.push(cb); } };
    me = makeWidget(log);
    global.AtlasMakerWidget = me;
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

  it('draws nothing until the frame, then draws once for all the calls made before it', function () {
    for (let i = 0; i < 5; i++) { me.drawImages(); }
    assert.deepEqual(log, []);
    assert.lengthOf(frames, 1, 'one frame requested');

    nextFrame();
    assert.deepEqual(log, ['clear', 'info', 'brain', 'atlas sag 10']);
  });

  it('draws again at a later frame when called after a frame', function () {
    me.drawImages();
    nextFrame();
    me.drawImages();
    me.drawImages();
    assert.lengthOf(frames, 1);
    nextFrame();
    assert.deepEqual(log, ['clear', 'info', 'brain', 'atlas sag 10', 'clear', 'info', 'brain', 'atlas sag 10']);
  });

  it('asks for a new slice at the call, once, and shows the atlas of the brain slice on screen until it arrives', function () {
    me.User.slice = 11;
    me.drawImages();
    assert.deepEqual(log, ['request sag 11'], 'the request does not wait for the frame');
    me.User.slice = 12;
    me.drawImages();
    assert.deepEqual(log, ['request sag 11'], 'no second request while one is loading');

    nextFrame();
    // as before, when each call drew right away: the last draw before the
    // request was for slice 11, the one being loaded
    assert.deepEqual(log.slice(1), ['clear', 'info', 'brain', 'atlas sag 11']);
  });

  it('draws the atlas of the slice it had before asking for a new one', function () {
    me.User.slice = 11;
    me.drawImages();
    nextFrame();
    assert.deepEqual(log, ['request sag 11', 'clear', 'info', 'brain', 'atlas sag 10']);
  });

  it('draws slice 0', function () {
    Object.assign(me.brainImg, { slice: 0 });
    Object.assign(me.flagLoadingImg, { slice: 0 });
    me.User.slice = 0;
    me.drawImages();
    nextFrame();
    assert.deepEqual(log, ['clear', 'info', 'brain', 'atlas sag 0']);
  });

  it('draws nothing before the brain image has arrived, and asks for it', function () {
    me.brainImg.img = null;
    me.drawImages();
    nextFrame();
    assert.deepEqual(log, ['request sag 10']);
  });
});
