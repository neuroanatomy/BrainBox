/**
 * The warning shown by the project settings page before saving a new label
 * set for a volume layer whose annotations use values the new label set has
 * no label for. The viewer draws those values in plain red, all alike: they
 * no longer show as separate colours. The voxels keep their values, so
 * going back to the previous label set brings the colours back.
 *
 * Authored as CommonJS, like embedSizing.js, so that mocha can `require` it.
 */

const volumeLayers = (list) => (Array.isArray(list) ? list : [])
  .filter((a) => a && a.type === 'volume' && typeof a.name === 'string');

/**
 * The volume layers whose label set changed. Layers are matched by name: a
 * renamed layer is a new layer, which has no annotations yet.
 * @param {Array} before The project's annotations.list when the page was loaded (or last saved)
 * @param {Array} after The project's annotations.list now
 * @returns {Array<{name: string, values: string}>} The layers, with their new label set
 */
const changedVolumeLabelsets = (before, after) => {
  const old = new Map(volumeLayers(before).map((a) => [a.name, a.values]));

  return volumeLayers(after)
    .filter((a) => old.has(a.name) && old.get(a.name) !== a.values)
    .map((a) => ({ name: a.name, values: a.values }));
};

const listValues = (values) => (values.length > 10 ?
  `${values.slice(0, 10).join(', ')} and ${values.length - 10} more` :
  values.join(', '));

/**
 * The warning for one layer
 * @param {object} check The answer of /project/json/:project/labelset-check
 * @returns {string|null} The warning, or null if all the values used have a label
 */
const layerWarning = (check) => {
  if (!check || !Array.isArray(check.unlabelled) || check.unlabelled.length === 0) {
    return null;
  }
  const max = check.used[check.used.length - 1];

  return `Layer "${check.layer}" already has annotations, in ${check.annotated} MRI${check.annotated === 1 ? '' : 's'}, ` +
    `that use values up to ${max}. The label set "${check.labelset.name}" has ${check.labelset.count} label${check.labelset.count === 1 ? '' : 's'} ` +
    `(values up to ${check.labelset.max}): the annotation values ${listValues(check.unlabelled)} will no longer show as separate colours ` +
    '(they will all be drawn in red). The annotations themselves are not changed.';
};

/**
 * The confirmation asked before saving, or null if there is nothing to warn about
 * @param {Array<object>} checks The answers of /project/json/:project/labelset-check
 * @returns {string|null} The question
 */
const labelsetWarning = (checks) => {
  const warnings = checks.map(layerWarning).filter(Boolean);
  if (warnings.length === 0) {
    return null;
  }

  return `${warnings.join('\n\n')}\n\nAre you sure you want to change the label set?`;
};

module.exports = { changedVolumeLabelsets, layerWarning, labelsetWarning };
