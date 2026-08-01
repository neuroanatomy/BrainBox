/**
 * Sizing arithmetic for the embeddable viewer.
 *
 * Authored as CommonJS on purpose: webpack consumes it happily, and mocha can
 * `require` it directly, which is what makes it the one piece of client-side
 * embed logic covered by unit tests (the AtlasMaker modules import .css/.html
 * through webpack loaders and cannot be required outside a bundle).
 *
 * The height an embed needs is *computed* from the plane's aspect ratio, never
 * measured from the DOM. Measuring is what made the previous implementation
 * useless: it read document.body.scrollHeight inside a viewport-height box, so
 * it reported the height it already had and could only ever ratchet upwards.
 */

/**
 * Physical (not voxel) aspect ratio of the currently displayed plane.
 * Voxels are frequently anisotropic, so the pixel dimensions matter.
 * @param {object} dims Brain dimensions, as held by AtlasMakerWidget
 * @param {number} dims.brainW Width in voxels
 * @param {number} dims.brainH Height in voxels
 * @param {number} dims.brainWdim World width of one voxel
 * @param {number} dims.brainHdim World height of one voxel
 * @returns {number} width/height ratio, or NaN if the geometry is not known yet
 */
const planeAspect = function ({ brainW, brainH, brainWdim, brainHdim }) {
  const w = brainW * brainWdim;
  const h = brainH * brainHdim;

  if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) {
    return NaN;
  }

  return w / h;
};

/**
 * Height the host page should give the iframe so the image is not letterboxed.
 * @param {object} opts Options
 * @param {number} opts.width Current content width of the embed, in px
 * @param {number} opts.aspect Plane aspect ratio, from planeAspect()
 * @param {number} opts.toolbarHeight Height of the toolbar below the image, in px
 * @param {number} [opts.minHeight] Never report less than this
 * @param {number} [opts.maxHeight] Never report more than this
 * @returns {number} Integer height in px, or NaN when the aspect is unknown
 */
const desiredEmbedHeight = function ({ width, aspect, toolbarHeight, minHeight = 160, maxHeight = Infinity }) {
  if (!isFinite(width) || width <= 0 || !isFinite(aspect) || aspect <= 0) {
    return NaN;
  }

  const bar = isFinite(toolbarHeight) ? toolbarHeight : 0;
  const ideal = Math.round(width / aspect) + bar;

  // A max lower than the min is contradictory; the min is the safer promise to
  // keep, since a box below it cannot show anything useful at all.
  return Math.max(minHeight, Math.min(maxHeight, ideal));
};

module.exports = { planeAspect, desiredEmbedHeight };
