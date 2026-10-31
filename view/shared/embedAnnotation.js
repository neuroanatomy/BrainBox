/**
 * Which annotation layer an embed shows.
 *
 * Authored as CommonJS, like embedSizing.js, so mocha can `require` it.
 */

// Value of the `annotation` option meaning "show the bare MRI, no atlas".
const NO_ANNOTATION_OPTION = 'none';

// Index handed to AtlasMakerWidget.configureAtlasMaker for "no atlas".
const NO_ATLAS = -1;

/**
 * Find the index of the atlas/annotation the host page asked for via the
 * `project`/`annotation` query params, defaulting to the first available one.
 * `annotation=none` asks for no atlas at all and returns NO_ATLAS, whatever
 * `project` is. It never selects a different dataset: it only loads less.
 * @param {Object} mri The mri.atlas-bearing object from mriInfo
 * @param {string} project Project shortname requested by the embedding page
 * @param {string} annotation Annotation name requested by the embedding page, or 'none'
 * @returns {number} The index into mri.atlas to load, or NO_ATLAS
 */
const findAnnotationItemIndex = function (mri, project, annotation) {
  if (annotation === NO_ANNOTATION_OPTION) {
    return NO_ATLAS;
  }
  if (!mri || !mri.atlas || !project || !annotation) {
    return 0;
  }
  const index = mri.atlas.findIndex((a) => a.project === project && a.name === annotation);

  return index >= 0 ? index : 0;
};

module.exports = { NO_ANNOTATION_OPTION, NO_ATLAS, findAnnotationItemIndex };
