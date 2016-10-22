var accessLevels=["none","view","edit","add","remove"];

/**
 * @func toMRI
 * @desc Check access to MRI based on all projects in which the user is involved. The MRI is accessible unless a project prevents it
 * @param {Object} mri MRI object from the db
 * @param {Array} projects Array of project objects relevant to the access decision
 * @param {Object} user The user whose access is being verified
 * @param {Object} access The access level requested
 */
var toMRI = function(mri, projects, user, access) {
    var p, requestedLevel = accessLevels.indexOf(access);

    for(p in projects) {
        if(projects[p].files.list.indexOf(mri.source)>=0) {
            
            // find 'anyone' user
            var i, anyone, found = false;
            for(i=0;i<projects[p].collaborators.list.length;i++) {
                if(projects[p].collaborators.list[i].userID === 'anyone') {
                    anyone=projects[p].collaborators.list[i];
                    found = true;
                    break;
                }
            }
            if(found === false) {
                console.log("ERROR: required 'anyone' user not found [checkAcces.toMRI]");
                console.log(projects[p].collaborators.list);
            }
            
            // check file access level of 'anyone'
            var publicLevel = accessLevels.indexOf(anyone.access.files);
            var c, collaborators;
        
            // check if user has owner access
            if(user === projects[p].owner) {
                continue;
            }
        
            // check if user has collaborator access
            var accessOk = false;
            // collaborators=projects[p].files.access.whitelist;
            collaborators=projects[p].collaborators.list;
            for(c in collaborators) {
                if(collaborators[c].userId === user) {
                    var collaboratorAccessLevel = accessLevels.indexOf(collaborators[c].access.files);
                    if(requestedLevel>collaboratorAccessLevel) {
                        console.log("WARNING: Collaborator access refused from project",projects[p].shortname);
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
                console.log("WARNING: Public access refused from project",projects[p].shortname);
                return false;
            }
        }
    }

    return true;
};
var toProject = function(project, user, access) {
    var p, requestedLevel = accessLevels.indexOf(access);

    // find 'anyone' user
    var i, anyone, found = false;
    for(i=0;i<project.collaborators.list.length;i++) {
        if(project.collaborators.list[i].userID === 'anyone') {
            anyone=project.collaborators.list[i];
            found = true;
            break;
        }
    }
    if(found === false) {
        console.log("ERROR: required 'anyone' user not found [checkAccess.toProject]");
    }

    // find file access level of 'anyone'
    var publicLevel = accessLevels.indexOf(anyone.access.files);
    var c, collaborators;

    // check if user has owner access
    if(user === project.owner) {
        return true;
    }

    // check if user has collaborator access
    //collaborators=project.files.access.whitelist;
    collaborators=project.collaborators.list;
    for(c in collaborators) {
        if(collaborators[c].userId === user) {
            var collaboratorAccessLevel = accessLevels.indexOf(collaborators[c].access.files);
            if(requestedLevel>collaboratorAccessLevel) {
                console.log("WARNING: Collaborator access refused to project",project.shortname);
                return false;
            } else {
                return true;
            }
        }
    }

    // check if user has public access
    if(requestedLevel>publicLevel) {
        console.log("WARNING: Public access refused to project",project.shortname);
        return false;
    }

    return true;
};

var checkAccess = function () {
    this.toMRI = toMRI;
    this.toProject = toProject;
};

module.exports = new checkAccess();