/* eslint-disable prefer-exponentiation-operator */
/* eslint-disable radix */
const dateFormat = require('dateformat');
const dataSlices = require('../dataSlices/dataSlices.js');
const {
  AccessLevel, PUBLIC_USER_FIELDS, jsonForAttribute, jsonForScript, publicLoggedUser, publicUser, userProjectsRoute, visitor
} = require('neuroweblab');
const BrainboxAccessControlService = require('../../services/BrainboxAccessControlService');

// What of a user others may see is NeuroWebLab's (1.22.0, T002 M15): publicUser and
// publicLoggedUser, an allow-list of the configured usernameField (`nickname` here, app.js) and
// PUBLIC_USER_FIELDS. The fields `?var=` may name: the same, the username field included
const USER_VARS = Object.freeze(['nickname', ...PUBLIC_USER_FIELDS]);

const validator = function (req, res, next) {

  // userName can be an ip address (for anonymous users)

  /*
    // legacy api, needs to be rewriten if uncommented
    req.checkParams('userName', 'incorrect user name').isAlphanumeric();
    var errors = req.validationErrors();
    console.log(errors);
    if (errors) {
        res.status(403).send(errors).end();
    } else {
        return next();
    }
    */
  next();
};

const user = async function (req, res) {
  const requestedUser = req.params.userName;

  // store return path in case of login
  req.session.returnTo = req.originalUrl;

  let json;
  try {
    json = await req.nativeDb.collection('user').findOne({ nickname: requestedUser });
  } catch (err) {
    console.log('ERROR:', err);
    res.status(500).send('Error');

    return;
  }
  if (json) {
    const context = {
      username: json.name,
      nickname: json.nickname,
      joined: dateFormat(json.joined, 'dddd d mmm yyyy, HH:MM'),
      avatar: json.avatarURL,
      title: requestedUser,
      userInfo: jsonForAttribute(publicUser(json)),
      tab: req.query.tab || 'mri',
      loggedUser: jsonForScript(publicLoggedUser(req.user))
    };
    res.render('user', context);
  } else {
    res.status(404).send('User Not Found');
  }
};

const apiUser = async function (req, res) {
  let json;
  try {
    json = await req.nativeDb.collection('user').findOne({ nickname: req.params.userName, backup: { $exists: false } });
  } catch (err) {
    console.log('ERROR:', err);
    res.status(500).send({ error: 'Server error' });

    return;
  }
  if (!json) {
    res.send();

    return;
  }
  const info = publicUser(json);
  const field = req.query.var;
  if (field) {
    // ?var=name: a single public field; an empty response for any other name
    res.send(USER_VARS.includes(field) ? info[field] : null);
  } else {
    res.send(info);
  }
};

const apiUserAll = async function (req, res) {
  if (!req.query.page) {
    res.json({ error: 'Provide the parameter \'page\'' });

    return;
  }

  // eslint-disable-next-line radix
  const page = parseInt(req.query.page);
  const nItemsPerPage = 20;

  const json = await req.nativeDb.collection('user').find({ backup: { $exists: false } }, { skip: page * nItemsPerPage, limit: nItemsPerPage, projection: { _id: 0 } })
    .toArray();
  res.send(json.map(function (o) {
    return o.nickname;
  }));
};


/**
 * @function apiUserFiles
 * @param {Object} req Request object
 * @param {Object} res Response object
 * @returns {Object} Object with a list of user mri files
 */
const apiUserFiles = async function (req, res) {
  // @todo Check access rights for this route
  const { userName } = req.params;
  let { start, length } = req.query;

  console.log('userName:', userName, 'start:', start, 'length:', length);

  if (typeof start === 'undefined') {
    res.status(403).send({ error: 'Provide \'start\'' });

    return;
  }
  if (typeof length === 'undefined') {
    res.status(403).send({ error: 'Provide \'length\'' });

    return;
  }

  start = parseInt(start);
  length = parseInt(length);

  const result = await dataSlices.getUserFilesSlice(req, userName, start, length)
    .catch(function (err) {
      console.log('ERROR:', err);
      res.send({ success: false, list: [] });
    });
  res.send(result);
};

/**
 * @function apiUserAtlas
 * @param {Object} req Request object
 * @param {Object} res Response object
 * @returns {Object} Object with a list of user atlases
 */
const apiUserAtlas = async function (req, res) {
  // @todo Check access rights for this route
  const { userName } = req.params;
  let { start, length } = req.query;

  console.log('userName:', userName, 'start:', start, 'length:', length);
  if (typeof start === 'undefined') {
    res.status(403).send({ error: 'Provide \'start\'' });

    return;
  }
  if (typeof length === 'undefined') {
    res.status(403).send({ error: 'Provide \'length\'' });

    return;
  }
  start = parseInt(start);
  length = parseInt(length);

  const result = await dataSlices.getUserAtlasSlice(req, userName, start, length)
    .catch(function (err) {
      console.log('ERROR:', err);
      res.send({ success: false, list: [] });
    });
  res.send(result);
};

/**
 * GET /user/json/:userName/projects?[start][&length]: NeuroWebLab's userProjectsRoute (1.22.0,
 * T002 M15). The user's current projects (owner, or a collaborator row naming them by userID,
 * username or nickname) that the visitor may view the files of, `length` of them from `start`
 * (by default all of them; a value that is not a string of digits counts as not given), as
 * `{success: list.length > 0, list}`. An error goes to the app's errorHandler (a 500 `{error}`).
 */
const apiUserProjects = userProjectsRoute({
  db: (req) => req.nativeDb,
  canView: (req, project) => BrainboxAccessControlService.hasFilesAccess(AccessLevel.VIEW, project, visitor(req) || 'anonymous'),
  rows: (req, page) => {
    const loggedUser = visitor(req) || 'anonymous';

    return page.map((project) => dataSlices.userProjectRow(project, loggedUser));
  },
  answer: (list) => ({ success: list.length > 0, list })
});

const UserController = function () {
  this.validator = validator;
  this.apiUser = apiUser;
  this.apiUserAll = apiUserAll;
  this.apiUserFiles = apiUserFiles;
  this.apiUserAtlas = apiUserAtlas;
  this.apiUserProjects = apiUserProjects;
  this.user = user;
};

module.exports = new UserController();
