/* eslint-disable prefer-exponentiation-operator */
/* eslint-disable radix */
const dateFormat = require('dateformat');
const dataSlices = require('../dataSlices/dataSlices.js');

const validator = function (req, res, next) {
  // userName can be an ip address (for anonymous users)
  const nickname = req.params.userName;

  req.app.db.queryUser({nickname})
    .then((result) => {
      if (!result) {
        res.status(404);
      }
      if (result.disabled) {
        res.status(404);

        return res.render('disabledUser');
      }
      next();

    });
};

const user = async function (req, res) {
  const requestedUser = req.params.userName;

  // store return path in case of login
  req.session.returnTo = req.originalUrl;

  const json = await req.db.get('user').findOne({ nickname: requestedUser })
    .catch(function (err) {
      console.log('ERROR:', err);
      res.status(400).send('Error');
    });
  if (json) {
    const context = {
      username: json.name,
      nickname: json.nickname,
      joined: dateFormat(json.joined, 'dddd d mmm yyyy, HH:MM'),
      avatar: json.avatarURL,
      title: requestedUser,
      userInfo: JSON.stringify(json),
      tab: req.query.tab || 'mri',
      loggedUser: JSON.stringify(req.user || null)
    };
    res.render('user', context);
  } else {
    res.status(404).send('User Not Found');
  }
};

const apiUser = async function (req, res) {
  let json = await req.db.get('user').findOne({ nickname: req.params.userName, backup: { $exists: false } }, '-_id');
  if (json) {
    if (req.query.var) {
      const arr = req.query.var.split('/');
      for (const i in arr) {
        if ({}.hasOwnProperty.call(arr, i)) {
          json = json[arr[i]];
        }
      }
    }
    res.send(json);
  } else {
    res.send();
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

  const json = await req.db.get('user').find({ backup: { $exists: false } }, { skip: page * nItemsPerPage, limit: nItemsPerPage, fields: { _id: 0 } });
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

const deleteProfile = async function(req, res) {
  const loggedUser = req.user;
  if (!loggedUser) {
    res.status(401);
  }
  try {
    const userInfo = await req.app.db.queryUser({nickname: loggedUser.username});
    await req.app.db.updateUser({ ...userInfo, disabled: true });
    res.redirect('/logout');
  } catch(err) {
    console.log(err);
    res.status(500);
  }
};

const savePreferences = async function(req, res) {
  const loggedUser = req.user;
  if (!loggedUser) {
    res.status(401);
  }
  try {
    const userInfo = await req.app.db.queryUser({nickname: loggedUser.username});
    await req.app.db.updateUser({ ...userInfo, authorizedHostsForEmbedding: req.body.authorizedHosts });
    res.redirect(`/user/${req.user.username}`);
  } catch(err) {
    console.log(err);
    res.status(500);
  }

};

const UserController = function () {
  this.validator = validator;
  this.apiUser = apiUser;
  this.apiUserAll = apiUserAll;
  this.apiUserFiles = apiUserFiles;
  this.apiUserAtlas = apiUserAtlas;
  this.apiUserProjects = apiUserProjects;
  this.savePreferences = savePreferences;
  this.deleteProfile = deleteProfile;
  this.user = user;
};

module.exports = new UserController();
