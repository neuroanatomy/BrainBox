'use strict';

const fs = require('fs');
const { body, validationResult } = require('express-validator');
const amri = require('../atlasmakerServer/atlasmaker-mri');
const AsyncLock = require('async-lock');
const lock = new AsyncLock();

// ExpressValidator = require('express-validator')

const validator = async function (req, res, next) {
  console.log('upload.controller body', req.body);
  console.log('upload.controller query', req.query);
  console.log('upload.controller params', req.params);

  await body('url', 'Provide a URL')
    .notEmpty()
    .run(req);
  await body('url', 'Provide a valid URL')
    .isURL()
    .run(req);
  await body('atlasName', 'Provide an atlasName')
    .notEmpty()
    .run(req);
  await body('atlasName', 'Provide an alphanumeric atlasName')
    .isAlphanumeric()
    .run(req);
  await body('atlasProject', 'Provide an atlasProject')
    .notEmpty()
    .run(req);
  await body('atlasProject', 'Provide an alphanumeric atlasProject')
    .isAlphanumeric()
    .run(req);
  await body('atlasLabelSet', 'Provide an atlasLabelSet')
    .notEmpty()
    .run(req);
  await body('token', 'Provide an upload token')
    .notEmpty()
    .run(req);

  /*
        Check for all these required fields:
        url: url
        atlas: a file
        atlasName: Alphanumeric string
        atlasProject: Alphanumeric string
        atlasLabelSet: One of the labels available inside the /public/labels/ directory
    */

  const errors = validationResult(req).array();
  if (errors.length) {
    return res.status(403).send(errors)
      .end();
  }

  return next();

};

// eslint-disable-next-line max-statements
const otherValidations = async function (req, res, next) {

  const { token } = req.body;
  const obj = await req.db.get('log').findOne({ 'token': token })
    .catch(function (err) {
      console.log('ERROR:', err);
      res.status(403).send()
        .end();
    });
  if (obj) {
    // Check token expiry date
    const now = new Date();
    if (obj.expiryDate.getTime() > now.getTime()) {
      const json = await req.db.get('mri').findOne({ source: req.body.url, backup: { $exists: false } });
      if (json && req.files.length > 0) {
        req.atlasUpload = {
          mri: json,
          username: obj.username
        };
        next();

        return;
      }
      const err = [];
      if (req.files.length === 0 || !req.files) { err.push({ error: 'there is no File' }); }
      if (!json) { err.push({ error: 'Unkown URL' }); }
      console.log('err', err);

      return res.status(403).json(err)
        .end();
    }

    return res.status(403).send('ERROR: Token expired')
      .end();
  }

  return res.status(403).send('ERROR: Cannot find token')
    .end();
};

// eslint-disable-next-line max-statements
const upload = async function (req, res) {
  const { username } = req.atlasUpload;
  const { url, atlasName, atlasProject, atlasLabelSet } = req.body;
  const { mri } = req.atlasUpload;
  const { files } = req;

  delete mri._id;

  console.log('Everything is in order');
  console.log('username:', username);
  console.log('url:', url);
  console.log('mri:', mri);
  console.log('atlasName:', atlasName);
  console.log('atlasProject:', atlasProject);
  console.log('atlasLabelSet:', atlasLabelSet);
  console.log('files:', files);

  // create final filename
  let ext;

  if ((/.nii.gz$/).test(files[0].originalname)) {
    ext = '.nii.gz';
  } else if ((/.mgz$/).test(files[0].originalname)) {
    ext = '.mgz';
  } else {
    return res.status(400).json({ error: 'Atlas encoding neither .nii.gz nor .mgz' })
      .end();
  }

  const filename = Math.random().toString(36)
    .slice(2) + ext;

  // check if directory exists (it may not exist if a volume annotation is being uploaded
  // for an mri that has only a db entry but has not yet been accessed)
  const dir = req.dirname + '/public' + mri.url;
  // eslint-disable-next-line no-sync
  if (!(fs.existsSync(dir))) {
    // directory does not exist, create it
    console.log('> mri directory did not exist, create it');
    await fs.promises.mkdir(dir, '0777');
  }

  // move tmp atlas file to final location
  const path = dir + filename;
  try {
    await fs.promises.rename(req.dirname + '/' + files[0].path, path);
  } catch (err) {
    console.log('ERROR rename failed:', err);

    return res.status(400).json({ error: 'cannot upload volume annotation' })
      .end();
  }

  // Check that the dimensions of the atlas are the same as its parent mri
  console.log('> load parent mri');
  const atlas = await amri.loadMRI(path)
    .catch(function (err) {
      console.log('ERROR: mri file is not valid: ', err);

      return res.status(400).json({ error: 'mri file is not valid: ' + err })
        .end();
    });
  console.log('atlas.dim: ', atlas.dim);
  console.log('mri.dim: ', mri.dim);

  /**
         * @todo How do we check for volume dimensions now?
         */

  /*
        // check volume dimensions
        if (atlas.dim[0] != mri.dim[0] ||
            atlas.dim[1] != mri.dim[1] ||
            atlas.dim[2] != mri.dim[2]) {
            return res.status(400).json({error:"the Atlas doesn't match with the mri"}).end();
        }
        */

  // create the atlas object
  const date = new Date();
  const atlasMetadata = {
    name: atlasName,
    project: atlasProject,
    access: 'edit',
    created: date.toJSON(),
    modified: date.toJSON(),
    filename: filename, // automatically generated filename
    originalname: files[0].originalname,
    labels: atlasLabelSet,
    owner: username,
    type: 'volume'
  };

  console.log('final volume annotation entry:');
  console.log('atlasMetadata:', atlasMetadata);

  // remove previous atlases with the same atlasName and atlasProject
  let i;
  for (i = mri.mri.atlas.length - 1; i >= 0; i--) {
    if (mri.mri.atlas[i].name === atlasName && mri.mri.atlas[i].project === atlasProject) {
      mri.mri.atlas.splice(i, 1);
    }
  }

  await lock.acquire('mri', async function () {
    // update the database
    mri.mri.atlas.push(atlasMetadata);
    // mark previous version as backup
    await req.db.get('mri').update({ source: req.body.url, backup: { $exists: false } }, { $set: { backup: true } }, { multi: true });
    // insert new version
    await req.db.get('mri').insert(mri);

    // return the full mri object ???
    res.status(200).json(mri)
      .end();
  });
};

/** 'token' was used by the /mri/upload route, which is now
 * replaced by /token.
 * @deprecated since version 2.0
 */

const token = (req, res) => {
  res.send('This route is deprecated. Please use /token instead');
};

const UploadController = function () {
  this.validator = validator;
  this.otherValidations = otherValidations;
  this.upload = upload;
  this.token = token;
};

module.exports = new UploadController();

