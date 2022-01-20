'use strict';

const crypto = require('crypto');
const url = require('url');
const fs = require('fs');
const request = require('request');
const sanitize = require("sanitize-filename");
const atlasmakerServer = require('../atlasmakerServer/atlasmakerServer');
const checkAccess = require('../checkAccess/checkAccess.js');
const dataSlices = require('../dataSlices/dataSlices.js');

const downloadQueue = {};

// ExpressValidator = require('express-validator')

// eslint-disable-next-line max-statements
const validator = function (req, res, next) {
  console.log('Query validator');
  console.log('body:', req.body);
  console.log('query:', req.query);

  let myurl;
  if (typeof req.body.url !== "undefined") {
    myurl = req.body.url;
  } else if (typeof req.query.url !== "undefined") {
    myurl = req.query.url;
  }

  console.log("validator: myurl", myurl);
  if (typeof myurl !== "undefined") {
    console.log("next");

    return next();
  }

  // req.check('url', 'please enter a valid URL').isURL();

  // req.checkQuery('var', 'please enter one of the variables that are indicated')
  // .optional()
  // .matches("localpath|filename|source|url|dim|pixdim");    // todo: decent regexp
  const errors = req.validationErrors();
  console.log('errors:', errors);
  if (errors) {
    res
      .status(403)
      .send(errors)
      .end();
  } else {
    return next();
  }
};

const validatorPost = function (req, res, next) {

  console.log("mri body", req.body);
  console.log("mri query", req.query);
  console.log("mri params", req.params);

  req.checkBody('url', 'Provide a URL')
    .notEmpty();
  req.checkBody('url', 'Provide a valid URL')
    .isURL();

  // req.checkQuery('var', 'please enter one of the variables that are indicated')
  // .optional()
  // .matches("localpath|filename|source|url|dim|pixdim");    // @todo: decent regexp
  const errors = req.validationErrors();
  if (errors) {
    console.log("mri send error 403");
    res.status(403).send(errors)
      .end();
  } else {
    return next();
  }
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
const downloadMRI = async function(myurl, req) {
  console.log('downloadMRI');
  const hash = crypto
    .createHash('md5')
    .update(myurl)
    .digest('hex');

  const mridb = await req.db.get('mri').findOne({source: myurl, backup: {$exists: 0}});
  console.log('mridb:', mridb);
  let filename;
  if (!mridb || !mridb.filename) {
    filename = sanitize(url.parse(myurl).pathname.split('/').pop());
  } else {
    ({filename} = mridb);
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
    request({uri: myurl, followAllRedirects: true, rejectUnauthorized : false})
      .on('error', (err) => {
        console.log('ERROR in downloadMRI', err);
        reject(err);
      })
      .on('response', (res) => {
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
        console.log('new:', newFilename, newDest);
        // eslint-disable-next-line no-sync
        fs.renameSync(dest, newDest);
        filename = newFilename;
        dest = newDest;

        // NOTE: getBrainAtPath has to be called with a client-side path like "/data/[md5hash]/..."
        atlasmakerServer.getBrainAtPath('/data/' + hash + '/' + filename)
          .then((mri) => {
            // Create json file for new dataset
            let ip = "";
            if(typeof req.headers['x-forwarded-for'] !== "undefined") {
              ip = req.headers['x-forwarded-for'];
            } else if (req.connection.remoteAddress !== "undefined") {
              ip = req.connection.remoteAddress;
            } else if (req.socket.remoteAddress !== "undefined") {
              ip = req.socket.remoteAddress;
            } else if (req.connection.socket.remoteAddress !== "undefined") {
              ip = req.connection.socket.remoteAddress;
            }

            let username;
            if(req.isAuthenticated()) {
              ({username} = req.user);
            } else if(req.isTokenAuthenticated) {
              username = req.tokenUsername;
            } else {
              username = ip;
            }

            const json = {
              filename,
              success: true,
              source: myurl,
              url: '/data/' + hash + '/',
              included: (new Date()).toJSON(),
              dim: mri.dim,
              pixdim: mri.pixdim,
              voxel2world: mri.v2w,
              worldOrigin: mri.wori,
              owner: username,
              name: "",
              modified: (new Date()).toJSON(),
              modifiedBy: username,
              mri: {
                brain: filename,
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

  const json = await req.db.get('mri').findOne({ source: myurl, backup: { $exists: 0 } }, { _id: 0 })
    .catch((err) => {
      console.log('err 241:', err);
    });
  if (!json) {
    const obj = {
      source: myurl
    };
    res.render('mri', {
      title: obj.name || 'BrainBox',
      params: JSON.stringify(req.query),
      mriInfo: JSON.stringify(obj),
      login
    });
  } else {
    // If the json object exists, and has annotations, configure the access to them
    if (json.mri && !json.mri.atlas) {
      json.mri.atlas = [];
    }
    let i, j, k;
    const prj = new Set();
    let arr = [];
    // Check access to volume annotations
    for (i = 0; i < json.mri.atlas.length; i++) {
      if (json.mri.atlas[i].project) {
        prj.add(json.mri.atlas[i].project);
      }
    }
    // Check access to text annotations
    if (typeof json.mri.annotations !== "undefined") {
      for (const key of Object.keys(json.mri.annotations)) {
        prj.add(key);
      }
    }
    arr = [...prj].map(async (o) => {
      const proj = await req.db.get('project').findOne({
        shortname: o,
        backup: { $exists: 0 }
      });

      return proj;
    });
    const projects = await Promise.all([...arr])
      .catch((err) => {
        console.log('ERROR Cannot get db information:', err);
      });
    await checkAccess.filterAnnotationsByProjects(json.mri, projects, loggedUser);

    // Set access to text annotations
    if (typeof json.mri.annotations !== "undefined") {
      for (const key of Object.keys(json.mri.annotations)) {
        for (j = 0; j < projects.length; j++) {
          // eslint-disable-next-line max-depth
          if (projects[j] && projects[j].shortname === i) {
            const access = checkAccess.toAnnotationByProject(projects[j], loggedUser);
            const level = checkAccess.accessStringToLevel(access);
            // eslint-disable-next-line max-depth
            if (level > 0) {
              // eslint-disable-next-line max-depth
              for (k of json.mri.annotations[key]) {
                json.mri.annotations[key][k].access = access;
              }
            } else {
              delete json.mri.annotations[key];
            }
          }
        }
      }
    }

    // Send data
    console.log('Hello');
    res.render('mri', {
      title: json.name || 'BrainBox',
      params: JSON.stringify(req.query),
      mriInfo: JSON.stringify(json),
      login
    });
  }
};

const removeVariablesFromURL = function (myurl) {
  return myurl.split("&")[0];
};

// eslint-disable-next-line max-statements
const apiMriPost = async function (req, res) {
  console.log("apiMriPost");

  let myurl;
  if (typeof req.body.url !== "undefined") {
    myurl = req.body.url;
  } else if (typeof req.query.url !== "undefined") {
    myurl = req.query.url;
  }

  try {
    // eslint-disable-next-line no-new
    new URL(myurl);
  } catch(err) {
    res.send('Invalid URL!');

    return;
  }


  myurl = removeVariablesFromURL(myurl);
  console.log("url:", myurl);

  const hash = crypto
    .createHash('md5')
    .update(myurl)
    .digest('hex');

  // It's fine to post(/mri/json) without being authenticated
  // if (!(req.isAuthenticated() || req.isTokenAuthenticated)) {
  //     return res.status(403).send({error: "Provide authentication"}).end();
  // }

  let json = await req.db.get('mri').findOne({ source: myurl, backup: { $exists: 0 }, success: { $exists: 1 } }, { _id: 0 })
    .catch((err) => {
      console.log('ERROR:', err);
      res.json({ success: false });
    });
  // Determine whether we need to download the data from the source
  let doDownload = false;

  // Check if client is requesting for a specific variable
  const doReturnAll = (typeof req.body.var === "undefined");

  // Asking for a single variable does not trigger a download in case
  // the file is not already present.
  if (doReturnAll) {
    if (!json) {
      // If the json object is empty, request download
      console.log('No DB entry for MRI: download');
      doDownload = true;
    } else {
      // If the json object exists, but there's no file, download
      const filename = json.filename || url.parse(myurl).pathname.split('/').pop();
      const filepath = req.dirname + '/public/data/' + hash + '/' + sanitize(filename);
      // eslint-disable-next-line no-sync
      if (!fs.existsSync(filepath)) {
        console.log('No MRI file in server: download');
        doDownload = true;
      } else
      if (!json.dim) {
        // If the json object exists, there's a file, but no .dim object, download
        // If(debug>1) console.log("No dim[] field in DB entry: download");
        doDownload = true;
      }
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
      if (success === "downloading") {
        console.log('>> Still downloading. Wait');
        res.json(downloadQueue[myurl]);
      } else {

        /*
          returns 403 in case the download has already failed
          consequently, it will not be possible to retry the download until the server is restarted
        */
        console.log(">> Failed. Throw an error");
        res.status(403).json(downloadQueue[myurl]);
      }
    } else {
      console.log('Start download:');
      downloadQueue[myurl] = { success: 'downloading', cur: 0, len: 1 };
      downloadMRI(myurl, req).then((obj) => {
        console.log("downloadMRI obj:", obj);
        console.log('Download succeeded. Insert in DB, remove from queue');
        obj.success = true;

        return req.db.get('mri').insert(obj);
      })
        .then(() => {
          // downloadQueue[myurl] = obj;
          delete downloadQueue[myurl];
        })
        .catch((err) => {
          console.log('Download failed:', err);
          downloadQueue[myurl] = { success: false, error: `${JSON.stringify(err)}` };
        });

      res.json(downloadQueue[myurl]);
    }
  } else {
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
  } else
  if (req.isTokenAuthenticated) {
    loggedUser = req.tokenUsername;
  }

  // if the query does not contain a specific mri, send a paginated list of mris
  if (!myurl) {
    if (typeof page === "undefined") {
      res.send({ error: "Provide the parameter 'page'" });

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

  const json = await req.db.get('mri').findOne({ source: myurl, backup: { $exists: backups } }, { _id: 0 })
    .catch((err) => {
      console.log('err:', err);
    });
  if (!json) {
    console.log("MRI not present in DB");
    if (download === true) {
      console.log("trigger download");
      res.json({ source: myurl });
    } else {
      console.log("send 404 error");
      res.status(404).json({});
    }
  } else {
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
    if (typeof json.mri.annotations !== "undefined") {
      for (const key of Object.keys(json.mri.annotations)) {
        console.log('text annotation is in project', key);
        prj.add(key);
      }
    }
    arr = [...prj].map(async (o) => {
      const obj = await req.db.get('project').findOne({
        shortname: o,
        backup: { $exists: 0 }
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
          const access = checkAccess.toAnnotationByProject(projects[j], loggedUser);
          const level = checkAccess.accessStringToLevel(access);
          console.log('loggedUser,access,level:', loggedUser, access, level);
          // Check for 'view' access (level > 0)
          if (level === 0) {
            json.mri.atlas.splice(i, 1);
          }
          break;
        }
      }
    }
    // Set access to text annotations
    if (typeof json.mri.annotations !== "undefined") {
      for (const key of Object.keys(json.mri.annotations)) {
        for (j = 0; j < projects.length; j++) {
          if (projects[j] && projects[j].shortname === key) {
            const access = checkAccess.toAnnotationByProject(projects[j], loggedUser);
            const level = checkAccess.accessStringToLevel(access);
            console.log('loggedUser,access,level:', loggedUser, access, level);
            // eslint-disable-next-line max-depth
            if (level === 0) {
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

  const mridb = await req.db.get('mri').findOne({ source: myurl, backup: { $exists: 0 } })
    .catch((err) => {
      console.log('ERROR:', err);
      res
        .status(403)
        .send(err)
        .end();
    });
  console.log(mridb);
  let filename;
  if (mridb) { ({filename} = mridb); }
  const mrires = await atlasmakerServer.getBrainAtPath('/data/' + hash + '/' + filename)
    .catch((err) => {
      console.log('ERROR:', err);
      res
        .status(403)
        .send(err)
        .end();
    });
  await req.db.get('mri').update({ source: myurl, backup: { $exists: 0 } }, {
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

const MriController = function () {
  this.validator = validator;
  this.validatorPost = validatorPost;
  this.apiMriGet = apiMriGet;
  this.apiMriPost = apiMriPost;
  this.mri = mri;
  this.reset = reset;
};

module.exports = new MriController();
