var accessLevels=["none","view","edit","add","remove"];

var toMRI = function(mri, projects, user, access) {
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
};
var toProject = function(project, user, access) {
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
};

var checkAccess = function () {
    this.toMRI = toMRI;
    this.toProject = toProject;
};

module.exports = new checkAccess();