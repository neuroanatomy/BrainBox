/**
 * Sizing arithmetic for the embeddable viewer.
 *
 * Authored as CommonJS on purpose: webpack consumes it happily, and mocha can
 * `require` it directly, which is what makes it the one piece of client-side
 * embed logic covered by unit tests (the AtlasMaker modules import .css/.html
 * through webpack loaders and cannot be required outside a bundle).
 *
 * Only the plane's aspect ratio is here, since it follows BrainBox's data model;
 * the height to ask for, desiredEmbedHeight(), is in nwl-components/embed.
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

module.exports = { planeAspect };
