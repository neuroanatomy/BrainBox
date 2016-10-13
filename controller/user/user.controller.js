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
    var loggedUser = req.isAuthenticated()?req.user.username:"anonymous";
    req.db.get('user').findOne({nickname: requestedUser}, "-_id")
        .then(function (json) {
            if(json) {
                // gather user information on mri, atlas and projects
                Promise.all([
                    req.db.get('mri').find({owner: requestedUser, backup: {$exists: false}}),
                    req.db.get('mri').find({"mri.atlas": {$elemMatch: {owner: requestedUser}}, backup: {$exists: false}}),
                    req.db.get('project').find({
                        $or: [
                            {owner: requestedUser},
                            {"collaborators.list": requestedUser}
                        ],
                        backup: {$exists: false}
                    })
                ]).then(function(values) {
                    var i,
                        unfilteredMRI = values[0],
                        unfilteredAtlas = values[1],
                        unfilteredProjects = values[2],
                        mri = [], atlas = [], projects = [];
                    
                    // filter for view access
                    for(i in unfilteredMRI)
                        if(checkAccess.toMRI(unfilteredMRI[i],unfilteredProjects,loggedUser,"view"))
                            mri.push(unfilteredMRI[i]);
                    for(i in unfilteredAtlas)
                        if(checkAccess.toMRI(unfilteredAtlas[i],unfilteredProjects,loggedUser,"view"))
                            atlas.push(unfilteredAtlas[i]);
                    for(i in unfilteredProjects)
                        if(checkAccess.toProject(unfilteredProjects[i],loggedUser,"view"))
                            projects.push(unfilteredProjects[i]);
                    console.log(values[0].length-mri.length,"MRIs filtered");
                    console.log(values[1].length-atlas.length,"atlases filtered");
                    console.log(values[2].length-projects.length,"projects filtered");
                    
                    var context = {
                        username: json.name,
                        nickname: json.nickname,
                        joined: dateFormat(json.joined, "dddd d mmm yyyy, HH:MM"),
                        avatar: json.avatarURL,
                        title: requestedUser,
                        userInfo: JSON.stringify(json),
                        login: login,
                        atlasFiles: []
                    };
                    context.MRIFiles = mri.map(function (o) {
                        return {
                            url: o.source,
                            name: o.name,
                            included: dateFormat(o.included, "d mmm yyyy, HH:MM"),
                            volDimensions: o.dim.join(" x ")
                        };
                    });
                    atlas.map(function (o) {
                        var i;
                        console.log("WARNING: THE APPROPRIATE projectURL HAS TO BE SETUP");
                        for (i in o.mri.atlas) {
                            context.atlasFiles.push({
                                url: o.source,
                                parentName: o.name,
                                name: o.mri.atlas[i].name,
                                project: o.mri.atlas[i].project,
                                projectURL: '/project/braincatalogue',
                                modified: dateFormat(o.mri.atlas[i].modified, "d mmm yyyy, HH:MM")
                            });
                        }
                    });
                    context.projects = projects.map(function (o) {return {
                        project: o.name,
                        projectURL: o.brainboxURL,
                        numFiles: o.files.list.length,
                        numCollaborators: o.collaborators.length,
                        owner: o.owner,
                        modified: dateFormat(o.modified, "d mmm yyyy, HH:MM")
                    }; });
                    context.numMRI = context.MRIFiles.length;
                    context.numAtlas = context.atlasFiles.length;
                    context.numProjects = context.projects.length;
 
                    res.render('user',context);                    
                }).catch(function(err) {
                    console.log("ERROR Cannot get user information:",err);
                });
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

var userController = function(){
	this.validator = validator;
	this.api_user = api_user;
	this.user = user;
}

module.exports = new userController();