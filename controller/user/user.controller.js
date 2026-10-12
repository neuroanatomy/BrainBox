/* eslint-disable prefer-exponentiation-operator */
/* eslint-disable radix */
const dateFormat = require('dateformat');
const dataSlices = require('../dataSlices/dataSlices.js');
const { jsonForAttribute, jsonForScript } = require('../utils/jsonForScript');
const { PUBLIC_USER_FIELDS, publicUser, publicLoggedUser } = require('./publicUser');

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
    res.send(PUBLIC_USER_FIELDS.includes(field) ? info[field] : null);
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
 * @function apiUserProjects
 * @param {Object} req Request object
 * @param {Object} res Response object
 * @returns {Object} Object with a list of user projects
 */
const apiUserProjects = async function (req, res) {
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

  const result = await dataSlices.getUserProjectsSlice(req, userName, start, length)
    .catch(function (err) {
      console.log('ERROR:', err);
      res.send({ success: false, list: [] });
    });
  res.send(result);
};

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
