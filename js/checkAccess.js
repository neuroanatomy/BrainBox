var accessLevels=["none","view","edit","add","remove"];

var toMRI = function(mri, projects, user, access) {
    var p, requestedLevel = accessLevels.indexOf(access);

    for(p in projects) {
        if(projects[p].files.list.indexOf(mri.source)>=0) {
            console.log(mri.source,user,access,projects[p].files.list.indexOf(mri.source));
            
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
                console.log("ERROR: require 'anyone' user not found");
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

    // find 'anyone' user
    var i, anyone, found = false;
    console.log("project",JSON.stringify(project));
    console.log("list",project.collaborators.list);
    for(i=0;i<project.collaborators.list.length;i++) {
        if(project.collaborators.list[i].userID === 'anyone') {
            anyone=project.collaborators.list[i];
            found = true;
            break;
        }
    }
    if(found === false) {
        console.log("ERROR: require 'anyone' user not found");
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