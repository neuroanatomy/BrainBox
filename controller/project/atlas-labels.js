/**
 * Keep the label set of the atlases of a project's volume layers in step
 * with the project's settings.
 *
 * A volume layer of a project is `annotations.list[i]` = { type: 'volume',
 * name, values }, where `values` is the file of its label set in
 * public/labels/. In each MRI opened in the project, the layer has an atlas,
 * `mri.atlas[j]` = { project, name, labels, filename, ... }, created by the
 * project page with `labels` = the layer's `values`. The viewer only reads
 * `labels`, so the project's `values` is the truth, and `labels` a copy.
 *
 * MRI documents are versioned: a change marks every version of the document
 * as backup and inserts a new version (the only one without the backup field).
 */
const fs = require('fs');
const path = require('path');

const labelsDirectory = path.join(__dirname, '../../public/labels');

/**
 * Tell if a string names one of the label sets of public/labels/
 * @param {string} values The `values` of a volume layer
 * @returns {boolean} True if it is a label set file
 */
const isLabelset = (values) => typeof values === 'string' &&
  (/^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.json$/).test(values) &&
  // eslint-disable-next-line no-sync
  fs.existsSync(path.join(labelsDirectory, values));

const volumeLayers = (annotations) => ((annotations && Array.isArray(annotations.list)) ? annotations.list : [])
  .filter((a) => a && a.type === 'volume' && typeof a.name === 'string');

/**
 * The volume layers whose label set changed between two versions of a
 * project. Layers are matched by name: a renamed layer is a new layer.
 * @param {object} oldAnnotations `annotations` of the stored project
 * @param {object} newAnnotations `annotations` of the project being saved
 * @returns {Array<{name: string, from: string, values: string}>} The changed layers
 */
const changedLabelsets = (oldAnnotations, newAnnotations) => {
  const before = new Map(volumeLayers(oldAnnotations).map((a) => [a.name, a.values]));

  return volumeLayers(newAnnotations)
    .filter((a) => before.has(a.name) && before.get(a.name) !== a.values)
    .map((a) => ({ name: a.name, from: before.get(a.name), values: a.values }));
};

/**
 * Save a new version of an MRI, where some atlases have a new label set
 * @param {object} nativeDb Native MongoDB database
 * @param {object} mri The current version of the MRI
 * @param {function(object): boolean} select Tells which atlases change
 * @param {object} change {values, username}: the label set, and who changes it
 * @returns {Promise<void>} Resolves once the new version is saved
 */
const saveNewVersion = async (nativeDb, mri, select, { values, username }) => {
  const now = (new Date()).toJSON();
  const version = {
    ...mri,
    mri: {
      ...mri.mri,
      atlas: mri.mri.atlas.map((a) => (select(a) ? { ...a, labels: values, modified: now, modifiedBy: username } : a))
    },
    modified: now,
    modifiedBy: username
  };
  await nativeDb.collection('mri').updateMany({ source: mri.source }, { $set: { backup: true } });
  await nativeDb.collection('mri').insertOne(version);
};

/**
 * Give a label set to the atlases of a volume layer, in every MRI where the
 * layer's atlas has another one. Atlases of layers with the same name in
 * other projects are not changed.
 * @param {object} nativeDb Native MongoDB database
 * @param {object} params Parameters
 * @param {string} params.project Project shortname
 * @param {string} params.name Layer name
 * @param {string} params.values Label set file
 * @param {string} params.username Who makes the change (the MRI's modifiedBy)
 * @param {boolean} [params.dryRun] Only list the MRIs that would change
 * @returns {Promise<Array<{source: string, from: Array<string>}>>} The MRIs changed,
 *   with the label sets their atlases had
 */
const setLayerLabelset = async (nativeDb, { project, name, values, username, dryRun = false }) => {
  if (!isLabelset(values)) {
    throw new Error(`Unknown label set "${values}"`);
  }
  const mismatch = (a) => a && a.project === project && a.name === name && a.labels !== values;
  const mris = await nativeDb.collection('mri')
    .find({
      backup: { $exists: false },
      'mri.atlas': { $elemMatch: { project, name, labels: { $ne: values } } }
    }, { projection: { _id: 0 } })
    .toArray();
  const changed = [];
  for (const mri of mris) {
    changed.push({ source: mri.source, from: mri.mri.atlas.filter(mismatch).map((a) => a.labels) });
    if (!dryRun) {
      // eslint-disable-next-line no-await-in-loop
      await saveNewVersion(nativeDb, mri, mismatch, { values, username });
    }
  }

  return changed;
};

module.exports = {
  isLabelset,
  changedLabelsets,
  setLayerLabelset
};
