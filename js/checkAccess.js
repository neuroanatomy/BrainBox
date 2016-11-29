var accessLevels=["none","view","edit","add","remove"];
var debug = 1;

function traceLog(f, l) {
    if(l==undefined || debug>l)
        console.log("ca> "+(f.name)+" "+(f.caller?(f.caller.name||"annonymous"):"root"));
};

var accessStringToLevel = function accessStringToLevel(string) {
    var level = accessLevels.indexOf(string);
    if( level < 0 )
        level = 0;
    return level;
}
var accessLevelToString = function accessLevelToString(level) {
    level = parseInt(level);
    if(level<0)
        level = 0;
    if(level>=accessLevels.length)
        level = accessLevels.length - 1;
    return accessLevels[level];
}
/**
 * @func toFileByAllProjects
 * @desc Check the access a user has to an MRI file based on a list of projects. The MRI
 *       file is only accessible if all project allow it.
 * @param {Object} mri The file, which is an MRI object from the db
 * @param {Array} projects Array of project objects relevant to the access decision
 * @param {Object} user The user whose access is being decided
 * @param {Object} access The access level requested
 */
var toFileByAllProjects = function toFileByAllProjects(mri, projects, user, access) {
    traceLog(toFileByAllProjects,1);

    var p, requestedLevel = accessLevels.indexOf(access);

    for(p in projects) {
        if(projects[p].files.list.indexOf(mri.source)>=0) {
            
            // verify that the user 'anyone' exists and store their access rights
            var i, anyone, found = false;
            for(i=0;i<projects[p].collaborators.list.length;i++) {
                if(projects[p].collaborators.list[i].userID === 'anyone') {
                    anyone=projects[p].collaborators.list[i];
                    found = true;
                    break;
                }
            }
            if(found === false) {
                console.log("ERROR: required 'anyone' user not found [checkAcces.toFileByAllProjects]");
                console.log("collaborators 51:",projects[p].collaborators.list);
            }
            
            // get file access level of 'anyone'
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
                if(collaborators[c].userID === user) {
                    var collaboratorAccessLevel = accessLevels.indexOf(collaborators[c].access.files);
                    if(requestedLevel>collaboratorAccessLevel) {
                        if(debug>1) console.log("WARNING: Collaborator access refused from project",projects[p].shortname);
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
                if(debug>1) console.log("WARNING: Public access refused from project",projects[p].shortname);
                return false;
            }
        }
    }

    return true;
};
/**
 * @func toFileByOneProject
 * @desc Check the access a user has to an MRI file based on a list of projects. The MRI file
 *       is accessible if at least project allows it.
 * @param {Object} mri MRI object from the db
 * @param {Array} projects Array of project objects relevant to the access decision
 * @param {Object} user The user whose access is being decided
 * @param {Object} access The access level requested
 */
var toFileByOneProject = function toFileByOneProject(mri, projects, user, access) {
    traceLog(toFileByOneProject);

    var p, requestedLevel = accessLevels.indexOf(access);

    for(p in projects) {
        if(projects[p].files.list.indexOf(mri.source)>=0) {
            
            // verify that the user 'anyone' exists and store their access rights
            var i, anyone, found = false;
            for(i=0;i<projects[p].collaborators.list.length;i++) {
                if(projects[p].collaborators.list[i].userID === 'anyone') {
                    anyone=projects[p].collaborators.list[i];
                    found = true;
                    break;
                }
            }
            if(found === false) {
                console.log("ERROR: required 'anyone' user not found [checkAcces.toFileByOneProject]");
                console.log("collaborators 121:",projects[p].collaborators.list);
            }
            
            // get file access level of 'anyone'
            var publicLevel = accessLevels.indexOf(anyone.access.files);
            var c, collaborators;
        
            // check if user has owner access
            if(user === projects[p].owner) {
                console.log("Owner access granted by project",projects[p].shortname);
                return true;
            }
        
            // check if user has collaborator access
            collaborators=projects[p].collaborators.list;
            for(c in collaborators) {
                if(collaborators[c].userID === user) {
                    var collaboratorAccessLevel = accessLevels.indexOf(collaborators[c].access.files);
                    if(requestedLevel <= collaboratorAccessLevel) {
                        console.log("Collaborator access granted by project",projects[p].shortname);
                        return true;
                    }
                }
            }

            // check if user has public access
            if(requestedLevel <= publicLevel) {
                console.log("Public access granted by project",projects[p].shortname);
                return true;
            }
        }
    }

    if(debug>1) console.log("WARNING: No project grants access to MRI");
    return false;
};

/**
 * @func maxAccessToFileByProjects
 * @desc Returns the maximum level of access rights granted to the user based on a list of
 *       projects.
 * @param {Object} mri MRI object from the db
 * @param {Array} projects Array of project objects relevant to the access level computation
 * @param {Object} user The user whose access is being decided
 */
var maxAccessToFileByProjects = function maxAccessToFileByProjects(mri, projects, user) {
    traceLog(maxAccessToFileByProjects);

    var p, maxLevel = 0;

    for(p in projects) {
        if(projects[p].files.list.indexOf(mri.source)>=0) {
            
            // check owner level
            if(user === projects[p].owner) {
                // owner grants the maximum access level
                // no need to look further
                return "remove";
            }

            // check public level
            // verify that user 'anyone' exists and store their access rights
            var i, anyone, found = false;
            for(i=0;i<projects[p].collaborators.list.length;i++) {
                if(projects[p].collaborators.list[i].userID === 'anyone') {
                    anyone=projects[p].collaborators.list[i];
                    found = true;
                    break;
                }
            }
            if(found === false) {
                console.log("ERROR: required 'anyone' user not found [checkAcces.toFileByAllProjects]");
                console.log("collaborators 193:",projects[p].collaborators.list);
            }
            var publicLevel = accessLevels.indexOf(anyone.access.files);
            if(maxLevel < publicLevel ) {
                maxLevel = publicLevel;
            }
        
            // check if user has collaborator access
            var c, collaborators;
            collaborators=projects[p].collaborators.list;
            for(c in collaborators) {
                if(collaborators[c].userID === user) {
                    var collaboratorAccessLevel = accessLevels.indexOf(collaborators[c].access.files);
                    if(maxLevel < collaboratorAccessLevel) {
                        maxLevel = collaboratorAccessLevel;
                    }
                }
            }
        }
    }

    return accessLevels[maxLevel];
};

/**
 * @func mimAccessToFileByProjects
 * @desc Returns the minimum level of access rights granted to the user based on a list of
 *       projects.
 * @param {Object} mri MRI object from the db
 * @param {Array} projects Array of project objects relevant to the access level computation
 * @param {Object} user The user whose access is being decided
 */
var minAccessToFileByProjects = function minAccessToFileByProjects(mri, projects, user) {
    traceLog(minAccessToFileByProjects);

    var p, minLevel = 10;

    for(p in projects) {
        if(projects[p].files.list.indexOf(mri.source)>=0) {
            
            // check owner level
            if(user === projects[p].owner) {
                if(minLevel > accessLevels.indexOf("remove"))
                    minLevel = accessLevels.indexOf("remove");
            }

            // check public level
            // verify that user 'anyone' exists and store their access rights
            var i, anyone, found = false;
            for(i=0;i<projects[p].collaborators.list.length;i++) {
                if(projects[p].collaborators.list[i].userID === 'anyone') {
                    anyone=projects[p].collaborators.list[i];
                    found = true;
                    break;
                }
            }
            if(found === false) {
                console.log("ERROR: required 'anyone' user not found [checkAcces.toFileByAllProjects]");
                console.log("collaborators 251:",projects[p].collaborators.list);
            }
            var publicLevel = accessLevels.indexOf(anyone.access.files);
            if(minLevel > publicLevel ) {
                minLevel = publicLevel;
            }
        
            // check if user has collaborator access
            var c, collaborators;
            collaborators=projects[p].collaborators.list;
            for(c in collaborators) {
                if(collaborators[c].userID === user) {
                    var collaboratorAccessLevel = accessLevels.indexOf(collaborators[c].access.files);
                    if(minLevel > collaboratorAccessLevel) {
                        minLevel = collaboratorAccessLevel;
                    }
                }
            }
        }
    }

    return accessLevels[minLevel];
};

/**
 * @func maxAccessToAnnotationByProjects
 * @desc Returns the maximum level of access rights granted to the user based on a list of
 *       projects.
 * @param {Object} mri MRI object from the db
 * @param {Array} projects Array of project objects relevant to the access level computation
 * @param {Object} user The user whose access is being decided
 */
var maxAccessToFileByProjects = function maxAccessToFileByProjects(mri, projects, user) {
    traceLog(maxAccessToFileByProjects);

    var p, maxLevel = 0;

    for(p in projects) {
        if(projects[p].files.list.indexOf(mri.source)>=0) {
            
            // check owner level
            if(user === projects[p].owner) {
                // owner grants the maximum access level
                // no need to look further
                return "remove";
            }

            // check public level
            // verify that user 'anyone' exists and store their access rights
            var i, anyone, found = false;
            for(i=0;i<projects[p].collaborators.list.length;i++) {
                if(projects[p].collaborators.list[i].userID === 'anyone') {
                    anyone=projects[p].collaborators.list[i];
                    found = true;
                    break;
                }
            }
            if(found === false) {
                console.log("ERROR: required 'anyone' user not found [checkAcces.toFileByAllProjects]");
                console.log("collaborators 310:",projects[p].collaborators.list);
            }
            var publicLevel = accessLevels.indexOf(anyone.access.files);
            if(maxLevel < publicLevel ) {
                maxLevel = publicLevel;
            }
        
            // check if user has collaborator access
            var c, collaborators;
            collaborators=projects[p].collaborators.list;
            for(c in collaborators) {
                if(collaborators[c].userID === user) {
                    var collaboratorAccessLevel = accessLevels.indexOf(collaborators[c].access.files);
                    if(maxLevel < collaboratorAccessLevel) {
                        maxLevel = collaboratorAccessLevel;
                    }
                }
            }
        }
    }

    return accessLevels[maxLevel];
};

var toAnnotationByProject = function toAnnotationByProject(project,user) {
    traceLog(toAnnotationByProject);

    var k, maxAccess = 0;
    
    // owner?
    //console.log(user,project.owner);
    if(user == project.owner) {
        return "remove";
    }
    
    for(k=0;k<project.collaborators.list.length;k++) {
        // collaborator? anyone?
        if( project.collaborators.list[k].userID == user ||
            project.collaborators.list[k].userID == "anyone" ) {
            var level = accessLevels.indexOf(project.collaborators.list[k].access.annotations);
            if(maxAccess < level) {
                maxAccess = level;
            }
        }
    }
    
    // console.log(maxAccess, accessLevels[maxAccess]);
    return accessLevels[maxAccess];
}


var toProject = function toProject(project, user, access) {
    traceLog(toProject);

    console.log("project:",project.shortname);
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
        console.log("access granted: owner");
        return true;
    }

    // check if user has collaborator access
    //collaborators=project.files.access.whitelist;
    collaborators=project.collaborators.list;
    for(c in collaborators) {
        if(collaborators[c].userID === user) {
            var collaboratorAccessLevel = accessLevels.indexOf(collaborators[c].access.files);
            if(requestedLevel>collaboratorAccessLevel) {
                if(debug>1) console.log("WARNING: Collaborator access refused to project",project.shortname);
                return false;
            } else {
                console.log("access granted: collaborator");
                return true;
            }
        }
    }

    // check if user has public access
    if(requestedLevel>publicLevel) {
        if(debug>1) console.log("WARNING: Public access refused to project",project.shortname);
        return false;
    }
    console.log("access granted: anyone");

    return true;
};

/**
 * @func filterAnnotationsByProjects
 * @desc Set access to volume annotations
 */
var filterAnnotationsByProjects = function filterAnnotationsByProjects(mri, projects, user) {
    var i, j;
    if(!mri.mri || !mri.mri.atlas)
        return;
    if(!projects)
        return;
    for(i=mri.mri.atlas.length-1;i>=0;i--) {
        for(j=0;j<projects.length;j++) {
            if(projects[j] && projects[j].shortname == mri.mri.atlas[i].project) {
                var access = toAnnotationByProject(projects[j],user);
                var level = accessStringToLevel(access);
                // check for 'view' access (level > 0)
                if(level > 0) {
                    mri.mri.atlas[i].access = access;
                } else {
                    mri.mri.atlas.splice(i,1);
                }
                break;
            }
        }
    }
};


var checkAccess = function () {
    this.accessStringToLevel = accessStringToLevel;
    this.accessLevelToString = accessLevelToString;
    this.toFileByAllProjects = toFileByAllProjects;
    this.toFileByOneProject = toFileByOneProject;
    this.maxAccessToFileByProjects = maxAccessToFileByProjects;
    this.minAccessToFileByProjects = minAccessToFileByProjects;
    this.toAnnotationByProject = toAnnotationByProject;
    this.toProject = toProject;
    this.filterAnnotationsByProjects = filterAnnotationsByProjects;
};

module.exports = new checkAccess();