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
    

    var context = {
        owner: loggedUser,
        collaborators: [
            {username: 'public', name: 'public'},
            {username: 'katjaq', name: 'Katja Heuer'},
            {username: 'r03rt0', name: 'Roberto Toro'}
        ]
    };
    res.render('newProject',context);                    
};



var newProjectController = function(){
	this.validator = validator;
	this.newProject = newProject;
}

module.exports = new newProjectController();