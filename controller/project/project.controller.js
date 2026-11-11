/* eslint-disable max-lines */
const crypto = require('crypto');
const validatorNPM = require('validator');
const { param, validationResult } = require('express-validator');
const dataSlices = require('../dataSlices/dataSlices.js');
const lock = require('../projectLock.js');
const { AccessType, AccessLevel, AccessControlService } = require('neuroweblab');
const _ = require('lodash');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const { ForbiddenAccessError, NotFoundError } = require('../../errors.js');
const { jsonForScript } = require('../utils/jsonForScript');
const { publicLoggedUser } = require('../user/publicUser');
const { isLabelset, changedLabelsets, setLayerLabelset } = require('./atlas-labels.js');
const { window } = (new JSDOM('', {
  features: {
    FetchExternalResources: false, // disables resource loading over HTTP / filesystem
    ProcessExternalResources: false // do not execute JS within script blocks
  }
}));
const DOMPurify = createDOMPurify(window);

// a new project's shortname: letters, numbers and hyphens (shared suite 2.6, 2026-11-11)
const shortnamePattern = /^[a-zA-Z0-9-]+$/;

const validator = async function (req, res, next) {

  // hyphens allowed, as in a new project's shortname (shared suite 2.6, 2026-11-11; was alphanumeric only)
  await param('projectName', 'incorrect project name').matches(shortnamePattern)
    .run(req);
  // req.checkQuery('url', 'please enter a valid URL')
  // .isURL();

  // req.checkQuery('var', 'please enter one of the variables that are indicated')
  // .optional()
  // .matches("localpath|filename|source|url|dim|pixdim"); //todo: decent regexp
  const errors = validationResult(req).array();
  if (errors.length) {
    // a malformed project name is the client's error (shared suite 2.13, 2026-11-11; was 403)
    res.status(400).send({ error: errors.map((e) => e.msg).join(', '), errors })
      .end();
  } else {
    return next();
  }
};

/**
 * @func isProjectObject
 * @param {Object} req Express req object
 * @param {Object} res Express res object
 * @param {Object} object Project definition object, its owner already set by the server
 * @param {Object} params { shortname: the name in the URL, isNew: true if no project is stored under it }
 * @returns {Promise} true if the project is valid
 * @todo object.annotations??
 */
// eslint-disable-next-line max-statements, complexity
const isProjectObject = async function (req, res, object, { shortname, isNew }) {
  // var goodOwner = false;
  // var goodCollaborators = false;

  // eslint-disable-next-line max-statements, complexity
  let arr;
  const allowed = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,_- \'–:;'.split('');

  // 1. Synchronous checks
  //----------------------
  // files
  if (object.files) {
    for (const file of object.files.list) {
      if (typeof file.source !== 'string') {
        throw (new Error('File source not specified'));
      }
      if (typeof file.name !== 'string') {
        throw (new Error('File name not specified'));
      }
      if (!validatorNPM.isURL(file.source)) {
        throw (new Error(`Invalid file URL: ${file.source}`));
      }
      if (!validatorNPM.isWhitelisted(file.name, allowed)) {
        throw (new Error(`Invalid file name "${file.name}"`));
      }
    }
  }
  console.log('> files ok');

  // description
  if (object.description && !validatorNPM.isWhitelisted(object.description, allowed)) {
    throw (new Error('Invalid project description'));
    // delete object.description;
  }
  console.log('> description ok');

  // name
  if (object.name && !validatorNPM.isWhitelisted(object.name, allowed)) {
    throw (new Error('Invalid name'));
    //delete object.name;
  }
  console.log('> name ok');

  // the shortname: the one in the URL, which finds the stored project (shared suite 2.6,
  // 2026-11-11; the body's was used, the URL ignored). Only a new one is checked for its
  // characters: a stored project keeps working whatever its shortname
  if (object.shortname !== shortname) {
    throw (new Error('The project shortname in the data differs from the one in the URL'));
  }
  if (isNew && !shortnamePattern.test(shortname)) {
    throw (new Error('The project shortname can only contain letters, numbers and hyphens'));
  }
  console.log('> project shortname valid');

  // the owner is set by the server (shared suite 2.5): the stored one, or the creator
  if (!object.owner) {
    throw (new Error('The project has no owner'));
  }

  // convenience array for collaborator checks
  arr = object.collaborators.list;
  // check that the 'anyone' user is present
  let flag = false;
  for (const collaborator of arr) {
    if (collaborator.userID === 'anyone') {
      flag = true;
      break;
    }
  }
  if (flag === false) {
    throw (new Error('User \'anyone\' is not present'));
  }

  // check that collaborator's access values are valid: exactly one of the
  // levels (an unanchored regex let "viewer" pass; shared suite 2.8, 2026-11-11)
  const accessLevels = ['none', 'view', 'edit', 'add', 'remove'];
  const validAccess = (access) => Boolean(access) && ['collaborators', 'annotations', 'files']
    .every((type) => accessLevels.includes(access[type]));
  flag = arr.every((collaborator) => validAccess(collaborator.access));
  if (flag === false) {
    throw (new Error('Access values are invalid'));
  }
  console.log('> Access values ok');

  // check that the list of annotations contains at least 1 volume-type entry
  flag = false;
  for (const annotation of object.annotations.list) {
    if (annotation.type === 'volume') {
      flag = true;
      break;
    }
  }
  if (flag === false) {
    throw (new Error('Annotations must contain at least 1 volume-type entry'));
  }


  // 2. Asynchronous checks
  //-----------------------

  arr = [];
  arr.push(req.nativeDb.collection('user').findOne({ nickname: object.owner }));
  for (const collaborator of object.collaborators.list) {
    arr.push(req.nativeDb.collection('user').findOne({ nickname: collaborator.userID }));
  }
  const users = await Promise.all(arr);
  let notFound = false;
  for (const user of users) {
    if (user === null) {
      notFound = true;
      break;
    }
  }
  if (notFound === true) {
    throw (new Error('Users are invalid, one or more do not exist'));
  }

  // All checks are successful, resolve the promisse
  //console.log({success:true, message:"All checks ok. Project object looks valid"});
  return object;
};

/**
 * The project as a user may see it: the collaborators and modifiedBy only if they may view them (else
 * only 'anyone'), the files and annotations only if they may view them (else empty lists).
 * The stored project is not changed: the filtered lists go in new objects
 * @param {Object} json The stored project
 * @param {string} loggedUser The user's name, or 'anonymous'
 * @returns {Object} A copy of the project, filtered
 */
const projectForUser = function (json, loggedUser) {
  const filteredJSON = Object.assign({}, json);
  if (!AccessControlService.canViewCollaborators(json, loggedUser)) {
    filteredJSON.collaborators = { ...json.collaborators, list: json.collaborators.list.filter((collaborator) => collaborator.userID === 'anyone') };
    // who saved last is a collaborator too
    delete filteredJSON.modifiedBy;
  }
  [AccessType.FILES, AccessType.ANNOTATIONS].forEach((type) => {
    if (!AccessControlService.hasAccess(type, AccessLevel.VIEW, json, loggedUser)) {
      filteredJSON[type] = { ...json[type], list: [] };
    }
  });

  return filteredJSON;
};

/**
 * @function project
 * @desc Render the project page GUI
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 * @return {void}
 */
const project = async function (req, res) {
  const login = (req.isAuthenticated()) ?
    ('<a href=\'/user/' + req.user.username + '\'>' + req.user.username + '</a> (<a href=\'/logout\'>Log Out</a>)')
    : ('<a href=\'/auth/github\'>Log in with GitHub</a>');
  let loggedUser = 'anonymous';
  if (req.isAuthenticated()) {
    loggedUser = req.user.username;
  }

  // store return path in case of login
  req.session.returnTo = req.originalUrl;

  const json = await req.nativeDb.collection('project')
    .findOne({ shortname: req.params.projectName, backup: { $exists: false } }, { projection: { _id: 0 } });
  if (json) {
    // check that the logged user has access to view this project
    if (!AccessControlService.hasFilesAccess(AccessLevel.VIEW, json, loggedUser)) {
      res.status(401).send('Authorization required');

      return;
    }
    // as the JSON API gives it; the files are loaded by the page, page by page
    const projectInfo = { ...projectForUser(json, loggedUser), files: { ...json.files, list: [] } };
    res.render('project', {
      title: json.name,
      projectInfo: JSON.stringify(projectInfo),
      projectName: json.name,
      annotationsAccessLevel: AccessControlService.getUserOrPublicAccessLevel(json, loggedUser, AccessType.ANNOTATIONS),
      loggedUser: jsonForScript(publicLoggedUser(req.user)),
      login
    });
  } else {
    res.status(404).send('Project Not Found');
  }
};

/**
 * @function apiProject
 * @desc Writes json data for a project
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 * @returns {void}
 * @result A json object with project data
 */
// eslint-disable-next-line max-statements
const apiProject = async function (req, res) {
  let loggedUser = 'anonymous';
  if (req.isAuthenticated()) {
    loggedUser = req.user.username;
  }

  const json = await req.nativeDb.collection('project').findOne({ shortname: req.params.projectName, backup: { $exists: false } }, { projection: { _id: 0 } });
  if (json) {
    // check that the logged user has access to view this project
    if (!AccessControlService.hasFilesAccess(AccessLevel.VIEW, json, loggedUser)) {
      res.status(401).json({ error: 'Authorization required' });

      return;
    }

    let filteredJSON = projectForUser(json, loggedUser);

    if (req.query.var) {
      const arr = req.query.var.split('/');
      for (const v of arr) { filteredJSON = filteredJSON[v]; }
    }
    res.json(filteredJSON);

  } else {
    res.send();
  }
};

/**
 * @function apiProjectAll
 * @desc Writes json data for all project, access-filtered
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 * @returns {void}
 * @result A json object with project data
 */
const apiProjectAll = async function (req, res) {
  // var loggedUser = "anonymous";
  // if (req.isAuthenticated()) {
  //   loggedUser = req.user.username;
  // }

  if (!req.query.page) {
    res.send({ error: 'Provide the parameter \'page\'' });

    return;
  }

  // eslint-disable-next-line radix
  const page = Math.max(0, parseInt(req.query.page));
  const nItemsPerPage = 20;

  const values = await dataSlices.getProjectsSlice(req, page * nItemsPerPage, nItemsPerPage);
  res.json(values);
};

/**
 * @function apiProjectFiles
 * @desc Writes json data for a slice of project files
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 * @returns {void}
 * @result A json object with project data
 */
// eslint-disable-next-line max-statements
const apiProjectFiles = async function (req, res) {
  const projShortname = req.params.projectName;
  let { start, length, names: namesFlag } = req.query;
  console.log('projShortname:', projShortname, 'start:', start, 'length:', length, 'namesFlag:', namesFlag);

  if (typeof start === 'undefined') {
    res.send({ error: 'Provide \'start\'' });

    return;
  }
  if (typeof length === 'undefined') {
    res.send({ error: 'Provide \'length\'' });

    return;
  }

  // eslint-disable-next-line radix
  start = parseInt(start);
  // eslint-disable-next-line radix
  length = parseInt(length);
  namesFlag = (namesFlag === 'true');

  try {
    const list = await dataSlices.getProjectFilesSlice(req, projShortname, start, length, namesFlag);
    res.send(list);
  } catch (err) {
    if (err instanceof ForbiddenAccessError) {
      res.status(403).send({ error: err.message });
    } else if (err instanceof NotFoundError) {
      res.status(404).send({ error: err.message });
    } else {
      res.status(500).send({ error: err.message });
    }
  }
};

/**
 * @function settings
 * @desc Render the settings page GUI
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 */
// eslint-disable-next-line max-statements
const settings = async function (req, res) {
  let loggedUser = 'anonymous';
  if (req.isAuthenticated()) {
    loggedUser = req.user.username;
  }

  // store return path in case of login
  req.session.returnTo = req.originalUrl;
  let json = await req.nativeDb.collection('project').findOne({ shortname: req.params.projectName, backup: { $exists: false } }, { projection: { _id: 0 } });
  if (json) {
    // check that the logged user has access to view this project
    if (!AccessControlService.hasFilesAccess(AccessLevel.VIEW, json, loggedUser)) {
      console.log('Hello');
      res.status(401).send('Authorization required');

      return;
    }
  } else {
    json = {
      name: '',
      shortname: req.params.projectName,
      url: '',
      brainboxURL: '/project/' + req.params.projectName,
      created: (new Date()).toJSON(),
      owner: loggedUser,
      collaborators: {
        list: [
          {
            userID: 'anyone',
            nickname: 'anyone',
            access: {
              collaborators: 'view',
              annotations: 'edit',
              files: 'view'
            }
          }
        ]
      },
      files: {
        list: []
      },
      annotations: {
        list: []
      }
    };
  }

  // empty the files.list: it will be filled progressively from the client, which
  // reports in filesLoaded.count how many files it received (see postProject)
  const filesTotal = json.files.list.length;
  json.files.list = [];
  json.filesLoaded = { count: 0 };

  // deep-copying initial object
  const filteredJSON = _.cloneDeep(json);

  if (AccessControlService.canViewCollaborators(json, loggedUser)) {
    const arr1 = [];
    for (let j = 0; j < filteredJSON.collaborators.list.length; j++) {
      arr1.push(
        req.nativeDb.collection('user')
          .findOne({
            nickname: json.collaborators.list[j].userID,
            backup: { $exists: false }
          }, {
            projection: { name: 1, _id: 0 }
          })
      );
    }
    const obj = await Promise.all(arr1);
    for (let j = 0; j < obj.length; j++) {
      filteredJSON.collaborators.list[j].username = filteredJSON.collaborators.list[j].userID;
      if (obj[j]) { // name found
        filteredJSON.collaborators.list[j].name = obj[j].name;
      } else { // name not found: set to empty
        filteredJSON.collaborators.list[j].name = '';
      }
    }
  } else {
    filteredJSON.collaborators.list = json.collaborators.list.filter((collaborator) => collaborator.userID === 'anyone');
    delete filteredJSON.modifiedBy;
  }

  if (!AccessControlService.canViewAnnotations(json, loggedUser)) {
    filteredJSON.annotations.list = [];
  }

  const context = {
    projectShortname: filteredJSON.shortname,
    owner: filteredJSON.owner,
    projectInfo: JSON.stringify(filteredJSON),
    filesTotal,
    loggedUser: jsonForScript(publicLoggedUser(req.user))
  };

  res.render('projectSettings', context);
};

/**
 * @function newProject
 * @desc Render the page with the GUI for entering a new project
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 * @returns {void}
 */
const newProject = function (req, res) {
  const login = (req.isAuthenticated()) ?
    ('<a href=\'/user/' + req.user.username + '\'>' + req.user.username + '</a> (<a href=\'/logout\'>Log Out</a>)')
    : ('<a href=\'/auth/github\'>Log in with GitHub</a>');
  let loggedUser = 'anonymous';
  if (req.isAuthenticated()) {
    loggedUser = req.user.username;
  }

  // store return path in case of login
  req.session.returnTo = req.originalUrl;

  if (loggedUser === 'anonymous') {
    const context = {
      title: 'BrainBox: New Project',
      functionality: 'create a new project',
      login: login
    };
    res.render('askForLogin', context);
  } else {
    const context = {
      title: 'BrainBox: New Project',
      loggedUser: jsonForScript(publicLoggedUser(req.user))
    };
    res.render('projectNew', context);
  }
};

// eslint-disable-next-line max-statements
const insertMRInames = function (req, res, list) {
  // insert MRI names, but only if they don't exist
  return Promise.all(list.map((el) => (async function (file) {
    const { name, source } = file;

    // it there's no name, continue to the next mri
    if (!name) { return; }

    // check if the mri entry already exists
    // without a closure, only the last name in the list is used and repeated
    let mri = await req.nativeDb.collection('mri').findOne({ source, backup: { $exists: false } }, { projection: { _id: 0 } });
    const hash = crypto.createHash('md5').update(source)
      .digest('hex');

    // if mri exists, and has no name, insert the name
    if (!mri) {
      mri = {
        source,
        url: '/data/' + hash + '/',
        included: (new Date()).toJSON(),
        owner: req.user.username,
        mri: {
          atlas: [
            {
              owner: req.user.username,
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
    mri.modified = (new Date()).toJSON();
    mri.modifiedBy = req.user.username;

    /* Use this if you want imported names to overwrite existing ones */
    mri.name = name;

    /* Use this if you want imported names to be used only if no previous name exists */
    /*
    if(!mri.name) {
        mri.name=name;
    }
    */

    // sanitise json
    mri = JSON.parse(DOMPurify.sanitize(JSON.stringify(mri))); // sanitize works on strings, not objects

    // update and insert
    await req.nativeDb.collection('mri').updateMany({ source: mri.source }, { $set: { backup: true } });
    await req.nativeDb.collection('mri').insertOne(mri);
  }(el))));
};

/**
 * @function updateAtlasLabelsets
 * @desc Give the atlases of the volume layers whose label set changed the new
 *       label set, in every MRI where the layer has an atlas
 * @param {Object} req Req object from express
 * @param {Object} oldProject The stored project
 * @param {Object} savedProject The project saved
 * @returns {Promise<Array<string>>} Messages for the user
 */
const updateAtlasLabelsets = async function (req, oldProject, savedProject) {
  const messages = [];
  for (const { name, values } of changedLabelsets(oldProject.annotations, savedProject.annotations)) {
    if (!isLabelset(values)) {
      messages.push(`The label set "${values}" of layer "${name}" does not exist: its annotations keep their label set.`);
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const changed = await setLayerLabelset(req.nativeDb, { project: savedProject.shortname, name, values, username: req.user.username });
      console.log(`label set of layer ${name} changed to ${values} in ${changed.length} MRIs`);
    } catch (err) {
      console.error(err);
      messages.push(`The annotations of layer "${name}" could not be given the new label set: ${err.message}.`);
    }
  }

  return messages;
};

/**
 * @function postProject
 * @desc Receives data for creating a new project or updating the settings of an existing one
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 */
// eslint-disable-next-line max-statements
const postProject = async function (req, res) {
  let loggedUser = 'anonymous';
  if (req.isAuthenticated()) {
    loggedUser = req.user.username;
  }

  if (loggedUser === 'anonymous') {
    console.log('ERROR not Authenticated');
    // 401: who are you? (shared suite 2.1, 2026-11-11; was 403)
    res.status(401).json({ error: 'error', message: 'User not authenticated' });

    return;
  }

  const payload = JSON.stringify(req.body.data);
  const clean = DOMPurify.sanitize(payload);
  let obj;
  try {
    obj = JSON.parse(clean);
  } catch (err) {
    console.log('ERROR');
    console.log({ clean, obj });
    // an invalid document is the client's error (shared suite 2.13, 2026-11-11; was 500)
    res.status(400).send({ error: err.message });

    return;
  }
  let k;
  // the stored project is found by the URL's shortname, which the body must equal (shared suite 2.6)
  const shortname = req.params.projectName;
  if (obj && typeof obj === 'object') {
    // the database id and the backup flag are the server's: a client backup: true would hide
    // the version saved, a client _id would be stored (shared suite 2.15, 2026-11-11)
    delete obj._id;
    delete obj.backup;
  }

  // eslint-disable-next-line max-statements
  await lock.acquire(['project', 'mri'], async function () {
    console.log('enter lock block');
    let oldProject;
    try {
      oldProject = await req.nativeDb.collection('project').findOne({ shortname, backup: { $exists: false } }, { projection: { _id: 0 } });
    } catch (error) {
      console.log('ERROR', error);
      res.status(500).json({ error: error.message });

      return;
    }
    let object;
    try {
      if (obj && typeof obj === 'object') {
        // the owner is never the client's: the stored one, or the creator (shared suite 2.5, 2026-11-11)
        obj.owner = oldProject ? oldProject.owner : loggedUser;
      }
      object = await isProjectObject(req, res, obj, { shortname, isNew: !oldProject });
    } catch (err) {
      console.error(err.message);
      res.status(400).send({ error: err.message });

      return;
    }
    // set by the server on every save, creation included (shared suite 2.18, 2026-11-11; was on update only)
    object.modified = (new Date()).toJSON();
    object.modifiedBy = loggedUser;
    // update/insert project
    if (oldProject) {
      // project exists, save update
      if (!AccessControlService.hasFilesAccess(AccessLevel.EDIT, oldProject, loggedUser)) {
        console.log('User does not have edit rights');
        res.status(403).json({ error: 'error', message: 'User does not have edit rights' });

        return;
      }
      // The settings page loads the files in batches, and says how many it received
      // (filesLoaded.count). If that is not the whole stored list, the list it sends
      // is incomplete: keep the stored one, so that files are not lost
      const ignoredChanges = [];
      const filesIncomplete = typeof object.filesLoaded !== 'undefined' &&
        !(object.filesLoaded && object.filesLoaded.count === oldProject.files.list.length);
      delete object.filesLoaded;
      if (filesIncomplete) {
        console.log(`incomplete file list (${object.files.list.length} received, ${oldProject.files.list.length} stored): keeping the stored one`);
        object.files.list = oldProject.files.list;
      } else {
        // insert MRI names if provided
        console.log('insert mri names');
        await insertMRInames(req, res, object.files.list);

        // reformat file list
        console.log('reformat file list');
        for (k = 0; k < object.files.list.length; k++) {
          object.files.list[k] = object.files.list[k].source;
        }
      }

      [AccessType.COLLABORATORS, AccessType.FILES, AccessType.ANNOTATIONS].forEach((type) => {
        const checkAccessType = AccessControlService.hasAccess(type);
        const canAdd = checkAccessType(AccessLevel.ADD);
        const canRemove = checkAccessType(AccessLevel.REMOVE);
        if (
          (object[type].list.length > oldProject[type].list.length && !canAdd(oldProject, loggedUser)) ||
          (object[type].list.length < oldProject[type].list.length && !canRemove(oldProject, loggedUser))
        ) {
          ignoredChanges.push(type);
          object[type].list = oldProject[type].list;
        }
      });

      console.log('updating...');
      await req.nativeDb.collection('project').updateMany({ shortname: object.shortname }, { $set: { backup: true } });
      await req.nativeDb.collection('project').insertOne(object);

      // the atlases of a volume layer keep the label set they were created with:
      // give them the layer's new one
      const labelsetMessages = await updateAtlasLabelsets(req, oldProject, object);

      console.log('success: true');
      let successMessage = 'Project settings updated.';
      if (ignoredChanges.length > 0) {
        successMessage += ` Some changes (on ${ignoredChanges.join(', ')}) were ignored due to a lack of permissions.`;
      }
      if (filesIncomplete) {
        successMessage += ' The list of files was not saved because it had not been completely loaded: reload the page to edit it.';
      }
      if (labelsetMessages.length > 0) {
        successMessage += ' ' + labelsetMessages.join(' ');
      }

      res.json({ success: true, message: successMessage });
    } else {
      // new project, insert
      console.log('inserting...');
      delete object.filesLoaded;
      console.log('insert mri names');
      await insertMRInames(req, res, object.files.list);

      // reformat file list
      console.log('reformat file list');
      for (k = 0; k < object.files.list.length; k++) {
        object.files.list[k] = object.files.list[k].source;
      }

      await req.nativeDb.collection('project').insertOne(object);

      console.log('success: true');
      res.json({ success: true, message: 'New project inserted' });
    }
    console.log('leave lock block');
  });
};

/**
 * @function deleteProject
 * @desc Delete a project
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 */
// eslint-disable-next-line max-statements
const deleteProject = async function (req, res) {
  let shortname;
  let loggedUser = 'anonymous';
  if (req.isAuthenticated()) {
    loggedUser = req.user.username;
  }

  if (loggedUser === 'anonymous') {
    console.log('The user is not logged in');
    res.status(401).json({ success: false, message: 'User not authenticated' });

    return;
  }

  try {
    // eslint-disable-next-line max-statements
    await lock.acquire(['project', 'mri'], async function () {

      shortname = req.params.projectName;
      const oldProject = await req.nativeDb.collection('project').findOne({ shortname: shortname, backup: { $exists: false } }, { projection: { _id: 0 } });

      if (!oldProject) {
        console.log('WARNING: project does not exist');
        // shared suite 2.23, 2026-11-11 (was 500)
        res.status(404).json({ success: false, message: 'Unable to delete. Project does not exist in the database' });

        return;
      }
      console.log('>> project does exist');

      if (!AccessControlService.hasFilesAccess(AccessLevel.REMOVE, oldProject, loggedUser)) {
        console.log('WARNING: user does not have remove rights');
        res.status(403).json({ success: false, message: 'The user is not allowed to delete this project' });

        return;
      }
      console.log('>> user does have remove rights');

      const query = {},
        update = {};
      query['mri.annotations.' + shortname] = { $exists: 1 };
      query.backup = { $exists: false };
      update.$unset = {};
      update.$unset['mri.annotations.' + shortname] = '';
      await Promise.all([
        req.nativeDb.collection('project').deleteOne({ shortname: shortname, backup: { $exists: false } }),
        req.nativeDb.collection('mri').updateMany(query, update),
        req.nativeDb.collection('mri').updateMany({ 'mri.atlas': { $elemMatch: { project: shortname } } }, { $pull: { 'mri.atlas': { project: shortname } } })
      ]);
      console.log('>> project and project-related annotations removed');
      res.json({ success: true, message: 'Project deleted' });
    });
  } catch (err) {
    console.log('ERROR: cannot remove project or project-related annotations', err);
    res.json({ success: false, message: 'Unable to delete. Try again later' });
  }
};


const ProjectController = function () {
  this.validator = validator;
  this.apiProjectAll = apiProjectAll;
  this.apiProject = apiProject;
  this.apiProjectFiles = apiProjectFiles;
  this.project = project;
  this.settings = settings;
  this.newProject = newProject;
  this.postProject = postProject;
  this.deleteProject = deleteProject;
};

module.exports = new ProjectController();
