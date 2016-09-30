var async = require("async");
var dateFormat = require('dateformat');

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

var accessLevels=["none","view","edit","add","remove"];

var checkAccessToMRI = function checkAccessToMRI(mri, projects, user, access) {
    var p, requestedLevel = accessLevels.indexOf(access);
    
    for(p in projects) {
        if(projects[p].files.list.indexOf(mri.source)>=0) {
            console.log(mri.source,user,access,projects[p].files.list.indexOf(mri.source));
            var publicLevel = accessLevels.indexOf(projects[p].files.access.public);
            var c, collaborators;
            
            // check if user has owner access
            if(user === projects[p].files.access.owner) {
                continue;
            }
            
            // check if user has collaborator access
            var accessOk = false;
            collaborators=projects[p].files.access.whitelist;
            for(c in collaborators) {
                if(collaborators[c].userId === user) {
                    var collaboratorAccessLevel = accessLevels.indexOf(collaborators[c].access);
                    if(requestedLevel>collaboratorAccessLevel) {
                        console.log("Collaborator access refused from project",projects[p].shortname);
                        return false;
                    } else {
                        accessOk = true;
                    }
                    break;
                }
            }
            if(accessOk) {
                continue;
            }

            // check if user has public access
            if(requestedLevel>publicLevel) {
                console.log("Public access refused from project",projects[p].shortname);
                return false;
            }
        }
    }
    
    return true;
}
var checkAccessToProject = function checkAccessToProject(project, user, access) {
    var p, requestedLevel = accessLevels.indexOf(access);
    
    var publicLevel = accessLevels.indexOf(project.files.access.public);
    var c, collaborators;
    
    // check if user has owner access
    if(user === project.files.access.owner) {
        return true;
    }
    
    // check if user has collaborator access
    collaborators=project.files.access.whitelist;
    for(c in collaborators) {
        if(collaborators[c].userId === user) {
            var collaboratorAccessLevel = accessLevels.indexOf(collaborators[c].access);
            if(requestedLevel>collaboratorAccessLevel) {
                console.log("Collaborator access refused to project",project.shortname);
                return false;
            } else {
                return true;
            }
        }
    }

    // check if user has public access
    if(requestedLevel>publicLevel) {
        console.log("Public access refused to project",project.shortname);
        return false;
    }
    
    return true;
}

var newProject = function(req, res) {
    var login = (req.isAuthenticated()) ?
                ("<a href='/user/" + req.user.username + "'>" + req.user.username + "</a> (<a href='/logout'>Log Out</a>)")
                : ("<a href='/auth/github'>Log in with GitHub</a>");
    var loggedUser = req.isAuthenticated()?req.user.username:"anonymous";

	req.db.get('project').findOne({shortname:req.params.projectName},"-_id")
	.then(function(json) {
		if(!json) {
		    json = {
                    name: "Untitled",
                    shortname: "untitled",
                    url: "http://empty",
                    brainboxURL: "http://brainbox.pasteur.fr/project/untitled",
                    created: (new Date()).toJSON(),
                    owner: loggedUser,
                    collaborators: {
                        access: {
                            owner: loggedUser,
                            public: "edit",
                            whitelist: [{ userId: "katjaq", access: "add"}]
                        },
                        list: ["katjaq"]
                    },
                    files: {
                        access: {
                            owner: loggedUser,
                            public: "edit",
                            whitelist: [{ userId: "katjaq", access: "add"}]
                        },
                        list: ["http://braincatalogue.org/data/Baboon/MRI.nii.gz"]
                    },
                    annotations: {
                        access: {
                            owner: loggedUser,
                            public: "edit",
                            whitelist: [{ userId: "katjaq", access: "add"}]
                        },
                        list: [{ name: "Cerebrum", type: "volume", labelSet: "/labels/foreground.json", display: true }]
                    }
                };
        }

        async.each(
            json.files.list,
            function(item,cb) {
                req.db.get('mri').find({source:item,backup:{$exists:0}},{name:1,_id:0})
                .then(function(obj) {
                    if(obj[0]) {
                        json.files.list[json.files.list.indexOf(item)]={
                            source: item,
                            name: obj[0].name
                        }
                    } else {
                        json.files.list[json.files.list.indexOf(item)]={
                            source: item,
                            name: ""
                        }
                    }
                    cb();
                });
            },
            /**
             * @todo replace the nested async calls
             */
            function() {
                async.each(
                    json.collaborators.list,
                    function(item,cb) {
                        console.log("item",item);
                        req.db.get('user').find({nickname:item,backup:{$exists:0}},{name:1,_id:0})
                        .then(function(obj) {
                            console.log("user",obj);
                            if(obj[0]) {
                                json.collaborators.list[json.collaborators.list.indexOf(item)]={
                                    username: item,
                                    name: obj[0].name
                                }
                            } else {
                                json.files.list[json.files.list.indexOf(item)]={
                                    username: item,
                                    name: ""
                                }
                            }
                            cb();
                        });
                    },
                    function() {
                        var context = {
                            title: "Untitled",
                            projectInfo: JSON.stringify(json),
                            annotations: json.annotations,
                            files: json.files,
                            projectName: "Untitled",
                            login: login
                        };
                        res.render('newProject',context);
                    }
                );
            }
	    );
	});
};



var newProjectController = function(){
	this.validator = validator;
	this.newProject = newProject;
}

module.exports = new newProjectController();