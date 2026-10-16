// The vector layer (an SVG over the slice, with the landmarks and the
// measurement) is drawn by the functions registered with
// _registerToolDisplayInformation. They scale voxel coordinates by the
// canvas size and the voxel dimensions, which are only known once the brain
// is configured (configureBrainImage). Before that, a vectorial message from
// the server (sent with the atlas, and handled before the atlas data) put
// NaN coordinates in the SVG, or threw when the MRI geometry was missing
// (from PR #342, b306d51, Nicolas Traut).

const { assert } = require('chai');
const { JSDOM } = require('jsdom');

const { AtlasMakerDraw } = require('../../view/atlasmaker/src/atlasmaker-draw.js');
const { AtlasMakerInteraction } = require('../../view/atlasmaker/src/atlasmaker-interaction.js');

const html = `<!DOCTYPE html><html><body><div id="atlasmaker"><div id="resizable">
<canvas id="canvas" style="width:400px;height:300px"></canvas>
<div id="text-layer"></div>
<svg id="vector-layer"></svg>
</div></div></body></html>`;

const savedGlobals = {};

// A widget in the state it has after _configureMRI (the MRI geometry is
// known) but before configureBrainImage (the brain is not configured yet),
// with a slice already chosen (from the URL or the history)
const makeWidget = (document) => {
  const me = {
    ...AtlasMakerDraw,
    ...AtlasMakerInteraction,
    container: document.querySelector('#atlasmaker'),
    canvas: document.querySelector('#canvas'),
    brainW: null,
    brainH: null,
    brainD: null,
    brainWdim: null,
    brainHdim: null,
    info: {},
    displayInformationFunctions: [],
    User: {
      view: 'sag',
      slice: 10,
      s2v: { sdim: [20, 200, 150], wpixdim: [1, 1, 2] },
      measureLength: null,
      vectorial: [{ type: 'text', text: 'landmark A', position: [10, 50, 99] }]
    }
  };
  me.displayInformationFunctions.push(me.landmarkToolDisplayInformation, me.measureToolDisplayInformation);

  return me;
};

// What configureBrainImage sets, for the sagittal view of the volume above
const configureBrain = (me) => {
  [me.brainW, me.brainH, me.brainD, me.brainWdim, me.brainHdim] = [200, 150, 20, 1, 2];
  me.canvas.width = me.brainW;
  me.canvas.height = me.brainH * me.brainHdim / me.brainWdim;
};

const vectorLayer = (me) => me.container.querySelector('#vector-layer').innerHTML;

describe('Atlasmaker vector layer: ', function () {
  let me;

  beforeEach(function () {
    const dom = new JSDOM(html);
    for (const name of ['document', 'AtlasMakerWidget']) {
      savedGlobals[name] = global[name];
    }
    global.document = dom.window.document;
    me = makeWidget(dom.window.document);
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

  describe('before the brain is configured', function () {
    it('should not put NaN coordinates in the SVG for landmarks', function () {
      me.displayInformation();
      assert.notMatch(vectorLayer(me), /NaN|Infinity/);
      assert.strictEqual(vectorLayer(me), '');
    });

    it('should not put NaN coordinates in the SVG for a measurement', function () {
      me.User.vectorial = [];
      me.User.measureLength = [{ x: 10, y: 20 }, { x: 30, y: 40 }];
      me.displayInformation();
      assert.notMatch(vectorLayer(me), /NaN|Infinity/);
      assert.strictEqual(vectorLayer(me), '');
    });

    it('should not throw when the MRI geometry is not known yet', function () {
      delete me.User.s2v;
      assert.doesNotThrow(() => me.displayInformation());
      assert.strictEqual(vectorLayer(me), '');
    });

    it('should still write the text layer', function () {
      me.info.volume = '0 mm3';
      me.displayInformation();
      assert.include(me.container.querySelector('#text-layer').innerHTML, 'volume: 0 mm3');
      assert.include(me.container.querySelector('#text-layer').innerHTML, 'slice: 10');
    });
  });

  describe('once the brain is configured', function () {
    it('should draw the landmarks of the current slice, scaled to the canvas', function () {
      configureBrain(me);
      me.displayInformation();
      // sag: x = position[1] = 50, y = sdim[2]-1-position[2] = 50;
      // zx = 400px / 200 = 2, zy = zx * brainHdim / brainWdim = 4
      assert.include(vectorLayer(me), 'translate(100,200)');
      assert.include(vectorLayer(me), 'landmark A');
    });

    it('should not draw the landmarks of other slices', function () {
      configureBrain(me);
      me.User.slice = 11;
      me.displayInformation();
      assert.notInclude(vectorLayer(me), 'landmark A');
    });

    it('should draw the measurement, scaled to the canvas', function () {
      configureBrain(me);
      me.User.vectorial = [];
      me.User.measureLength = [{ x: 10, y: 20 }, { x: 30, y: 40 }];
      me.displayInformation();
      assert.include(vectorLayer(me), 'M20, 80L60, 160');
      assert.notMatch(vectorLayer(me), /NaN|Infinity/);
    });
  });
});
