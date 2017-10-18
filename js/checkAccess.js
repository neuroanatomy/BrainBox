const accessLevels = ['none', 'view', 'edit', 'add', 'remove'];
const debug = 1;

function traceLog(f, l) {
    if (l == undefined || debug > l) {
        console.log('ca> ' + (f.name) + ' ' + (f.caller ? (f.caller.name || 'annonymous') : 'root'));
    }
}

const accessStringToLevel = function accessStringToLevel(string) {
    let level = accessLevels.indexOf(string);
    if (level < 0) {
        level = 0;
    }
    return level;
};
const accessLevelToString = function accessLevelToString(level) {
    level = parseInt(level);
    if (level < 0) {
        level = 0;
    }
    if (level >= accessLevels.length) {
        level = accessLevels.length - 1;
    }
    return accessLevels[level];
};
/**
 * @func toFileByAllProjects
 * @desc Check the access a user has to an MRI file based on a list of projects. The MRI
 *       file is only accessible if all project allow it.
 * @param {Object} mri The file, which is an MRI object from the db
 * @param {Array} projects Array of project objects relevant to the access decision
 * @param {Object} user The user whose access is being decided
 * @param {Object} access The access level requested
 */
const toFileByAllProjects = function toFileByAllProjects(mri, projects, user, access) {
    traceLog(toFileByAllProjects, 1);

    let p,
        requestedLevel = accessLevels.indexOf(access);

    for (p in projects) {
        if (projects[p].files.list.indexOf(mri.source) >= 0) {
            // Verify that the user 'anyone' exists and store their access rights
            var i, anyone,
                found = false;
            for (i = 0; i < projects[p].collaborators.list.length; i++) {
                if (projects[p].collaborators.list[i].userID === 'anyone') {
                    anyone = projects[p].collaborators.list[i];
                    found = true;
                    break;
                }
            }
            if (found === false) {
                console.log('ERROR: required \'anyone\' user not found [checkAcces.toFileByAllProjects]');
                console.log('collaborators 51:', projects[p].collaborators.list);
            }

            // Get file access level of 'anyone'
            const publicLevel = accessLevels.indexOf(anyone.access.files);
            var c, collaborators;

            // Check if user has owner access
            if (user === projects[p].owner) {
                continue;
            }

            // Check if user has collaborator access
            let accessOk = false;
            // Collaborators=projects[p].files.access.whitelist;
            collaborators = projects[p].collaborators.list;
            for (c in collaborators) {
                if (collaborators[c].userID === user) {
                    const collaboratorAccessLevel = accessLevels.indexOf(collaborators[c].access.files);
                    if (requestedLevel > collaboratorAccessLevel) {
                        if (debug > 1) {
                            console.log('WARNING: Collaborator access refused from project', projects[p].shortname);
                        }
                        return false;
                    }
                    accessOk = true;

                    break;
                }
            }
            if (accessOk) {
                continue;
            }

            // Check if user has public access
            if (requestedLevel > publicLevel) {
                if (debug > 1) {
                    console.log('WARNING: Public access refused from project', projects[p].shortname);
                }
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
const toFileByOneProject = function toFileByOneProject(mri, projects, user, access) {
    traceLog(toFileByOneProject);

    let p,
        requestedLevel = accessLevels.indexOf(access);

    for (p in projects) {
        if (projects[p].files.list.indexOf(mri.source) >= 0) {
            // Verify that the user 'anyone' exists and store their access rights
            var i, anyone,
                found = false;
            for (i = 0; i < projects[p].collaborators.list.length; i++) {
                if (projects[p].collaborators.list[i].userID === 'anyone') {
                    anyone = projects[p].collaborators.list[i];
                    found = true;
                    break;
                }
            }
            if (found === false) {
                console.log('ERROR: required \'anyone\' user not found [checkAcces.toFileByOneProject]');
                console.log('collaborators 121:', projects[p].collaborators.list);
            }

            // Get file access level of 'anyone'
            const publicLevel = accessLevels.indexOf(anyone.access.files);
            var c, collaborators;

            // Check if user has owner access
            if (user === projects[p].owner) {
                console.log('Owner access granted by project', projects[p].shortname);
                return true;
            }

            // Check if user has collaborator access
            collaborators = projects[p].collaborators.list;
            for (c in collaborators) {
                if (collaborators[c].userID === user) {
                    const collaboratorAccessLevel = accessLevels.indexOf(collaborators[c].access.files);
                    if (requestedLevel <= collaboratorAccessLevel) {
                        console.log('Collaborator access granted by project', projects[p].shortname);
                        return true;
                    }
                }
            }

            // Check if user has public access
            if (requestedLevel <= publicLevel) {
                console.log('Public access granted by project', projects[p].shortname);
                return true;
            }
        }
    }

    if (debug > 1) {
        console.log('WARNING: No project grants access to MRI');
    }
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

    let p,
        maxLevel = 0;

    for (p in projects) {
        if (projects[p].files.list.indexOf(mri.source) >= 0) {
            // Check owner level
            if (user === projects[p].owner) {
                // Owner grants the maximum access level
                // no need to look further
                return 'remove';
            }

            // Check public level
            // verify that user 'anyone' exists and store their access rights
            var i, anyone,
                found = false;
            for (i = 0; i < projects[p].collaborators.list.length; i++) {
                if (projects[p].collaborators.list[i].userID === 'anyone') {
                    anyone = projects[p].collaborators.list[i];
                    found = true;
                    break;
                }
            }
            if (found === false) {
                console.log('ERROR: required \'anyone\' user not found [checkAcces.toFileByAllProjects]');
                console.log('collaborators 193:', projects[p].collaborators.list);
            }
            const publicLevel = accessLevels.indexOf(anyone.access.files);
            if (maxLevel < publicLevel) {
                maxLevel = publicLevel;
            }

            // Check if user has collaborator access
            var c, collaborators;
            collaborators = projects[p].collaborators.list;
            for (c in collaborators) {
                if (collaborators[c].userID === user) {
                    const collaboratorAccessLevel = accessLevels.indexOf(collaborators[c].access.files);
                    if (maxLevel < collaboratorAccessLevel) {
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
const minAccessToFileByProjects = function minAccessToFileByProjects(mri, projects, user) {
    traceLog(minAccessToFileByProjects);

    let p,
        minLevel = 10;

    for (p in projects) {
        if (projects[p].files.list.indexOf(mri.source) >= 0) {
            // Check owner level
            if (user === projects[p].owner) {
                if (minLevel > accessLevels.indexOf('remove')) {
                    minLevel = accessLevels.indexOf('remove');
                }
            }

            // Check public level
            // verify that user 'anyone' exists and store their access rights
            var i, anyone,
                found = false;
            for (i = 0; i < projects[p].collaborators.list.length; i++) {
                if (projects[p].collaborators.list[i].userID === 'anyone') {
                    anyone = projects[p].collaborators.list[i];
                    found = true;
                    break;
                }
            }
            if (found === false) {
                console.log('ERROR: required \'anyone\' user not found [checkAcces.toFileByAllProjects]');
                console.log('collaborators 251:', projects[p].collaborators.list);
            }
            const publicLevel = accessLevels.indexOf(anyone.access.files);
            if (minLevel > publicLevel) {
                minLevel = publicLevel;
            }

            // Check if user has collaborator access
            var c, collaborators;
            collaborators = projects[p].collaborators.list;
            for (c in collaborators) {
                if (collaborators[c].userID === user) {
                    const collaboratorAccessLevel = accessLevels.indexOf(collaborators[c].access.files);
                    if (minLevel > collaboratorAccessLevel) {
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

    let p,
        maxLevel = 0;

    for (p in projects) {
        if (projects[p].files.list.indexOf(mri.source) >= 0) {
            // Check owner level
            if (user === projects[p].owner) {
                // Owner grants the maximum access level
                // no need to look further
                return 'remove';
            }

            // Check public level
            // verify that user 'anyone' exists and store their access rights
            var i, anyone,
                found = false;
            for (i = 0; i < projects[p].collaborators.list.length; i++) {
                if (projects[p].collaborators.list[i].userID === 'anyone') {
                    anyone = projects[p].collaborators.list[i];
                    found = true;
                    break;
                }
            }
            if (found === false) {
                console.log('ERROR: required \'anyone\' user not found [checkAcces.toFileByAllProjects]');
                console.log('collaborators 310:', projects[p].collaborators.list);
            }
            const publicLevel = accessLevels.indexOf(anyone.access.files);
            if (maxLevel < publicLevel) {
                maxLevel = publicLevel;
            }

            // Check if user has collaborator access
            var c, collaborators;
            collaborators = projects[p].collaborators.list;
            for (c in collaborators) {
                if (collaborators[c].userID === user) {
                    const collaboratorAccessLevel = accessLevels.indexOf(collaborators[c].access.files);
                    if (maxLevel < collaboratorAccessLevel) {
                        maxLevel = collaboratorAccessLevel;
                    }
                }
            }
        }
    }

    return accessLevels[maxLevel];
};

const toAnnotationByProject = function toAnnotationByProject(project, user) {
    traceLog(toAnnotationByProject);

    let k,
        maxAccess = 0;

    // Owner?
    // console.log(user,project.owner);
    if (user == project.owner) {
        return 'remove';
    }

    for (k = 0; k < project.collaborators.list.length; k++) {
        // Collaborator? anyone?
        if (project.collaborators.list[k].userID == user ||
            project.collaborators.list[k].userID == 'anyone') {
            const level = accessLevels.indexOf(project.collaborators.list[k].access.annotations);
            if (maxAccess < level) {
                maxAccess = level;
            }
        }
    }

    // Console.log(maxAccess, accessLevels[maxAccess]);
    return accessLevels[maxAccess];
};

/**
 * @func toProject
 * @desc Check user acces to files in project
 */
/**
 * @todo Instead of toProject this function should be called toProjectFiles, and there
 *       should be toProjectCollaborators and toProjectAnnotations
 */
const toProject = function toProject(project, user, access) {
    traceLog(toProject);

    console.log('project:', project.shortname);
    let p,
        requestedLevel = accessLevels.indexOf(access);

    // Find 'anyone' user
    let i, anyone,
        found = false;
    for (i = 0; i < project.collaborators.list.length; i++) {
        if (project.collaborators.list[i].userID === 'anyone') {
            anyone = project.collaborators.list[i];
            found = true;
            break;
        }
    }
    if (found === false) {
        console.log('ERROR: required \'anyone\' user not found [checkAccess.toProject]');
    }

    // Find file access level of 'anyone'
    const publicLevel = accessLevels.indexOf(anyone.access.files);
    let c, collaborators;

    // Check if user has owner access
    if (user === project.owner) {
        console.log('access granted: owner');
        return true;
    }

    // Check if user has collaborator access
    // collaborators=project.files.access.whitelist;
    collaborators = project.collaborators.list;
    for (c in collaborators) {
        if (collaborators[c].userID === user) {
            const collaboratorAccessLevel = accessLevels.indexOf(collaborators[c].access.files);
            if (requestedLevel > collaboratorAccessLevel) {
                if (debug > 1) {
                    console.log('WARNING: Collaborator access refused to project', project.shortname);
                }
                return false;
            }
            console.log('access granted: collaborator');
            return true;
        }
    }

    // Check if user has public access
    if (requestedLevel > publicLevel) {
        if (debug > 1) {
            console.log('WARNING: Public access refused to project', project.shortname);
        }
        return false;
    }
    console.log('access granted: anyone');

    return true;
};

/**
 * @func filterAnnotationsByProjects
 * @desc Set access to volume annotations
 */
const filterAnnotationsByProjects = function filterAnnotationsByProjects(mri, projects, user) {
    let i, j;
    if (!mri.mri || !mri.mri.atlas) {
        return;
    }
    if (!projects) {
        return;
    }
    for (i = mri.mri.atlas.length - 1; i >= 0; i--) {
        for (j = 0; j < projects.length; j++) {
            if (projects[j] && projects[j].shortname == mri.mri.atlas[i].project) {
                const access = toAnnotationByProject(projects[j], user);
                const level = accessStringToLevel(access);
                // Check for 'view' access (level > 0)
                if (level > 0) {
                    mri.mri.atlas[i].access = access;
                } else {
                    mri.mri.atlas.splice(i, 1);
                }
                break;
            }
        }
    }
};

const checkAccess = function () {
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
