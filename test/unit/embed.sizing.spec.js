const { assert } = require('chai');
const { planeAspect, desiredEmbedHeight } = require('../../view/shared/embedSizing');

// Sloth Bear (braincatalogue.org), the brain the embed demo page uses:
// 230 x 300 x 270 voxels, 0.33 mm isotropic.
const SLOTH_BEAR = { dim: [230, 300, 270], pix: 0.33 };
const plane = {
  sag: { brainW: SLOTH_BEAR.dim[1], brainH: SLOTH_BEAR.dim[2], brainWdim: SLOTH_BEAR.pix, brainHdim: SLOTH_BEAR.pix },
  cor: { brainW: SLOTH_BEAR.dim[0], brainH: SLOTH_BEAR.dim[2], brainWdim: SLOTH_BEAR.pix, brainHdim: SLOTH_BEAR.pix },
  axi: { brainW: SLOTH_BEAR.dim[0], brainH: SLOTH_BEAR.dim[1], brainWdim: SLOTH_BEAR.pix, brainHdim: SLOTH_BEAR.pix }
};

describe('Embed sizing: ', function () {
  describe('planeAspect function() ', function () {
    it('should give each plane its own aspect ratio', function () {
      assert.closeTo(planeAspect(plane.sag), 300 / 270, 1e-9);
      assert.closeTo(planeAspect(plane.cor), 230 / 270, 1e-9);
      assert.closeTo(planeAspect(plane.axi), 230 / 300, 1e-9);
    });

    it('should account for anisotropic voxels', function () {
      // Same voxel counts, but voxels twice as tall as they are wide: the
      // displayed image is half as wide, relative to its height.
      const isotropic = { brainW: 100, brainH: 100, brainWdim: 1, brainHdim: 1 };
      const anisotropic = { brainW: 100, brainH: 100, brainWdim: 1, brainHdim: 2 };
      assert.strictEqual(planeAspect(isotropic), 1);
      assert.strictEqual(planeAspect(anisotropic), 0.5);
    });

    it('should return NaN before the geometry is known', function () {
      assert.isNaN(planeAspect({}));
      assert.isNaN(planeAspect({ brainW: null, brainH: null, brainWdim: null, brainHdim: null }));
      assert.isNaN(planeAspect({ brainW: 0, brainH: 10, brainWdim: 1, brainHdim: 1 }));
    });
  });

  describe('desiredEmbedHeight function() ', function () {
    it('should be the image height for the given width, plus the toolbar', function () {
      const height = desiredEmbedHeight({ width: 512, aspect: 2, toolbarHeight: 54 });
      assert.strictEqual(height, 256 + 54);
    });

    it('should ask for a smaller box for a wider plane, and a bigger one for a taller plane', function () {
      // The regression that made the old implementation useless: it measured
      // document.body.scrollHeight, which is clamped by the very box it was
      // trying to resize, so a shorter plane could never shrink the iframe.
      const forPlane = (p) => desiredEmbedHeight({ width: 512, aspect: planeAspect(p), toolbarHeight: 54 });
      const [sag, cor, axi] = [forPlane(plane.sag), forPlane(plane.cor), forPlane(plane.axi)];

      assert.isBelow(sag, cor, 'sagittal is the widest plane, so it needs the least height');
      assert.isAbove(axi, cor, 'axial is the tallest plane, so it needs the most');
    });

    it('should be reversible: coming back to a plane asks for the height it first asked for', function () {
      const args = { width: 512, aspect: planeAspect(plane.cor), toolbarHeight: 54 };
      assert.strictEqual(desiredEmbedHeight(args), desiredEmbedHeight(args));
    });

    it('should scale with the width the host gives it', function () {
      const at = (width) => desiredEmbedHeight({ width, aspect: 1, toolbarHeight: 0 });
      assert.strictEqual(at(300), 300);
      assert.strictEqual(at(600), 600);
    });

    it('should respect maxHeight, so a tall plane cannot take over the host page', function () {
      const height = desiredEmbedHeight({ width: 1000, aspect: 0.5, toolbarHeight: 54, maxHeight: 700 });
      assert.strictEqual(height, 700);
    });

    it('should respect minHeight, so a very wide box still shows something', function () {
      const height = desiredEmbedHeight({ width: 100, aspect: 10, toolbarHeight: 0, minHeight: 160 });
      assert.strictEqual(height, 160);
    });

    it('should keep minHeight when the two bounds contradict each other', function () {
      const height = desiredEmbedHeight({ width: 500, aspect: 1, toolbarHeight: 0, minHeight: 300, maxHeight: 100 });
      assert.strictEqual(height, 300);
    });

    it('should return NaN rather than a guess when the aspect is unknown', function () {
      assert.isNaN(desiredEmbedHeight({ width: 512, aspect: NaN, toolbarHeight: 54 }));
      assert.isNaN(desiredEmbedHeight({ width: 0, aspect: 1, toolbarHeight: 54 }));
    });

    it('should tolerate a missing toolbar measurement', function () {
      assert.strictEqual(desiredEmbedHeight({ width: 400, aspect: 2, toolbarHeight: NaN }), 200);
    });
  });
});
