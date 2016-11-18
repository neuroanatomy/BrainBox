var async = require("async");
var dateFormat = require("dateformat");
var checkAccess = require("../../js/checkAccess.js");
var dataSlices = require("../../js/dataSlices.js");

var validator = function(req, res, next) {
	
	// userName can be an ip address (for anonymous users)
	
	/*
	req.checkParams('userName', 'incorrect user name').isAlphanumeric();
	var errors = req.validationErrors();
	console.log(errors);
	if (errors) {
		res.send(errors).status(403).end();
	} else {
		return next();
	}
	*/
	next();
}

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
                res.render('user',context);                    
            } else {
                res.status(404).send("User Not Found");
            }
        })
        .catch(function(err) {
            console.log("ERROR:",err);
            res.status(400).send("Error");
        });
};

var api_user = function(req, res) {
    req.db.get('user').findOne({nickname: req.params.userName, backup: {$exists: false}}, "-_id")
        .then(function (json) {
            if (json) {
                if (req.query.var) {
                    var i, arr = req.query.var.split("/");
                    for (i in arr) {
                        json = json[arr[i]];
                    }
                }
                res.send(json);
            } else {
                res.send();
            }
        });
};

var api_userAll = function(req, res) {
    console.log("api_userAll");
    if(!req.query.page) {
        res.json({error:"The 'pages' parameter has to be specified"});
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
 * @function api_userFiles
 */
/**
 * @todo Check access rights for this route
 */
var api_userFiles = function(req, res) {
    var userName = req.params.userName;
    var start = parseInt(req.query.start);
    var length = parseInt(req.query.length);
    
    console.log("userName:",userName, "start:",start, "length:",length);
    dataSlices.getUserFilesSlice(req,userName, start, length)
    .then(function(list) {
        res.send(list);    
    })
    .catch(function(err) {
        res.send([]);
    });
};
/**
 * @function api_userAtlas
 */
/**
 * @todo Check access rights for this route
 */
var api_userAtlas = function(req, res) {
    var userName = req.params.userName;
    var start = parseInt(req.query.start);
    var length = parseInt(req.query.length);
    
    console.log("userName:",userName, "start:",start, "length:",length);
    dataSlices.getUserAtlasSlice(req,userName, start, length)
    .then(function(list) {
        res.send(list);    
    })
    .catch(function(err) {
        res.send([]);
    });
}
/**
 * @function api_userProjects
 */
/**
 * @todo Check access rights for this route
 */
var api_userProjects = function(req, res) {
    var userName = req.params.userName;
    var start = parseInt(req.query.start);
    var length = parseInt(req.query.length);
    
    console.log("userName:",userName, "start:",start, "length:",length);
    dataSlices.getUserProjectsSlice(req,userName, start, length)
    .then(function(list) {
        res.send(list);    
    })
    .catch(function(err) {
        res.send();
    });
}

var userController = function(){
	this.validator = validator;
	this.api_user = api_user;
	this.api_userAll = api_userAll;
	this.api_userFiles = api_userFiles;
	this.api_userAtlas = api_userAtlas;
	this.api_userProjects = api_userProjects;
	this.user = user;
}

module.exports = new userController();