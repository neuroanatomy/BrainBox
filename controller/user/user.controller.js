const dateFormat = require('dateformat');
const dataSlices = require('../dataSlices/dataSlices.js');

var validator = function(req, res, next) {

    // userName can be an ip address (for anonymous users)

    /*
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

var user = function(req, res) {
    var login = (req.isAuthenticated()) ?
                ("<a href='/user/" + req.user.username + "'>" + req.user.username + "</a> (<a href='/logout'>Log Out</a>)")
                : ("<a href='/auth/github'>Log in with GitHub</a>");
    var requestedUser = req.params.userName;

    // store return path in case of login
    req.session.returnTo = req.originalUrl;

    req.db.get('user').findOne({nickname: requestedUser}, "-_id")
        .then(function (json) {
            if(json) {
                var context = {
                    username: json.name,
                    nickname: json.nickname,
                    joined: dateFormat(json.joined, "dddd d mmm yyyy, HH:MM"),
                    avatar: json.avatarURL,
                    title: requestedUser,
                    userInfo: JSON.stringify(json),
                    tab: req.query.tab||"mri",
                    login: login
                };
                res.render('user', context);
            } else {
                res.status(404).send("User Not Found");
            }
        })
        .catch(function(err) {
            console.log("ERROR:", err);
            res.status(400).send("Error");
        });
};

var apiUser = function(req, res) {
    req.db.get('user').findOne({nickname: req.params.userName, backup: {$exists: false}}, "-_id")
        .then(function (json) {
            if (json) {
                if (req.query.var) {
                    const arr = req.query.var.split("/");
                    for (const i in arr) {
                        if({}.hasOwnProperty.call(arr, i)) {
                            json = json[arr[i]];
                        }
                    }
                }
                res.send(json);
            } else {
                res.send();
            }
        });
};

var apiUserAll = function(req, res) {
    if(!req.query.page) {
        res.json({error:"Provide the parameter 'page'"});

        return;
    }

    var page = parseInt(req.query.page);
    var nItemsPerPage = 20;

    req.db.get('user').find({backup: {$exists: false}}, {skip: page*nItemsPerPage, limit: nItemsPerPage, fields:{_id:0}})
    .then(function (json) {
        res.send(json.map(function(o) {
            return o.nickname;
        }));
    });
};


/**
 * @function apiUserFiles
 * @param {Object} req Request object
 * @param {Object} res Response object
 * @returns {Object} Object with a list of user mri files
 */
var apiUserFiles = function(req, res) {
    // @todo Check access rights for this route
    var {userName} = req.params;
    var start = parseInt(req.query.start);
    var length = parseInt(req.query.length);

    console.log("userName:", userName, "start:", start, "length:", length);
    dataSlices.getUserFilesSlice(req, userName, start, length)
    .then(function(result) {
        res.send(result);
    })
    .catch(function(err) {
        console.log("ERROR:", err);
        res.send({success:false, list:[]});
    });
};

/**
 * @function apiUserAtlas
 * @param {Object} req Request object
 * @param {Object} res Response object
 * @returns {Object} Object with a list of user atlases
 */
var apiUserAtlas = function(req, res) {
    // @todo Check access rights for this route
    var {userName} = req.params;
    var start = parseInt(req.query.start);
    var length = parseInt(req.query.length);

    console.log("userName:", userName, "start:", start, "length:", length);
    dataSlices.getUserAtlasSlice(req, userName, start, length)
    .then(function(result) {
        res.send(result);
    })
    .catch(function(err) {
        console.log("ERROR:", err);
        res.send({success:false, list:[]});
    });
};

/**
 * @function apiUserProjects
 * @param {Object} req Request object
 * @param {Object} res Response object
 * @returns {Object} Object with a list of user projects
 */
var apiUserProjects = function(req, res) {
    // @todo Check access rights for this route
    var {userName} = req.params;
    var start = parseInt(req.query.start);
    var length = parseInt(req.query.length);

    console.log("userName:", userName, "start:", start, "length:", length);
    dataSlices.getUserProjectsSlice(req, userName, start, length)
    .then(function(result) {
        res.send(result);
    })
    .catch(function(err) {
        console.log("ERROR:", err);
        res.send({success:false, list:[]});
    });
};

var UserController = function() {
    this.validator = validator;
    this.apiUser = apiUser;
    this.apiUserAll = apiUserAll;
    this.apiUserFiles = apiUserFiles;
    this.apiUserAtlas = apiUserAtlas;
    this.apiUserProjects = apiUserProjects;
    this.user = user;
};

module.exports = new UserController();
