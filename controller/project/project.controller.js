/* eslint-disable max-lines */
const crypto = require('crypto');
const { param, validationResult } = require('express-validator');
const dataSlices = require('../dataSlices/dataSlices.js');
const {
  AccessType, AccessLevel, AccessControlService, canSaveProject, droppedMessage, filesListIncomplete,
  findCurrentProject, ignoredChangesMessage, jsonForScript, keepFieldsWithoutFilesEdit, keepListsWithoutEditRights, parseProjectData,
  noViewStatus, projectDeleteRoute, publicLoggedUser, projectFilesRoute, projectJsonRoute, projectListRoute, projectPageRoute, projectSaveRoute,
  projectSettingsRoute, sanitize, saveProjectVersion, saveRefusal, shortnamePattern, validateProject, visibleProject, visitor
} = require('neuroweblab');
const _ = require('lodash');
const BrainboxAccessControlService = require('../../services/BrainboxAccessControlService');
const { isLabelset, changedLabelsets, setLayerLabelset } = require('./atlas-labels.js');
const { fileSource, listOf, listTypes, rowKey } = require('./project-rows.js');
const { missingUsers, projectRules } = require('./project-rules.js');
// the sanitising of the body (validateProject), of the MRI documents it writes and of the stored
// values compared with it (shared suite 2.12) is NeuroWebLab's (1.10.0, T002 M3): sanitize and
// plainText, every string one by one, as text

const validator = async function (req, res, next) {

  // hyphens allowed, as in a new project's shortname: NeuroWebLab's shortnamePattern (shared suite 2.6,
  // 2026-11-11; was alphanumeric only)
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
 * @desc Parse, sanitise and validate the project sent: NeuroWebLab's validateProject (1.20.0,
 *   T002 M13c) with BrainBox's rules (project-rules.js). The rows equal to stored ones are accepted
 *   as they are, the blank new rows dropped (shared suite 2.14); the users of the new rows, and a
 *   new project's owner, must exist (2.9), looked up on user.nickname
 * @param {Object} req Express req object (req.nativeDb)
 * @param {*} data The project sent (an object or a JSON string), with the stored fields the client
 *   does not send (2.17), not sanitised: validateProject sanitises it, once
 * @param {Object} params { shortname: the name in the URL, oldProject: the stored project or
 *   null, owner: the stored one, or the creator (2.5) }
 * @returns {Promise<Object>} { project, dropped: the blank new rows dropped, by list } or { error }
 *   (a 400 answer)
 */
const isProjectObject = (req, data, { shortname, oldProject, owner }) => validateProject(data, {
  shortname,
  oldProject,
  owner,
  findMissingUsers: (names) => missingUsers(req.nativeDb, names),
  rules: projectRules(req.nativeDb)
});

/*
 * The visitor of the project routes (NeuroWebLab 1.21.0, T002 M14c): NWL's visitor (a session,
 * or a valid API token: authTokenMiddleware sets req.user), or BrainBox's sentinel 'anonymous'
 * when logged out. Only the hooks map null to 'anonymous': it does not enter NWL's signatures
 */
const getLoggedUser = (req) => visitor(req) || 'anonymous';

// What every project route asks of BrainBox (NeuroWebLab 1.17.0 and 1.21.0): the native db and
// the view right
const db = (req) => req.nativeDb;
const canView = (req, proj) => BrainboxAccessControlService.hasFilesAccess(AccessLevel.VIEW, proj, getLoggedUser(req));

/*
 * GET /project/:projectName: the project page (NeuroWebLab's projectPageRoute, 1.21.0: the
 * return path, 404 'Project Not Found', the view right, refused with noViewStatus and 'Not
 * authorized to view project'; an error goes to the app's errorHandler, the error page)
 */
const project = projectPageRoute({
  db,
  canView,
  render: (req, res, json) => {
    const loggedUser = getLoggedUser(req);
    // as the JSON API gives it; the files are loaded by the page, page by page
    const projectInfo = { ...visibleProject(json, loggedUser), files: { ...json.files, list: [] } };
    res.render('project', {
      title: json.name,
      projectInfo: jsonForScript(projectInfo),
      annotationsAccessLevel: BrainboxAccessControlService.getUserOrPublicAccessLevel(json, loggedUser, AccessType.ANNOTATIONS),
      // the nwl-components header's user (null when logged out); its title is projectInfo.name
      loggedUser: jsonForScript(publicLoggedUser(req.user))
    });
  }
});

/*
 * GET /project/json/:projectName: what the visitor may see of the project (NWL visibleProject),
 * or with ?var=a/b the value at that path, own properties only (NeuroWebLab's projectJsonRoute,
 * 1.21.0: 404 {error: 'No project <name>'} (shared suite 1.6), the view right; an error, as a
 * ?var= path through a missing value, goes to the app's errorHandler, a 500)
 */
const apiProject = projectJsonRoute({
  db,
  canView,
  visible: (req, json) => visibleProject(json, getLoggedUser(req))
});

/*
 * GET /project/json/:projectName/files and GET /project/json?page are NeuroWebLab's (1.17.0,
 * T002 M10): projectFilesRoute reads the project, answers 404 or the no-view status, slices
 * `files.list` (a negative or non-numeric `start`/`length` counting as 0) and BrainBox maps the
 * slice (dataSlices.projectFileEntries); projectListRoute reads every current project, keeps the
 * viewable ones, then pages them, 20 per page (a non-numeric `page` is page 0), BrainBox giving
 * the row (dataSlices.projectRow). A failing read goes to the app's errorHandler
 */
const projectRoutesAdapter = { db, canView };

const apiProjectFiles = projectFilesRoute({
  ...projectRoutesAdapter,
  noViewStatus,
  entries: dataSlices.projectFileEntries
});

const apiProjectAll = projectListRoute({
  ...projectRoutesAdapter,
  row: dataSlices.projectRow
});

/**
 * The project the settings page shows for an unknown shortname, owned by the visitor
 * ('anonymous' when logged out)
 * @param {Object} req Req object from express
 * @returns {Object} The new project
 */
const blankProject = (req) => ({
  name: '',
  shortname: req.params.projectName,
  url: '',
  brainboxURL: '/project/' + req.params.projectName,
  created: (new Date()).toJSON(),
  owner: getLoggedUser(req),
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
});

/**
 * @function renderSettings
 * @desc Render the settings page GUI, once its view right is checked (or the project is new)
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 * @param {Object} json The stored project, or the blank one
 * @returns {Promise<void>} Resolves once rendered
 */
const renderSettings = async function (req, res, json) {
  const loggedUser = getLoggedUser(req);

  // empty the files.list: it will be filled progressively from the client, which
  // reports in filesLoaded.count how many files it received (see postProject)
  const filesTotal = json.files.list.length;
  json.files.list = [];
  json.filesLoaded = { count: 0 };

  // what the visitor may see (NWL visibleProject: the collaborators other than
  // 'anyone', modifiedBy and the annotations hidden without view rights),
  // deep-copied: the name lookup below writes on the rows
  const filteredJSON = _.cloneDeep(visibleProject(json, loggedUser));

  // with the collaborators' view right visibleProject keeps every row, in order: the rows looked
  // up are the rows shown
  if (AccessControlService.canViewCollaborators(json, loggedUser)) {
    const rows = filteredJSON.collaborators.list;
    const obj = await Promise.all(rows.map((row) => req.nativeDb.collection('user')
      .findOne({
        nickname: row.userID,
        backup: { $exists: false }
      }, {
        projection: { name: 1, _id: 0 }
      })));
    for (let j = 0; j < obj.length; j++) {
      rows[j].username = rows[j].userID;
      // the name found, else empty
      rows[j].name = obj[j] ? obj[j].name : '';
    }
  }

  res.render('projectSettings', {
    projectShortname: filteredJSON.shortname,
    owner: filteredJSON.owner,
    projectInfo: jsonForScript(filteredJSON),
    filesTotal,
    loggedUser: jsonForScript(publicLoggedUser(req.user))
  });
};

/*
 * GET /project/:projectName/settings: the settings page (NeuroWebLab's projectSettingsRoute,
 * 1.21.0: the return path, the view right of a stored project, as the page, the blank project of
 * an unknown one; an error goes to the app's errorHandler, the error page)
 */
const settings = projectSettingsRoute({
  db,
  canView,
  blankProject,
  render: renderSettings
});

/**
 * @function newProject
 * @desc Render the page with the GUI for entering a new project
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 * @returns {void}
 */
const newProject = function (req, res) {
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
      loggedUser: jsonForScript(publicLoggedUser(null))
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

    // sanitise each string (2.12): a source with "&" is kept as it is
    mri = sanitize(mri);

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

// the message for the blank new rows that isProjectObject dropped (shared suite 2.14) is
// NeuroWebLab's droppedMessage (1.10.0, T002 M3)

// Save rights (2026-11-15) are NeuroWebLab's (1.9.0, T002 M2): canSaveProject (edit on at
// least one list), keepFieldsWithoutFilesEdit (the project's own fields need files edit; given
// sanitize, so that a stored value equal to the one sent once sanitised is unchanged),
// saveRefusal (the 403 body), filesListIncomplete (the incomplete files list guard) and
// ignoredChangesMessage; keepListsWithoutEditRights (1.19.0, T002 M12c) the rights per list

/**
 * @function saveProject
 * @desc Create a new project or update the settings of an existing one, holding the lock
 *   (postProject's body: the 403 before the 400 (T002 M13, decision D2), the validation, the files
 *   list guard, the writes)
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 * @param {string} loggedUser The user saving (logged in: projectSaveRoute answered 401 otherwise)
 * @returns {Promise<void>} Resolves once answered
 */
// eslint-disable-next-line max-statements
const saveProject = async function (req, res, loggedUser) {
  // the stored project is found by the URL's shortname, which the body must equal (shared suite 2.6)
  const shortname = req.params.projectName;

  console.log('enter lock block');
  let oldProject;
  try {
    oldProject = await findCurrentProject(req.nativeDb, shortname, { projection: { _id: 0 } });
  } catch (err) {
    console.log('ERROR', err);
    res.status(500).json({ error: err.message });

    return;
  }
  // the rights before the validation (T002 M13, decision D2): a user who may not save an
  // existing project learns nothing about the document sent
  if (oldProject && !canSaveProject(oldProject, loggedUser)) {
    const refusal = saveRefusal();
    console.log(refusal.error);
    res.status(403).json(refusal);

    return;
  }
  // the stored lists, sanitised as the body, to compare the rows sent with
  const oldLists = _.fromPairs(listTypes.map((type) => [type, sanitize(listOf(oldProject, type))]));
  // the body as sent: validateProject sanitises each string as text (shared suite 2.12), once
  // (sanitize is not idempotent on a string with markup and escaped markup), drops the client's
  // _id and backup (2.15), and refuses a document that is not a project with a 400 (2.13)
  let { data } = req.body;
  const parsed = parseProjectData(data);
  if (oldProject && parsed) {
    // the stored top-level fields the client doesn't send are kept (shared suite 2.17,
    // 2026-11-11; they were lost). A copy: the stored project is compared with below
    data = { ..._.cloneDeep(oldProject), ...parsed };
  }
  // the owner is never the client's: the stored one, or the creator (shared suite 2.5, 2026-11-11)
  const owner = oldProject ? oldProject.owner : loggedUser;
  const { project: object, dropped, error } = await isProjectObject(req, data, { shortname, oldProject, owner });
  if (error) {
    console.error(error);
    res.status(400).send({ error });

    return;
  }
  // update/insert project
  if (oldProject) {
    // The settings page loads the files in batches, and says how many it received
    // (filesLoaded.count). If that is not the whole stored list, the list it sends
    // is incomplete: keep the stored one, so that files are not lost. NWL's
    // filesListIncomplete then sets dropped.files = 0: the list sent was not used, so no blank
    // file row was dropped from it; a stored project without a files list has 0 files
    const ignoredChanges = [];
    const filesIncomplete = filesListIncomplete(object, oldProject, dropped);
    delete object.filesLoaded;
    // the files sent, whose names go in their MRI documents
    let sentFiles = [];
    if (filesIncomplete) {
      console.log(`incomplete file list (${object.files.list.length} received, ${listOf(oldProject, 'files').length} stored): keeping the stored one`);
      object.files.list = listOf(oldProject, 'files');
    } else {
      // files are stored as their source
      sentFiles = object.files.list;
      object.files.list = sentFiles.map(fileSource);
    }

    // a longer list needs add on it, a shorter one remove, and a row changed in place or moved
    // edit (shared suite 2.4, 2026-11-11, and 2.26; only the lengths were checked): else the
    // stored list is kept. NWL's keepListsWithoutEditRights (1.19.0, T002 M12c), comparing the
    // rows on rowKey with the stored rows sanitised as the body (oldLists); a stored project
    // without a list has []. object.files.list holds sources here, as rowKey.files expects
    ignoredChanges.push(...keepListsWithoutEditRights(object, oldProject, loggedUser, { rowKey, oldRows: oldLists }));

    // the project's own fields need files edit (2026-11-15)
    ignoredChanges.push(...keepFieldsWithoutFilesEdit(object, oldProject, loggedUser, { sanitize }));

    // insert the MRI names provided, for the files the project keeps (they were written
    // for every file sent, even when the list was then kept as stored)
    console.log('insert mri names');
    // A file's name is part of the files list: it needs files edit (2026-11-15, when a save
    // without files edit became possible)
    if (AccessControlService.hasFilesAccess(AccessLevel.EDIT, oldProject, loggedUser)) {
      const keptSources = new Set(object.files.list.map(fileSource));
      await insertMRInames(req, res, sentFiles.filter((file) => _.isPlainObject(file) && keptSources.has(file.source)));
    }

    console.log('updating...');
    // NWL's saveProjectVersion (1.16.0, T002 M9c) inserts the new version, then marks the others
    // backup, and sets modified and modifiedBy, on every save, creation included (shared suite
    // 2.18). It stores a copy: `object` is not changed
    await saveProjectVersion(req.nativeDb, object, { by: loggedUser });

    // the atlases of a volume layer keep the label set they were created with:
    // give them the layer's new one
    const labelsetMessages = await updateAtlasLabelsets(req, oldProject, object);

    console.log('success: true');
    let successMessage = 'Project settings updated.';
    successMessage += ignoredChangesMessage(ignoredChanges);
    if (filesIncomplete) {
      successMessage += ' The list of files was not saved because it had not been completely loaded: reload the page to edit it.';
    }
    successMessage += droppedMessage(dropped);
    if (labelsetMessages.length > 0) {
      successMessage += ' ' + labelsetMessages.join(' ');
    }

    res.json({ success: true, message: successMessage });
  } else {
    // new project, insert
    console.log('inserting...');
    delete object.filesLoaded;
    console.log('insert mri names');
    await insertMRInames(req, res, object.files.list.filter(_.isPlainObject));

    // files are stored as their source
    object.files.list = object.files.list.map(fileSource);

    await saveProjectVersion(req.nativeDb, object, { by: loggedUser });

    console.log('success: true');
    res.json({ success: true, message: 'New project inserted' + droppedMessage(dropped) });
  }
  console.log('leave lock block');
};

/*
 * The lock of the project changes (NWL's project/lock.js, as controller/projectLock.js), held by
 * the save and the delete; the admin tools take the same keys (decision D3)
 */
const lockKeys = () => ['project', 'mri'];

/*
 * POST /project/json/:projectName (NeuroWebLab's projectSaveRoute, 1.21.0): logged out 401
 * {success: false, error: 'User not authenticated', message: …} (shared suite 2.1), without the
 * lock; else saveProject holding it. Any other error (e.g. the database) goes to the app's
 * errorHandler, a 500
 */
const postProject = projectSaveRoute({ lockKeys, save: saveProject });

/**
 * @function removeProject
 * @desc Delete the project and its annotations: the current version, the MRIs' annotations of
 *   the project and the MRIs' atlases of the project
 * @param {Object} req Req object from express
 * @param {Object} oldProject The stored project
 * @returns {Promise<void>} Resolves once deleted (nothing added to the answer)
 */
const removeProject = async function (req, oldProject) {
  const { shortname } = oldProject;
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
};

/*
 * DELETE /project/json/:projectName (NeuroWebLab's projectDeleteRoute, 1.21.0): logged out 401,
 * as the save; holding the lock, an unknown project 404 {success: false, error: 'Project not
 * found', message: …} (shared suite 2.23, 2.32), no REMOVE right 403 {success: false, error: 'The
 * user is not allowed to delete this project', message: …} (2.33), else the delete and 200
 * {success: true, message: 'Project deleted'}. A failing write goes to the app's errorHandler, a
 * 500 (was 200 {success: false})
 */
const deleteProject = projectDeleteRoute({
  db,
  lockKeys,
  canRemove: (req, proj) => AccessControlService.hasFilesAccess(AccessLevel.REMOVE, proj, getLoggedUser(req)),
  remove: removeProject
});

// The project page, its settings page, its JSON, its save and its delete are NeuroWebLab's
// route factories (1.21.0, T002 M14c): an error goes to `next`, and the app's errorHandler
// answers it (routes/notFound.js: a page as the error page, JSON as {error})
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
