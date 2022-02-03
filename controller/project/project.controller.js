const url = require('url');
const crypto = require('crypto');
const validatorNPM = require('validator');
const dataSlices = require('../dataSlices/dataSlices.js');
const AsyncLock = require('async-lock');
const lock = new AsyncLock();
const { AccessType, AccessLevel, AccessControlService } = require('neuroweblab');

const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const { ForbiddenAccessError } = require('../../errors.js');
const {window} = (new JSDOM('', {
  features: {
    FetchExternalResources: false, // disables resource loading over HTTP / filesystem
    ProcessExternalResources: false // do not execute JS within script blocks
  }
}));
const DOMPurify = createDOMPurify(window);

const validator = function (req, res, next) {

  req.checkParams('projectName', 'incorrect project name').isAlphanumeric();
  // req.checkQuery('url', 'please enter a valid URL')
  // .isURL();

  // req.checkQuery('var', 'please enter one of the variables that are indicated')
  // .optional()
  // .matches("localpath|filename|source|url|dim|pixdim"); //todo: decent regexp
  var errors = req.validationErrors();
  if (errors) {
    res.status(403).send(errors)
      .end();
  } else {
    return next();
  }
};

/**
 * @func isProjectObject
 * @param {Object} req Express req object
 * @param {Object} res Express res object
 * @param {Object} object Project definition object
 * @returns {Promise} true if the project is valid
 * @todo object.annotations??
 */
const isProjectObject = function (req, res, object) {
  // var goodOwner = false;
  // var goodCollaborators = false;

  // eslint-disable-next-line max-statements, complexity
  const pr = new Promise(function (resolve, reject) {
    let arr;
    const allowed = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,_- '–:;".split("");
    const allowedAlphanumericHyphen = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-".split("");

    // 1. Synchronous checks
    //----------------------
    // files
    if (object.files) {
      for (const file of object.files.list) {
        if (!validatorNPM.isURL(file.source)) {
          reject(new Error("Invalid file URL" ));

          return;
        }
        if (!validatorNPM.isWhitelisted(file.name, allowed)) {
          reject(new Error("Invalid file name"));

          return;
        }
      }
    }
    console.log("> files ok");

    // description
    if (object.description && !validatorNPM.isWhitelisted(object.description, allowed)) {
      reject(new Error("Invalid project description"));

      return;
      // delete object.description;
    }
    console.log("> description ok");

    // name
    if (object.name && !validatorNPM.isWhitelisted(object.name, allowed)) {
      reject(new Error("Invalid name"));

      return;
      //delete object.name;
    }
    console.log("> name ok");

    // check that owner and shortname are present
    if (!object.owner || !object.shortname) {
      reject(new Error("Invalid owner or project shortname, not present"));

      return;
    }
    console.log("> owner and project shortname present");

    // check that shortname is alphanumeric
    if (!validatorNPM.isWhitelisted(object.owner, allowedAlphanumericHyphen) || !validatorNPM.isWhitelisted(object.shortname, allowedAlphanumericHyphen)) {
      reject(new Error("Invalid owner or project shortname, not alphanumeric"));

      return;
    }
    console.log("> owner and project shortname valid");

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
      reject(new Error("User 'anyone' is not present"));

      return;
    }

    // check that collaborator's access values are valid
    flag = true;
    for (const collaborator of arr) {
      if (validatorNPM.matches(collaborator.access.collaborators, "none|view|edit|add|remove") === false) {
        // console.log("collaborators",collaborator);
        flag = false;
        break;
      }
      if (validatorNPM.matches(collaborator.access.annotations, "none|view|edit|add|remove") === false) {
        // console.log("annotations",collaborator);
        flag = false;
        break;
      }
      if (validatorNPM.matches(collaborator.access.files, "none|view|edit|add|remove") === false) {
        // console.log("files",collaborator);
        flag = false;
        break;
      }
    }
    if (flag === false) {
      reject(new Error("Access values are invalid"));

      return;
    }
    console.log("> Access values ok");

    // check that the list of annotations contains at least 1 volume-type entry
    flag = false;
    for (const annotation of object.annotations.list) {
      if (annotation.type === "volume") {
        flag = true;
        break;
      }
    }
    if (flag === false) {
      reject(new Error("Annotations must contain at least 1 volume-type entry"));

      return;
    }


    // 2. Asynchronous checks
    //-----------------------

    arr = [];
    arr.push(req.db.get('user').findOne({ nickname: object.owner }));
    for (const collaborator of object.collaborators.list) {
      arr.push(req.db.get('user').findOne({ nickname: collaborator.userID }));
    }
    Promise.all(arr).then(function (users) {
      var notFound = false;
      for (const user of users) {
        if (user === null) {
          notFound = true;
          break;
        }
      }
      if (notFound === true) {
        reject(new Error("Users are invalid, one or more do not exist"));

        return;
      }

      // All checks are successful, resolve the promisse
      //console.log({success:true, message:"All checks ok. Project object looks valid"});
      resolve(object);
    });
  });

  return pr;
};

/**
 * @function project
 * @desc Render the project page GUI
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 * @return {void}
 */
const project = async function (req, res) {
  var login = (req.isAuthenticated()) ?
    ("<a href='/user/" + req.user.username + "'>" + req.user.username + "</a> (<a href='/logout'>Log Out</a>)")
    : ("<a href='/auth/github'>Log in with GitHub</a>");
  var loggedUser = "anonymous";
  if (req.isAuthenticated()) {
    loggedUser = req.user.username;
  } else
  if (req.isTokenAuthenticated) {
    loggedUser = req.tokenUsername;
  }

  // store return path in case of login
  req.session.returnTo = req.originalUrl;

  const json = await req.db.get('project').findOne({ shortname: req.params.projectName, backup: { $exists: 0 } });
  if (json) {
    // check that the logged user has access to view this project
    if (!AccessControlService.hasFilesAccess(AccessLevel.VIEW, json, loggedUser)) {
      res.status(401).send("Authorization required");

      return;
    }

    json.files.list = [];
    res.render('project', {
      title: json.name,
      projectInfo: JSON.stringify(json),
      projectName: json.name,
      login: login
    });
  } else {
    res.status(404).send("Project Not Found");
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
  var loggedUser = "anonymous";
  if (req.isAuthenticated()) {
    loggedUser = req.user.username;
  } else
  if (req.isTokenAuthenticated) {
    loggedUser = req.tokenUsername;
  }

  const json = await req.db.get('project').findOne({ shortname: req.params.projectName, backup: { $exists: 0 } }, "-_id");
  if (json) {
    // check that the logged user has access to view this project
    if (!AccessControlService.hasFilesAccess(AccessLevel.VIEW, json, loggedUser)) {
      res.status(401).json({ error: "Authorization required" });

      return;
    }

    let filteredJSON = Object.assign({}, json);
    if (!AccessControlService.canViewCollaborators(json, loggedUser)) {
      filteredJSON.collaborators.list = filteredJSON.collaborators.list.filter((collaborator) => collaborator.userID === 'anyone');
    }
    [AccessType.FILES, AccessType.ANNOTATIONS].forEach((type) => {
      if (!AccessControlService.hasAccess(type, AccessLevel.VIEW, json, loggedUser)) {
        filteredJSON[type].list = [];
      }
    });

    if (req.query.var) {
      const arr = req.query.var.split("/");
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
  var nItemsPerPage, page;
  // var loggedUser = "anonymous";
  // if (req.isAuthenticated()) {
  //   loggedUser = req.user.username;
  // } else
  // if (req.isTokenAuthenticated) {
  //   loggedUser = req.tokenUsername;
  // }

  if (!req.query.page) {
    res.send({ error: "Provide the parameter 'page'" });

    return;
  }

  // eslint-disable-next-line radix
  page = Math.max(0, parseInt(req.query.page));
  nItemsPerPage = 20;

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
  console.log("projShortname:", projShortname, "start:", start, "length:", length, "namesFlag:", namesFlag);

  if (typeof start === "undefined") {
    res.send({ error: "Provide 'start'" });

    return;
  }
  if (typeof length === "undefined") {
    res.send({ error: "Provide 'length'" });

    return;
  }

  // eslint-disable-next-line radix
  start = parseInt(start);
  // eslint-disable-next-line radix
  length = parseInt(length);
  namesFlag = (namesFlag === "true");

  try {
    const list = await dataSlices.getProjectFilesSlice(req, projShortname, start, length, namesFlag);
    res.send(list);
  } catch(err) {
    if(err instanceof ForbiddenAccessError) {
      res.status(403).send({ error: err.message });
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
  var login = (req.isAuthenticated()) ?
    ("<a href='/user/" + req.user.username + "'>" + req.user.username + "</a> (<a href='/logout'>Log Out</a>)")
    : ("<a href='/auth/github'>Log in with GitHub</a>");
  var loggedUser = "anonymous";
  if (req.isAuthenticated()) {
    loggedUser = req.user.username;
  } else
  if (req.isTokenAuthenticated) {
    loggedUser = req.tokenUsername;
  }

  // store return path in case of login
  req.session.returnTo = req.originalUrl;
  let json = await req.db.get('project').findOne({ shortname: req.params.projectName, backup: { $exists: 0 } });
  if (json) {
    // check that the logged user has access to view this project
    if (!AccessControlService.hasFilesAccess(AccessLevel.VIEW, json, loggedUser)) {
      console.log('Hello');
      res.status(401).send("Authorization required");

      return;
    }
  } else {
    json = {
      name: "",
      shortname: req.params.projectName,
      url: "",
      brainboxURL: "/project/" + req.params.projectName,
      created: (new Date()).toJSON(),
      owner: loggedUser,
      collaborators: {
        list: [
          {
            userID: 'anyone',
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

  // empty the files.list: it will be filled progressively from the client
  json.files.list = [];

  // deep-copying initial object
  const filteredJSON = JSON.parse(JSON.stringify(json));

  if (AccessControlService.canViewCollaborators(json, loggedUser)) {
    const arr1 = [];
    for (let j = 0; j < filteredJSON.collaborators.list.length; j++) {
      arr1.push(req.db.get('user').findOne({ nickname: json.collaborators.list[j].userID, backup: { $exists: 0 } }, { name: 1, _id: 0 }));
    }
    const obj = await Promise.all(arr1);
    for (let j = 0; j < obj.length; j++) {
      filteredJSON.collaborators.list[j].username = filteredJSON.collaborators.list[j].userID;
      if (obj[j]) { // name found
        filteredJSON.collaborators.list[j].name = obj[j].name;
      } else { // name not found: set to empty
        filteredJSON.collaborators.list[j].name = "";
      }
    }
  } else {
    filteredJSON.collaborators.list = json.collaborators.list.filter((collaborator) => collaborator.userID === 'anyone');
  }

  if (!AccessControlService.canViewAnnotations(json, loggedUser)) {
    filteredJSON.annotations.list = [];
  }

  var context = {
    projectShortname: filteredJSON.shortname,
    owner: filteredJSON.owner,
    projectInfo: JSON.stringify(filteredJSON),
    login: login
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
  var login = (req.isAuthenticated()) ?
    ("<a href='/user/" + req.user.username + "'>" + req.user.username + "</a> (<a href='/logout'>Log Out</a>)")
    : ("<a href='/auth/github'>Log in with GitHub</a>");
  var loggedUser = "anonymous";
  if (req.isAuthenticated()) {
    loggedUser = req.user.username;
  } else if (req.isTokenAuthenticated) {
    loggedUser = req.tokenUsername;
  }

  // store return path in case of login
  req.session.returnTo = req.originalUrl;

  if (loggedUser === "anonymous") {
    const context = {
      title: "BrainBox: New Project",
      functionality: "create a new project",
      login: login
    };
    res.render('askForLogin', context);
  } else {
    const context = {
      title: "BrainBox: New Project",
      login: login
    };
    res.render('projectNew', context);
  }
};

const insertMRInames = function (req, res, list) {
  // insert MRI names, but only if they don't exist
  for (var i = 0; i < list.length; i++) {
    var {name} = list[i];
    var {source} = list[i];
    var filename = url.parse(source).pathname.split("/").pop();

    // it there's no name, continue to the next mri
    if (!name) { continue; }

    // check if the mri entry already exists
    (async function (na, so, fi) { // without a closure, only the last name in the list is used and repeated
      let mri = await req.db.get('mri').findOne({ source: so, backup: { $exists: 0 } });
      var hash = crypto.createHash('md5').update(so)
        .digest('hex');

      // if mri exists, and has no name, insert the name
      if (!mri) {
        mri = {
          filename: fi,
          source: so,
          url: "/data/" + hash + "/",
          included: (new Date()).toJSON(),
          owner: req.user.username,
          mri: {
            brain: fi,
            atlas: [
              {
                owner: req.user.username,
                created: (new Date()).toJSON(),
                modified: (new Date()).toJSON(),
                type: 'volume',
                filename: 'Atlas.nii.gz',
                labels: 'foreground.json'
              }
            ]
          }
        };
      } else {
        delete mri._id;
      }
      mri.modified = (new Date()).toJSON();
      mri.modifiedBy = req.user.username;

      /* Use this if you want imported names to overwrite existing ones */
      mri.name = na;

      /* Use this if you want imported names to be used only if no previous name exists */
      /*
          if(!mri.name) {
              mri.name=na;
          }
          */

      // sanitise json
      mri = JSON.parse(DOMPurify.sanitize(JSON.stringify(mri))); // sanitize works on strings, not objects

      // update and insert
      await req.db.get('mri').update({ source: mri.source }, { $set: { backup: true } }, { multi: true });
      await req.db.get('mri').insert(mri);
    }(name, source, filename));
  }
};

/**
 * @function postProject
 * @desc Receives data for creating a new project or updating the settings of an existing one
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 */
// eslint-disable-next-line max-statements
const postProject = async function (req, res) {
  var loggedUser = "anonymous";
  if (req.isAuthenticated()) {
    loggedUser = req.user.username;
  } else
  if (req.isTokenAuthenticated) {
    loggedUser = req.tokenUsername;
  }

  if (loggedUser === "anonymous") {
    console.log("ERROR not Authenticated");
    res.status(403).json({ error: "error", message: "User not authenticated" });

    return;
  }

  const payload = JSON.stringify(req.body.data);
  const clean = DOMPurify.sanitize(payload);
  let obj;
  try {
    obj = JSON.parse(clean);
  } catch (err) {
    console.log("ERROR");
    console.log({ clean, obj });
    res.status(500).send({error: err.message});

    return;
  }
  var k;

  // eslint-disable-next-line max-statements
  await lock.acquire(['project', 'mri'], async function() {
    let object;
    try {
      object = await isProjectObject(req, res, obj);
    } catch(err) {
      console.error(err.message);
      res.status(500).send({error: err.message});

      return;
    }
    const oldProject = await req.db.get('project').findOne({ shortname: object.shortname, backup: { $exists: false } })
      .catch(function (error) {
        console.log("ERROR", error);
        res.status(300).json({ "error": error });
      });
    // update/insert project
    if (oldProject) {
    // project exists, save update
      if (!AccessControlService.hasFilesAccess(AccessLevel.EDIT, oldProject, loggedUser)) {
        console.log("User does not have edit rights");
        res.status(403).json({ error: "error", message: "User does not have edit rights" });

        return;
      }
      // insert MRI names if provided
      console.log("insert mri names");
      await insertMRInames(req, res, object.files.list);

      // reformat file list
      console.log("reformat file list");
      for (k = 0; k < object.files.list.length; k++) {
        object.files.list[k] = object.files.list[k].source;
      }

      let shouldReturnEarly = false;
      [AccessType.COLLABORATORS, AccessType.FILES, AccessType.ANNOTATIONS].forEach((type) => {
        const checkAccessType = AccessControlService.hasAccess(type);
        const canAdd = checkAccessType(AccessLevel.ADD);
        if (object[type].list.length > oldProject[type].list.length && !canAdd(oldProject, loggedUser)) {
          res.status(403).send({error: `Not authorized to add ${type}`});
          shouldReturnEarly = true;

          return false;
        }
        const canRemove = checkAccessType(AccessLevel.REMOVE);
        if (object[type].list.length < oldProject[type].list.length && !canRemove(oldProject, loggedUser)) {
          res.status(403).send({error: `Not authorized to remove ${type}`});
          shouldReturnEarly = true;

          return false;
        }

        const canView = checkAccessType(AccessLevel.VIEW);
        if (!canView(oldProject, loggedUser)) {
          // we add back contents that were eventually filtered
          object[type].list = oldProject[type].list;
        }

      });

      if(shouldReturnEarly) {
        return;
      }

      object.modified = (new Date()).toJSON();
      object.modifiedBy = req.user.username;
      delete object._id;

      console.log("updating...");
      await req.db.get('project').update({ shortname: object.shortname }, { $set: { backup: true } }, { multi: true });
      await req.db.get('project').insert(object);

      console.log("success: true");
      res.json({ success: true, message: "Project settings updated" });
    } else {
    // new project, insert
      console.log("inserting...");
      console.log("insert mri names");
      await insertMRInames(req, res, obj.files.list);

      // reformat file list
      console.log("reformat file list");
      for (k = 0; k < obj.files.list.length; k++) {
        obj.files.list[k] = obj.files.list[k].source;
      }

      delete object._id;

      await req.db.get('project').insert(obj);

      console.log("success: true");
      res.json({ success: true, message: "New project inserted" });
    }
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
  var shortname;
  var loggedUser = "anonymous";
  if (req.isAuthenticated()) {
    loggedUser = req.user.username;
  } else
  if (req.isTokenAuthenticated) {
    loggedUser = req.tokenUsername;
  }

  if (loggedUser === "anonymous") {
    console.log("The user is not logged in");
    res.status(401).json({ success: false, message: "User not authenticated" });

    return;
  }

  try {
    // eslint-disable-next-line max-statements
    await lock.acquire(['project', 'mri'], async function() {

      shortname = req.params.projectName;
      const oldProject = await req.db.get('project').findOne({ shortname: shortname, backup: { $exists: 0 } });

      if (!oldProject) {
        console.log("WARNING: project does not exist");
        res.status(500).json({ success: false, message: "Unable to delete. Project does not exist in the database" });

        return;
      }
      console.log(">> project does exist");

      if (!AccessControlService.hasFilesAccess(AccessLevel.REMOVE, oldProject, loggedUser)) {
        console.log("WARNING: user does not have remove rights");
        res.status(403).json({ success: false, message: "The user is not allowed to delete this project" });

        return;
      }
      console.log(">> user does have remove rights");

      var query = {},
        update = {};
      query["mri.annotations." + shortname] = { $exists: 1 };
      query.backup = { $exists: 0 };
      update.$unset = {};
      update.$unset["mri.annotations." + shortname] = "";
      await Promise.all([
        req.db.get('project').remove({ _id: oldProject._id, backup: { $exists: false } }),
        req.db.get('mri').update(query, update, { multi: true }),
        req.db.get('mri').update({ "mri.atlas": { $elemMatch: { project: shortname } } }, { $pull: { "mri.atlas": { project: shortname } } }, { multi: true })
      ]);
      console.log(">> project and project-related annotations removed");
      res.json({ success: true, message: "Project deleted" });
    });
  } catch (err) {
    console.log("ERROR: cannot remove project or project-related annotations", err);
    res.json({ success: false, message: "Unable to delete. Try again later" });
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
