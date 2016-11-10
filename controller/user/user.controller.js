var async = require("async");
var dateFormat = require("dateformat");
var checkAccess = require("../../js/checkAccess.js");

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
    getUserFilesSlice(req,userName, start, length)
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
    getUserAtlasSlice(req,userName, start, length)
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
    getUserProjectsSlice(req,userName, start, length)
    .then(function(list) {
        res.send(list);    
    })
    .catch(function(err) {
        res.send();
    });
}

/**
 * @func getUserFilesSlice
 * @desc Get a slice of the mri files from a user
 * @param {String} requestedUser Username of the user whose files are requested
 * @param {integer} start Start index of the file slice
 * @param {integer} length Number of files to include in the slice
 */
function getUserFilesSlice(req,requestedUser,start,length) {
    console.log(requestedUser,start,length);

    var loggedUser = req.isAuthenticated()?req.user.username:"anonymous";

	return new Promise(function (resolve, reject) {
        Promise.all([
            req.db.get('mri').find({owner: requestedUser, backup: {$exists: false}}),
            req.db.get('project').find({
                $or: [
                    {owner: requestedUser},
                    {"collaborators.list": {$elemMatch:{userID:requestedUser}}}
                ],
                backup: {$exists: false}
            })
        ])
        .then(function(values) {
            var unfilteredMRI = values[0],
                unfilteredProjects = values[1],
                mri = [], mriFiles = [];

            // filter for view access
            for(i in unfilteredMRI)
                if(checkAccess.toFileByAllProjects(unfilteredMRI[i],unfilteredProjects,loggedUser,"view"))
                    mri.push(unfilteredMRI[i]);

            mri.map(function (o) {
                var obj = {
                    url: o.source,
                    name: o.name,
                    included: dateFormat(o.included, "d mmm yyyy, HH:MM")
                };
                if(o.dim) {
                    obj.volDimensions = o.dim.join(" x ");
                    mriFiles.push(obj);
                }
            });

            // constrain start and length to available data
            start = Math.min(start, mriFiles.length-1);
            length = Math.min(length, mriFiles.length-start);
            mriFiles = mriFiles.slice(start,start+length);

            resolve(mriFiles);
        })
        .catch(function(err) {
            console.log("ERROR:",err);
            reject();
        })
    });
}

/**
 * @func getUserAtlasSlice
 * @desc Get a slice of the atlas from a user
 * @param {String} requestedUser Username of the user whose files are requested
 * @param {integer} start Start index of the file slice
 * @param {integer} length Number of files to include in the slice
 */
function getUserAtlasSlice(req,requestedUser,start,length) {
    console.log(requestedUser,start,length);

    var loggedUser = req.isAuthenticated()?req.user.username:"anonymous";
	return new Promise(function (resolve, reject) {
        Promise.all([
            req.db.get('mri').find({"mri.atlas": {$elemMatch: {owner: requestedUser}}, backup: {$exists: false}}),
            req.db.get('project').find({
                $or: [
                    {owner: requestedUser},
                    {"collaborators.list": {$elemMatch:{userID:requestedUser}}}
                ],
                backup: {$exists: false}
            })
        ])
        .then(function(values) {
            var unfilteredAtlas = values[0],
                unfilteredProjects = values[1],
                atlas = [], atlasFiles = [];
    
            // filter for view access
            for(i in unfilteredAtlas)
                if(checkAccess.toFileByAllProjects(unfilteredAtlas[i],unfilteredProjects,loggedUser,"view"))
                    atlas.push(unfilteredAtlas[i]);

            atlas.map(function (o) {
                var i;
                for (i in o.mri.atlas) {
                    atlasFiles.push({
                        url: o.source,
                        parentName: o.name,
                        name: o.mri.atlas[i].name||"",
                        project: o.mri.atlas[i].project||"",
                        projectURL: '/project/'+o.mri.atlas[i].project||"",
                        modified: dateFormat(o.mri.atlas[i].modified, "d mmm yyyy, HH:MM")
                    });
                }
            });
            
            // constrain start and length to available data
            start = Math.min(start, atlasFiles.length-1);
            length = Math.min(length, atlasFiles.length-start);
            atlasFiles = atlasFiles.slice(start,start+length);

            resolve(atlasFiles);
        })
        .catch(function(err) {
            console.log("ERROR:",err);
            reject();
        })
    });
}

/**
 * @func getUserProjectsSlice
 * @desc Get a slice of the projects from a user
 * @param {String} requestedUser Username of the user whose files are requested
 * @param {integer} start Start index of the file slice
 * @param {integer} length Number of files to include in the slice
 */
function getUserProjectsSlice(req,requestedUser,start,length) {
    console.log(getUserProjectsSlice,start,length);

    var loggedUser = req.isAuthenticated()?req.user.username:"anonymous";
	return new Promise(function (resolve, reject) {
        req.db.get('project').find({
            $or: [
                {owner: requestedUser},
                {"collaborators.list": {$elemMatch:{userID:requestedUser}}}
            ],
            backup: {$exists: false}
        })
        .then(function(unfilteredProjects) {
            var projects = [];
    
            // filter for view access
            for(i in unfilteredProjects)
                if(checkAccess.toProject(unfilteredProjects[i],loggedUser,"view"))
                    projects.push(unfilteredProjects[i]);

            // constrain start and length to available data
            start = Math.min(start, projects.length-1);
            length = Math.min(length, projects.length-start);

            projects = projects.slice(start,start+length);
            
            projects = projects.map(function (o) {return {
                project: o.shortname,
                projectName: o.name,
                projectURL: o.brainboxURL,
                numFiles: o.files.list.length,
                numCollaborators: o.collaborators.list.length,
                owner: o.owner,
                modified: dateFormat(o.modified, "d mmm yyyy, HH:MM")
            }; });            
            
            resolve(projects);
        })
        .catch(function(err) {
            console.log("ERROR:",err);
            reject();
        })
    });
}

var userController = function(){
	this.validator = validator;
	this.api_user = api_user;
	this.api_userFiles = api_userFiles;
	this.api_userAtlas = api_userAtlas;
	this.api_userProjects = api_userProjects;
	this.user = user;
}

module.exports = new userController();