#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

/*
  Give the atlases of the projects' volume layers the label set of the layer.

  Until 2026-10, changing the label set of a volume layer in a project's settings
  changed only the project: the atlases of the layer, in the MRIs already opened in
  the project, kept the label set they had been created with, and the viewer kept
  showing it. This script finds those atlases and gives them the layer's label set.

  Each MRI changed is saved the way BrainBox saves one: the current version is marked
  as a backup, and a new one inserted. Atlases of layers with the same name in other
  projects are not changed. Layers whose label set does not exist in public/labels/
  are reported and left alone.

  Usage:
    MONGODB=localhost:27017/brainbox node bin/sync-atlas-labelsets.js [<shortname>] [--apply]

  Without a shortname, it goes through every project. Without --apply, it only reports
  what it would do.
*/

const { MongoClient } = require('mongodb');
const { isLabelset, setLayerLabelset } = require('../controller/project/atlas-labels.js');

const USERNAME = 'sync-atlas-labelsets';

/**
 * Give the atlases of the volume layers of some projects their layer's label set
 * @param {Object} db Native MongoDB database
 * @param {Object} params Parameters
 * @param {string} [params.shortname] Only this project
 * @param {boolean} [params.apply] Change the MRIs; otherwise only report
 * @returns {Promise<Array<Object>>} One entry per layer with atlases to change, or an
 *   unknown label set: {project, name, values, unknown, mris: [{source, from}]}
 */
const syncAtlasLabelsets = async (db, { shortname, apply = false } = {}) => {
  const query = { backup: { $exists: false } };
  if (shortname) { query.shortname = shortname; }
  const projects = await db.collection('project')
    .find(query, { projection: { shortname: 1, annotations: 1 } })
    .toArray();
  const report = [];
  for (const project of projects) {
    const layers = ((project.annotations && project.annotations.list) || [])
      .filter((a) => a && a.type === 'volume' && typeof a.name === 'string');
    for (const { name, values } of layers) {
      if (isLabelset(values)) {
        // eslint-disable-next-line no-await-in-loop
        const mris = await setLayerLabelset(db, { project: project.shortname, name, values, username: USERNAME, dryRun: !apply });
        if (mris.length > 0) {
          report.push({ project: project.shortname, name, values, unknown: false, mris });
        }
      } else {
        report.push({ project: project.shortname, name, values, unknown: true, mris: [] });
      }
    }
  }

  return report;
};

// eslint-disable-next-line max-statements
const main = async () => {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const shortname = args.find((a) => !a.startsWith('--'));

  let url = process.env.MONGODB || 'localhost:27017/brainbox';
  if (!url.startsWith('mongodb')) { url = 'mongodb://' + url; }
  const client = await MongoClient.connect(url);
  try {
    const db = client.db();
    console.log(`${apply ? 'Changing' : 'Dry run on'} ${db.databaseName}${shortname ? `, project ${shortname}` : ', all projects'}.`);
    const report = await syncAtlasLabelsets(db, { shortname, apply });
    let total = 0;
    for (const { project, name, values, unknown, mris } of report) {
      if (unknown) {
        console.log(`  ${project} / ${name}: label set "${values}" does not exist, left alone`);
      } else {
        total += mris.length;
        const from = [...new Set(mris.flatMap((m) => m.from))].join(', ');
        console.log(`  ${project} / ${name}: ${mris.length} MRIs from ${from} to ${values}`);
      }
    }
    console.log(`${total} MRIs ${apply ? 'changed' : 'to change'}.`);
    if (!apply && total > 0) {
      console.log('Nothing changed. Run again with --apply to change them.');
    }
  } finally {
    await client.close();
  }
};

if (require.main === module) {
  main().catch((err) => {
    console.error('ERROR:', err.message);
    process.exitCode = 1;
  });
}

module.exports = { syncAtlasLabelsets };
