/**
 * Before the label set of a project's volume layer changes: which values do
 * the layer's annotations already use, and which of them the new label set
 * has no label for (the viewer draws those in plain red, all alike).
 *
 * Nothing in the MRI documents says which values an atlas uses, so the atlas
 * files are read: each is gunzipped and scanned, sequentially. That costs
 * about the size of the atlas (a few MB, a few tens of ms) per MRI where the
 * layer has an atlas file. Edits not yet written to the file by the
 * WebSocket server (it writes them when the last user leaves, and every
 * 15 minutes) are not seen.
 */
const fs = require('fs');
const path = require('path');
const { AccessLevel } = require('neuroweblab');
const amri = require('../atlasmakerServer/atlasmaker-mri.js');
const BrainboxAccessControlService = require('../../services/BrainboxAccessControlService');
const { isLabelset } = require('./atlas-labels.js');

const publicDirectory = path.join(__dirname, '../../public');

/**
 * The non-zero values of an atlas file
 * @param {string} filePath Path of a .nii.gz or .mgz atlas
 * @returns {Promise<Array<number>>} The values, sorted
 */
const atlasValues = async (filePath) => {
  const atlas = await amri.loadMRI(filePath);
  const seen = new Set();
  for (const v of atlas.data) {
    if (v !== 0) { seen.add(v); }
  }

  return [...seen].sort((a, b) => a - b);
};

/**
 * Path of the file of an atlas, if it is a plain file name inside the MRI's directory
 * @param {object} mri MRI document
 * @param {object} atlas Atlas entry of the MRI
 * @returns {string|null} The path, or null
 */
const atlasPath = (mri, atlas) => {
  if (typeof mri.url !== 'string' || typeof atlas.filename !== 'string' || atlas.filename.includes('/')) {
    return null;
  }
  const filePath = path.join(publicDirectory, mri.url, atlas.filename);

  return filePath.startsWith(publicDirectory + path.sep) ? filePath : null;
};

/**
 * The values used by the atlases of a project's volume layer
 * @param {object} nativeDb Native MongoDB database
 * @param {string} project Project shortname
 * @param {string} name Layer name
 * @returns {Promise<{atlases: number, annotated: number, values: Array<number>}>}
 *   The number of MRIs where the layer has an atlas, of those with an atlas
 *   file, and the values used in all of them
 */
const layerValues = async (nativeDb, project, name) => {
  const mris = await nativeDb.collection('mri')
    .find({ backup: { $exists: false }, 'mri.atlas': { $elemMatch: { project, name } } }, { projection: { _id: 0, url: 1, 'mri.atlas': 1 } })
    .toArray();
  const values = new Set();
  let annotated = 0;
  for (const mri of mris) {
    for (const atlas of mri.mri.atlas.filter((a) => a && a.project === project && a.name === name)) {
      const filePath = atlasPath(mri, atlas);
      // eslint-disable-next-line no-sync
      if (filePath && fs.existsSync(filePath)) {
        annotated += 1;
        try {
          // eslint-disable-next-line no-await-in-loop
          (await atlasValues(filePath)).forEach((v) => values.add(v));
        } catch (err) {
          console.error(`labelset check: cannot read ${filePath}:`, err.message);
        }
      }
    }
  }

  return { atlases: mris.length, annotated, values: [...values].sort((a, b) => a - b) };
};

/**
 * @function labelsetCheck
 * @desc GET /project/json/:projectName/labelset-check?layer=<name>&values=<label set file>
 *       What changing the label set of a volume layer would do to its annotations:
 *       { layer, values, labelset: {name, count, max}, atlases, annotated,
 *         used: [values], unlabelled: [used values the label set has no label for] }
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 * @returns {Promise<void>}
 */
// eslint-disable-next-line max-statements
const labelsetCheck = async function (req, res) {
  const loggedUser = req.isAuthenticated() ? req.user.username : 'anonymous';
  const { projectName } = req.params;
  const { layer, values } = req.query;
  if (typeof layer !== 'string' || layer === '' || !isLabelset(values)) {
    res.status(400).json({ error: 'Provide a layer and an existing label set' });

    return;
  }
  const project = await req.nativeDb.collection('project').findOne({ shortname: projectName, backup: { $exists: false } });
  if (!project) {
    res.status(404).json({ error: `No project ${projectName}` });

    return;
  }
  if (!BrainboxAccessControlService.hasFilesAccess(AccessLevel.VIEW, project, loggedUser)) {
    res.status(403).json({ error: `User ${loggedUser} is not allowed to view project ${projectName}` });

    return;
  }
  try {
    const labelset = JSON.parse(await fs.promises.readFile(path.join(publicDirectory, 'labels', values)));
    const labelValues = new Set(labelset.labels.map((l) => Number(l.value)));
    const { atlases, annotated, values: used } = await layerValues(req.nativeDb, projectName, layer);
    res.json({
      layer,
      values,
      labelset: { name: labelset.name, count: labelValues.size, max: Math.max(0, ...labelValues) },
      atlases,
      annotated,
      used,
      unlabelled: used.filter((v) => !labelValues.has(v))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = { atlasValues, layerValues, labelsetCheck };
