/* eslint-disable max-lines */
'use strict';

const crypto = require('crypto');
const url = require('url');
const fs = require('fs');
const request = require('request');
const sanitize = require('sanitize-filename');
const { body, validationResult } = require('express-validator');
const AtlasmakerServer = require('../atlasmakerServer/atlasmakerServer');
const dataSlices = require('../dataSlices/dataSlices.js');
const { AccessType, AccessLevel } = require('neuroweblab');
const BrainboxAccessControlService = require('../../services/BrainboxAccessControlService');
const EmbedAccessService = require('../../services/EmbedAccessService');
const { projectsForMetadata, mayChangeMri } = require('../atlasmakerServer/metadata-save-access');
const { getRelatedProjects, filterMriForUser, isFilePubliclyVisible, hasCustomFileViewAccess, mayViewMriFiles, mayEmbedMri, privateMriError } = require('./mri-access');
const { jsonForScript } = require('../utils/jsonForScript');
const _ = require('lodash');
const AsyncLock = require('async-lock');
const lock = new AsyncLock();

const downloadQueue = {};
let atlasmakerServer;

// ExpressValidator = require('express-validator')

// eslint-disable-next-line max-statements
const validator = function (req, res, next) {
  console.log('Query validator');
  console.log('body:', req.body);
  console.log('query:', req.query);

  let myurl;
  if (typeof req.body.url !== 'undefined') {
    myurl = req.body.url;
  } else if (typeof req.query.url !== 'undefined') {
    myurl = req.query.url;
  }

  console.log('validator: myurl', myurl);

  // url is optional (apiMriGet serves a paginated list when url is absent),
  // but if provided it must be a valid URL
  if (typeof myurl !== 'undefined') {
    try {
      const _url = new URL(myurl); // eslint-disable-line no-unused-vars
    } catch (_err) {
      return res
        .status(403)
        .json({ error: 'Invalid URL' })
        .end();
    }
  }

  return next();
};

const validatorPost = async function (req, res, next) {

  console.log('mri body', req.body);
  console.log('mri query', req.query);
  console.log('mri params', req.params);

  await body('url', 'Provide a URL')
    .notEmpty()
    .run(req);
  await body('url', 'Provide a valid URL')
    .isURL()
    .run(req);

  // req.checkQuery('var', 'please enter one of the variables that are indicated')
  // .optional()
  // .matches("localpath|filename|source|url|dim|pixdim");    // @todo: decent regexp
  const errors = validationResult(req).array();
  if (errors.length) {
    console.log('mri send error 403');

    return res.status(403).send(errors)
      .end();
  }

  return next();
};

// does not seem to be used
// const isIterable = function (obj) {
//   // checks for null and undefined
//   if (obj === null) {
//     return false;
//   }

//   return typeof obj[Symbol.iterator] === 'function';
// };

/* Download MRI file
--------------------- */
// @todo Change this function callback into a promise
// eslint-disable-next-line max-statements
const downloadMRI = async function (myurl, req) {
  console.log('downloadMRI');
  const hash = crypto
    .createHash('md5')
    .update(myurl)
    .digest('hex');

  const mridb = await req.nativeDb.collection('mri').findOne({ source: myurl, backup: { $exists: false } });
  delete mridb?._id;
  console.log('mridb:', mridb);
  let filename;
  if (!mridb?.filename) {
    filename = sanitize(url.parse(myurl).pathname.split('/').pop());
  } else {
    ({ filename } = mridb);
  }
  let dest = req.dirname + '/public/data/' + hash + '/' + filename;
  console.log('   source:', myurl);
  console.log('     hash:', hash);
  console.log(' filename:', filename);
  console.log('     dest:', dest);

  // eslint-disable-next-line no-sync
  if (!fs.existsSync(req.dirname + '/public/data/' + hash)) {
    // eslint-disable-next-line no-sync
    fs.mkdirSync(req.dirname + '/public/data/' + hash, '0777');
  }
  let len, newDest, newFilename;
  let cur = 0;

  return new Promise(function (resolve, reject) {
    let aborted = false;
    const req_ = request({
      uri: myurl,
      followAllRedirects: true,
      rejectUnauthorized: false,
      headers: { 'User-Agent': 'BrainBox/1.0 (https://brainbox.pasteur.fr)' }
    });
    req_
      .on('error', (err) => {
        if (aborted) { return; }
        console.log('ERROR in downloadMRI', err);
        reject(err);
      })
      // eslint-disable-next-line max-statements
      .on('response', (res) => {
        // Check for HTTP errors before saving to disk
        if (res.statusCode < 200 || res.statusCode >= 300) {
          aborted = true;
          req_.abort();
          reject(new Error(`Remote server returned HTTP ${res.statusCode} for ${myurl}`));

          return;
        }

        const contentType = res.headers['content-type'] || '';
        if (contentType.includes('text/html')) {
          aborted = true;
          req_.abort();
          const err = new Error(`Remote server returned HTML instead of a binary file for ${myurl} (possible rate limit or access restriction)`);
          err.clientDownloadRequired = true;
          reject(err);

          return;
        }

        const contentDisp = res.headers['content-disposition'];
        if (contentDisp && (/^attachment/).test(contentDisp)) {
          newFilename = sanitize(contentDisp.split('filename=')[1].split(';')[0].replace(/"/g, ''));
        } else {
          newFilename = filename;
        }
        console.log('filename:', newFilename);
        const arr = dest.split('/');
        arr.pop();
        arr.push(newFilename);
        newDest = arr.join('/');
        console.log('new dest:', newDest);
        len = parseInt(res.headers['content-length'], 10);
        console.log('file length:', len);
      })
      .on('data', (chunk) => {
        cur += chunk.length;
        console.log('downloaded:', cur, '/', len, newFilename);
        downloadQueue[myurl].cur = cur;
        downloadQueue[myurl].len = len;
      })
      .pipe(fs.createWriteStream(dest))
      .on('close', () => {
        if (aborted) { return; }
        console.log('new:', newFilename, newDest);
        // eslint-disable-next-line no-sync
        fs.renameSync(dest, newDest);
        filename = newFilename;
        dest = newDest;

        // NOTE: getBrainAtPath has to be called with a client-side path like "/data/[md5hash]/..."
        atlasmakerServer.getBrainAtPath('/data/' + hash + '/' + filename)
          .then((mri) => {
            // Create json file for new dataset
            let ip = '';
            if (typeof req.headers['x-forwarded-for'] !== 'undefined') {
              ip = req.headers['x-forwarded-for'];
            } else if (req.connection.remoteAddress !== 'undefined') {
              ip = req.connection.remoteAddress;
            } else if (req.socket.remoteAddress !== 'undefined') {
              ip = req.socket.remoteAddress;
            } else if (req.connection.socket.remoteAddress !== 'undefined') {
              ip = req.connection.socket.remoteAddress;
            }

            let username;
            if (req.isAuthenticated()) {
              ({ username } = req.user);
            } else {
              username = ip;
            }

            let json = mridb;
            if (!json) {
              // Create new json object if it doesn't already exist
              json = {
                source: myurl,
                name: '',
                url: '/data/' + hash + '/',
                included: (new Date()).toJSON(),
                owner: username,
                mri: {
                  atlas: [
                    {
                      created: (new Date()).toJSON(),
                      modified: (new Date()).toJSON(),
                      access: 'edit',
                      type: 'volume',
                      name: 'Default',
                      filename: 'Atlas.nii.gz',
                      labels: 'foreground.json'
                    }
                  ]
                }
              };
            }
            // Add MRI information
            Object.assign(json, {
              filename,
              success: true,
              dim: mri.dim,
              pixdim: mri.pixdim,
              voxel2world: mri.v2w,
              worldOrigin: mri.wori,
              modified: (new Date()).toJSON(),
              modifiedBy: username
            });
            resolve(json);
          })
          .catch((err) => {
            console.log('ERROR Cannot get brain at path /data/' + hash + '/' + filename + ': ', err);
            reject(err);
          });
      });
  });
};

// eslint-disable-next-line max-statements
const mri = async function (req, res) {
  const login = (req.isAuthenticated()) ?
    ('<a href=\'/user/' + req.user.username + '\'>' + req.user.username + '</a> (<a href=\'/logout\'>Log Out</a>)') :
    ('<a href=\'/auth/github\'>Log in with GitHub</a>');
  const loggedUser = req.isAuthenticated() ? req.user.username : 'anonymous';
  req.session.returnTo = req.originalUrl; // Store return path in case of login

  const myurl = req.query.url;
  // const hash = crypto.createHash('md5').update(myurl).digest('hex');
  // console.log('Receive GET, query:', myurl, hash);

  const json = await req.nativeDb.collection('mri').findOne({ source: myurl, backup: { $exists: false } }, { projection: { _id: 0 } })
    .catch((err) => {
      console.log('err 241:', err);
    });
  const projects = await getRelatedProjects(req.nativeDb, json || null, myurl);

  // An MRI whose files the user cannot see is refused, as /mri/json does
  // (also one that has no document yet, but that projects list)
  if (!mayViewMriFiles(myurl, projects, loggedUser, json)) {
    console.log(`REJECTED GET /mri of ${myurl} by ${loggedUser}: may not see its files`);
    res.status(403).render('askForLogin', {
      title: 'BrainBox: private brain',
      message: 'This brain is private',
      askToLogIn: loggedUser === 'anonymous',
      login
    });

    return;
  }

  if (!json) {
    const obj = {
      source: myurl
    };
    res.render('mri', {
      title: obj.name || 'BrainBox',
      params: jsonForScript(req.query),
      mriInfo: jsonForScript(obj),
      login
    });
  } else {
    // If the json object exists, and has annotations, configure the access to them
    if (json.mri && !json.mri.atlas) {
      json.mri.atlas = [];
    }

    // set access to volume annotations
    BrainboxAccessControlService.setVolumeAnnotationsAccessByProjects(json, projects, loggedUser);
    // BrainboxAccessControlService.setTextAnnotationsAccessByProjects(json, projects, loggedUser)

    const isPubliclyVisible = isFilePubliclyVisible(projects);
    const hasCustomViewAccess = hasCustomFileViewAccess(json, projects, loggedUser);

    // Send data
    res.render('mri', {
      title: json.name || 'BrainBox',
      params: jsonForScript(req.query),
      mriInfo: jsonForScript(json),
      hasPrivilegedAccess: !isPubliclyVisible && hasCustomViewAccess,
      login
    });
  }
};

// Query parameters the embed viewer understands, and the only ones reflected
// back into the rendered page.
const EMBED_QUERY_PARAMS = ['url', 'view', 'slice', 'project', 'annotation', 'embedToken', 'maxHeight', 'brainboxLink'];

/**
 * @function mriEmbed
 * @desc Serves the chromeless, read-only viewer used to embed a single brain
 *       into an external page (e.g. via an <iframe>). Like `mri`, this
 *       route denies access (403) when the caller lacks file-level view
 *       access; unlike it, it also refuses an MRI that no project lists.
 * @param {Object} req Express request
 * @param {Object} res Express response
 * @returns {void}
 */
// eslint-disable-next-line max-statements
const mriEmbed = async function (req, res) {
  const loggedUser = req.isAuthenticated() ? req.user.username : 'anonymous';
  const myurl = req.query.url;

  // This route exists to be framed by other sites: say so explicitly rather
  // than relying on the absence of an X-Frame-Options header elsewhere.
  res.set('Content-Security-Policy', 'frame-ancestors *');

  if (!myurl) {
    res.status(400);
    res.render('embedError', { message: 'No brain was requested.' });

    return;
  }

  const json = await req.nativeDb.collection('mri').findOne({ source: myurl, backup: { $exists: false } }, { projection: { _id: 0 } })
    .catch((err) => {
      console.log('ERROR mriEmbed:', err);
    });

  if (!json) {
    res.status(404);
    res.render('embedError', { message: 'This brain could not be found.' });

    return;
  }

  if (json.mri && !json.mri.atlas) {
    json.mri.atlas = [];
  }

  const projects = await getRelatedProjects(req.nativeDb, json, myurl);

  if (!mayEmbedMri(json, projects, loggedUser)) {
    res.status(403);
    res.render('embedError', { message: 'This content is private.' });

    return;
  }

  BrainboxAccessControlService.setVolumeAnnotationsAccessByProjects(json, projects, loggedUser);

  const embedWsTicket = await EmbedAccessService.mintWsTicket(req.nativeDb, {
    dirname: json.url,
    mriSource: myurl,
    username: req.isAuthenticated() ? req.user.username : null
  });

  res.render('mriEmbed', {
    title: json.name || 'BrainBox',
    // Only the parameters the embed actually reads are reflected back into the
    // page - there is no reason to echo arbitrary attacker-chosen query keys.
    params: jsonForScript(_.pick(req.query, EMBED_QUERY_PARAMS)),
    mriInfo: jsonForScript(json),
    embedWsTicket: jsonForScript(embedWsTicket)
  });
};

/**
 * @function mriRender3D
 * @desc Serves the chromeless 3D rendering of one annotation. Loaded in an
 *       iframe filling the embed's viewer area (and usable standalone), so the
 *       renderer - which owns its whole document - needs no changes to be
 *       hosted inside another view. Gated by the same file-level access check
 *       as `mriEmbed`: a private brain must not be renderable in 3D either.
 * @param {Object} req Express request
 * @param {Object} res Express response
 * @returns {void}
 */
// eslint-disable-next-line max-statements
const mriRender3D = async function (req, res) {
  const loggedUser = req.isAuthenticated() ? req.user.username : 'anonymous';
  const myurl = req.query.url;

  res.set('Content-Security-Policy', 'frame-ancestors *');

  if (!myurl) {
    res.status(400);
    res.render('embedError', { message: 'No brain was requested.' });

    return;
  }

  const json = await req.nativeDb.collection('mri').findOne({ source: myurl, backup: { $exists: false } }, { projection: { _id: 0 } })
    .catch((err) => {
      console.log('ERROR mriRender3D:', err);
    });

  if (!json) {
    res.status(404);
    res.render('embedError', { message: 'This brain could not be found.' });

    return;
  }

  if (json.mri && !json.mri.atlas) {
    json.mri.atlas = [];
  }

  const projects = await getRelatedProjects(req.nativeDb, json, myurl);

  if (!mayEmbedMri(json, projects, loggedUser)) {
    res.status(403);
    res.render('embedError', { message: 'This content is private.' });

    return;
  }

  BrainboxAccessControlService.setVolumeAnnotationsAccessByProjects(json, projects, loggedUser);

  // Resolve the annotation against the ones this viewer is actually allowed to
  // see, so a filename cannot be used to reach a layer access control hid.
  const visible = json.mri.atlas.filter((a) => a.access !== 'none');
  const requested = visible.find((a) => a.filename === req.query.atlas);
  const atlas = requested || visible[0];

  if (!atlas) {
    res.status(404);
    res.render('embedError', { message: 'This brain has no annotation to render.' });

    return;
  }

  res.render('mriRender3D', {
    title: json.name || 'BrainBox',
    path: jsonForScript(json.url + atlas.filename)
  });
};

/**
 * @function apiMriLayers
 * @desc Lightweight endpoint an embedding page can query to discover which
 *       annotation layers are available for a given brain, before deciding
 *       what to embed. Unlike `apiMriGet`, this gates on file-level view
 *       access before returning anything.
 * @param {Object} req Express request
 * @param {Object} res Express response
 * @returns {void}
 */
// eslint-disable-next-line max-statements
const apiMriLayers = async function (req, res) {
  const loggedUser = req.isAuthenticated() ? req.user.username : 'anonymous';
  const myurl = req.query.url;

  if (!myurl) {
    res.status(400).json({ error: 'Provide a url' });

    return;
  }

  const json = await req.nativeDb.collection('mri').findOne({ source: myurl, backup: { $exists: false } }, { projection: { _id: 0 } })
    .catch((err) => {
      console.log('ERROR apiMriLayers:', err);
    });

  if (!json) {
    res.status(404).json({ error: 'Not found' });

    return;
  }

  if (json.mri && !json.mri.atlas) {
    json.mri.atlas = [];
  }

  const projects = await getRelatedProjects(req.nativeDb, json, myurl);

  if (!mayEmbedMri(json, projects, loggedUser)) {
    res.status(403).json({ error: 'Access denied' });

    return;
  }

  BrainboxAccessControlService.setVolumeAnnotationsAccessByProjects(json, projects, loggedUser);

  const layers = json.mri.atlas.map((a) => ({ project: a.project, name: a.name, access: a.access }));

  res.json({ layers });
};

/**
 * Whether the server has the image of an MRI: its file, and its dimensions
 * (otherwise POST /mri/json downloads it)
 * @param {Object} req Express request
 * @param {Object} json The stored MRI document
 * @param {string} myurl The MRI's source URL
 * @returns {boolean} True if it has
 */
const hasMriImage = function (req, json, myurl) {
  const hash = crypto.createHash('md5').update(myurl)
    .digest('hex');
  const filename = json.filename || url.parse(myurl).pathname.split('/').pop();
  const filepath = req.dirname + '/public/data/' + hash + '/' + sanitize(filename);

  // eslint-disable-next-line no-sync
  return fs.existsSync(filepath) && Boolean(json.dim);
};

const removeVariablesFromURL = function (myurl) {
  return myurl.split('&')[0];
};

// eslint-disable-next-line max-statements
const apiMriPost = async function (req, res) {
  console.log('apiMriPost');

  let myurl;
  if (typeof req.body.url !== 'undefined') {
    myurl = req.body.url;
  } else if (typeof req.query.url !== 'undefined') {
    myurl = req.query.url;
  }

  try {
    // eslint-disable-next-line no-new
    new URL(myurl);
  } catch (err) {
    res.send('Invalid URL!');

    return;
  }


  myurl = removeVariablesFromURL(myurl);
  console.log('url:', myurl);

  // It's fine to post(/mri/json) without being authenticated
  // if (!req.isAuthenticated()) {
  //     return res.status(403).send({error: "Provide authentication"}).end();
  // }

  let json = await req.nativeDb.collection('mri').findOne({ source: myurl, backup: { $exists: false }, success: { $exists: true } }, { projection: { _id: 0 } })
    .catch((err) => {
      console.log('ERROR:', err);
      res.json({ success: false });
    });
  if (res.headersSent) {
    return;
  }

  // An MRI whose files the user cannot see is refused, as /mri/embed does
  // (also before it is downloaded: a project may list it before it has a document)
  const loggedUser = req.isAuthenticated() ? req.user.username : 'anonymous';
  if (!mayViewMriFiles(myurl, await getRelatedProjects(req.nativeDb, json, myurl), loggedUser, json)) {
    console.log(`REJECTED POST /mri/json of ${myurl} by ${loggedUser}: may not see its files`);
    res.status(403).json(privateMriError(loggedUser));

    return;
  }

  // Determine whether we need to download the data from the source
  let doDownload = false;

  // Check if client is requesting for a specific variable
  const doReturnAll = (typeof req.body.var === 'undefined');

  // Asking for a single variable does not trigger a download in case
  // the file is not already present.
  if (doReturnAll) {
    if (!json) {
      // If the json object is empty, request download
      console.log('No DB entry for MRI: download');
      doDownload = true;
    } else if (!hasMriImage(req, json, myurl)) {
      // If the json object exists, but there's no file, or no .dim object, download
      console.log('No MRI file in server: download');
      doDownload = true;
    }
  }

  if (doDownload === true) {
    const isInQueue = (myurl in downloadQueue);
    if (isInQueue) {
      console.log('>> Download queued, check status', downloadQueue[myurl], myurl);
      const { success } = downloadQueue[myurl];
      // if (success === true) {
      //     console.log('>> Finished. Send result to user');
      //     const info = JSON.parse(JSON.stringify(downloadQueue[myurl]));
      //     console.log("before delete", downloadQueue);
      //     delete downloadQueue[myurl];
      //     console.log("after delete". downloadQueue);
      //     res.json(info);
      // } else
      if (success === 'downloading') {
        console.log('>> Still downloading. Wait');
        res.json(downloadQueue[myurl]);
      } else {
        console.log('>> Failed. Clearing queue entry so download can be retried');
        const error = downloadQueue[myurl];
        delete downloadQueue[myurl];
        res.status(403).json(error);
      }
    } else {
      console.log('Start download:');
      downloadQueue[myurl] = { success: 'downloading', cur: 0, len: 1 };
      downloadMRI(myurl, req).then((obj) => {
        console.log('downloadMRI obj:', obj);
        console.log('Download succeeded. Insert in DB, remove from queue');
        obj.success = true;

        return lock.acquire('mri', async function () {
          await req.nativeDb.collection('mri').updateMany({ source: myurl }, { $set: { backup: true } });
          await req.nativeDb.collection('mri').insertOne(obj);
        });
      })
        .then(() => {
          // downloadQueue[myurl] = obj;
          delete downloadQueue[myurl];
        })
        .catch((err) => {
          console.log('Download failed:', err);
          const entry = { success: false, error: err.message || String(err) };
          if (err.clientDownloadRequired) { entry.clientDownloadRequired = true; }
          downloadQueue[myurl] = entry;
        });

      res.json(downloadQueue[myurl]);
    }
  } else {
    if (!json) {
      res.status(404).json({ error: 'Not found' });

      return;
    }
    // what the user cannot see is left out, also of a single variable
    await filterMriForUser(req.nativeDb, json, myurl, loggedUser);

    // Return a specific variable, or the complete json object
    if (doReturnAll === false) {
      console.log('Send only the requested variable to the client.');
      const arr = req.body.var.split('/');
      for (const v of arr) {
        json = json[v];
      }
    }
    res.json(json);
  }
};

// eslint-disable-next-line max-statements, complexity
const apiMriGet = async function (req, res) {
  const myurl = req.query.url;
  let { download,
    page,
    backups
  } = req.query;
  download = (download === 'true');
  backups = (backups === 'true');

  // check for token authentication
  let loggedUser = 'anonymous';
  if (req.isAuthenticated()) {
    loggedUser = req.user.username;
  }

  // if the query does not contain a specific mri, send a paginated list of mris
  if (!myurl) {
    if (typeof page === 'undefined') {
      res.send({ error: 'Provide the parameter \'page\'' });

      return;
    }

    // Display access-filtered list of mris
    page = Math.max(0, parseInt(page, 10));
    const nItemsPerPage = 20;

    const values = await dataSlices.getFilesSlice(req, page * nItemsPerPage, nItemsPerPage);
    res.json(values);

    return;
  }

  try {
    // eslint-disable-next-line no-new
    new URL(myurl);
  } catch (err) {
    res.send('Invalid Url!');

    return;
  }

  const json = await req.nativeDb.collection('mri').findOne({ source: myurl, backup: { $exists: backups } }, { projection: { _id: 0 } })
    .catch((err) => {
      console.log('err:', err);
    });
  if (!json) {
    console.log('MRI not present in DB');
    if (download === true) {
      console.log('trigger download');
      res.json({ source: myurl });
    } else {
      console.log('send 404 error');
      res.status(404).json({});
    }
  } else {
    // An MRI whose files the user cannot see is refused, as /mri/embed does
    if (!mayViewMriFiles(myurl, await getRelatedProjects(req.nativeDb, json, myurl), loggedUser, json)) {
      console.log(`REJECTED GET /mri/json of ${myurl} by ${loggedUser}: may not see its files`);
      res.status(403).json(privateMriError(loggedUser));

      return;
    }
    // If the json object exists, and has annotations, configure the access to them
    console.log('check access rights');
    if (json.mri && !json.mri.atlas) {
      json.mri.atlas = [];
    }
    let i, j;
    const prj = new Set();
    let arr = [];
    // Check access to volume annotations
    for (i = 0; i < json.mri.atlas.length; i++) {
      if (json.mri.atlas[i].project) {
        console.log('mri is in project', json.mri.atlas[i].project);
        prj.add(json.mri.atlas[i].project);
      }
    }
    // Check access to text annotations
    if (typeof json.mri.annotations !== 'undefined') {
      for (const key of Object.keys(json.mri.annotations)) {
        console.log('text annotation is in project', key);
        prj.add(key);
      }
    }
    arr = [...prj].map(async (o) => {
      const obj = await req.nativeDb.collection('project').findOne({
        shortname: o,
        backup: { $exists: false }
      });

      return obj;
    });

    const projects = await Promise.all([...arr])
      .catch((err) => {
        console.log('ERROR Cannot get db information:', err);
      });
    console.log('projects', projects);
    // Set access to volume annotations
    for (i = json.mri.atlas.length - 1; i >= 0; i--) {
      for (j = 0; j < projects.length; j++) {
        if (projects[j] && projects[j].shortname === json.mri.atlas[i].project) {
          const access = BrainboxAccessControlService.getUserOrPublicAccessLevel(projects[j], loggedUser, AccessType.ANNOTATIONS);
          console.log('loggedUser,access:', loggedUser, access.toString());
          // eslint-disable-next-line max-depth
          if (access.isEqualTo(AccessLevel.NONE)) {
            json.mri.atlas.splice(i, 1);
          }
          break;
        }
      }
    }
    // Set access to text annotations
    if (typeof json.mri.annotations !== 'undefined') {
      for (const key of Object.keys(json.mri.annotations)) {
        for (j = 0; j < projects.length; j++) {
          // eslint-disable-next-line max-depth
          if (projects[j] && projects[j].shortname === key) {
            const access = BrainboxAccessControlService.getUserOrPublicAccessLevel(projects[j], loggedUser, AccessType.ANNOTATIONS);
            console.log('loggedUser,access,level:', loggedUser, access.toString());
            // eslint-disable-next-line max-depth
            if (access.isEqualTo(AccessLevel.NONE)) {
              delete json.mri.annotations[key];
            }
          }
        }
      }
    }
    // Send data
    res.json(json);
  }
};

// eslint-disable-next-line func-style
const reset = async function reset(req, res) {
  const myurl = req.query.url;
  const hash = crypto.createHash('md5').update(myurl)
    .digest('hex');

  const mridb = await req.nativeDb.collection('mri').findOne({ source: myurl, backup: { $exists: false } })
    .catch((err) => {
      console.log('ERROR:', err);
      res
        .status(403)
        .send(err)
        .end();
    });
  console.log(mridb);
  let filename;
  if (mridb) { ({ filename } = mridb); }
  const mrires = await atlasmakerServer.getBrainAtPath('/data/' + hash + '/' + filename)
    .catch((err) => {
      console.log('ERROR:', err);
      res
        .status(403)
        .send(err)
        .end();
    });
  await req.nativeDb.collection('mri').updateOne({ source: myurl, backup: { $exists: false } }, {
    $set: {
      dim: mrires.dim,
      pixdim: mrires.pixdim,
      voxel2world: mrires.v2w,
      worldOrigin: mrires.wori
    }
  })
    .catch((err) => {
      console.log('ERROR:', err);
      res
        .status(403)
        .send(err)
        .end();
    });
  res.send({
    dim: mrires.dim,
    pixdim: mrires.pixdim,
    voxel2world: mrires.v2w,
    worldOrigin: mrires.wori
  });
};

/**
 * @function apiMriUploadFromURL
 * @desc Receives an MRI file uploaded by the client (for sources that block
 *       server-side downloads, e.g. behind WAF/bot-challenge). The client
 *       downloads the file in the browser and relays it here.
 * @param {Object} req Express request. req.body.url is the source URL,
 *        req.file is the multer-uploaded file.
 * @param {Object} res Express response
 */
// eslint-disable-next-line max-statements
const apiMriUploadFromURL = async function (req, res) {
  const myurl = req.body.url;
  if (!myurl || !req.file) {
    res.status(400).json({ success: false, error: 'Provide url and file' });

    return;
  }

  try {
    // eslint-disable-next-line no-new
    new URL(myurl);
  } catch (_err) {
    res.status(400).json({ success: false, error: 'Invalid URL' });

    return;
  }

  // Anyone may give an MRI its image the first time (the server could not
  // download it), but only its owner, or a user who may edit the files of a
  // project that lists it, may replace an image the server has
  let json = await req.nativeDb.collection('mri').findOne({ source: myurl, backup: { $exists: false } }, { projection: { _id: 0 } });
  if (json && hasMriImage(req, json, myurl)) {
    const username = req.isAuthenticated() ? req.user.username : null;
    const projects = username ? await projectsForMetadata(req.nativeDb, myurl, [json]) : new Map();
    if (!mayChangeMri({ stored: json, username, projects })) {
      console.log(`REJECTED upload-from-url of ${myurl} by ${username || 'anonymous'}: the MRI already has its image`);
      await fs.promises.rm(req.file.path, { force: true });
      res.status(username ? 403 : 401).json({
        success: false,
        error: username ? 'You may not replace the image of this MRI' : 'Log in to replace the image of this MRI'
      });

      return;
    }
  }

  const hash = crypto.createHash('md5').update(myurl)
    .digest('hex');
  const filename = sanitize(url.parse(myurl).pathname.split('/').pop());
  const destDir = req.dirname + '/public/data/' + hash;
  const dest = destDir + '/' + filename;

  // eslint-disable-next-line no-sync
  if (!fs.existsSync(destDir)) {
    // eslint-disable-next-line no-sync
    fs.mkdirSync(destDir, '0777');
  }

  // Move uploaded temp file to final destination
  // eslint-disable-next-line no-sync
  fs.renameSync(req.file.path, dest);

  try {
    const mriData = await atlasmakerServer.getBrainAtPath('/data/' + hash + '/' + filename);

    let ip = '';
    if (typeof req.headers['x-forwarded-for'] !== 'undefined') {
      ip = req.headers['x-forwarded-for'];
    } else if (req.connection.remoteAddress !== 'undefined') {
      ip = req.connection.remoteAddress;
    }

    let username;
    if (req.isAuthenticated()) {
      ({ username } = req.user);
    } else {
      username = ip;
    }

    if (!json) {
      json = {
        source: myurl,
        name: '',
        url: '/data/' + hash + '/',
        included: (new Date()).toJSON(),
        owner: username,
        mri: {
          atlas: [
            {
              created: (new Date()).toJSON(),
              modified: (new Date()).toJSON(),
              access: 'edit',
              type: 'volume',
              name: 'Default',
              filename: 'Atlas.nii.gz',
              labels: 'foreground.json'
            }
          ]
        }
      };
    }

    Object.assign(json, {
      filename,
      success: true,
      dim: mriData.dim,
      pixdim: mriData.pixdim,
      voxel2world: mriData.v2w,
      worldOrigin: mriData.wori,
      modified: (new Date()).toJSON(),
      modifiedBy: username
    });

    await lock.acquire('mri', async function () {
      await req.nativeDb.collection('mri').updateMany({ source: myurl }, { $set: { backup: true } });
      await req.nativeDb.collection('mri').insertOne(json);
    });

    delete json._id;
    res.json(json);
  } catch (err) {
    console.log('ERROR processing client-uploaded MRI:', err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
};

const MriController = function (db, nativeDb) {
  this.validator = validator;
  this.validatorPost = validatorPost;
  this.apiMriGet = apiMriGet;
  this.apiMriPost = apiMriPost;
  this.apiMriUploadFromURL = apiMriUploadFromURL;
  this.mri = mri;
  this.mriEmbed = mriEmbed;
  this.mriRender3D = mriRender3D;
  this.apiMriLayers = apiMriLayers;
  this.reset = reset;
  atlasmakerServer = new AtlasmakerServer(db, nativeDb);
};

module.exports = MriController;
