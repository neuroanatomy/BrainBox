var async = require('async');
const url = require('url');
const crypto = require('crypto');
const dateFormat = require('dateformat');
const validatorNPM = require('validator');
var async = require('async');
const checkAccess = require('../../js/checkAccess.js');
const dataSlices = require('../../js/dataSlices.js');

const createDOMPurify = require('dompurify');
const jsdom = require('jsdom');

const window = jsdom.jsdom('', {
    features: {
        FetchExternalResources: false, // Disables resource loading over HTTP / filesystem
        ProcessExternalResources: false // Do not execute JS within script blocks
    }
}).defaultView;
const DOMPurify = createDOMPurify(window);

const validator = function (req, res, next) {
    req.checkParams('projectName', 'incorrect project name').isAlphanumeric();
	// Req.checkQuery('url', 'please enter a valid URL')
	// .isURL();

	// req.checkQuery('var', 'please enter one of the variables that are indicated')
	// .optional()
	// .matches("localpath|filename|source|url|dim|pixdim"); //todo: decent regexp
    const errors = req.validationErrors();
    if (errors) {
        res.send(errors).status(403).end();
    } else {
        return next();
    }
};

/**
 * @func isProjectObject
 * @param {Object} req Express req object
 * @param {Object} res Express res object
 * @param {Object} object Project definition object
 * @todo object.annotations??
 */
const isProjectObject = function (req, res, object) {
    const goodOwner = false;
    const goodCollaborators = false;

    const pr = new Promise((resolve, reject) => {
        let i, k, flag, arr;
        const allowed = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ01234567890.,_- \'–:;'.split('');

        // 1. Synchronous checks
        //----------------------

        // files
        if (object.files) {
            for (k in object.files.list) {
                if (!validatorNPM.isURL(object.files.list[k].source)) {
                    reject({success: false, error: 'Invalid file URL'});
                    return;
                }
                if (!validatorNPM.isWhitelisted(object.files.list[k].name, allowed)) {
                    reject({success: false, error: 'Invalid file name'});
                    return;
                }
            }
        }
        console.log('> files ok');

        // Description
        if (object.description && !validatorNPM.isWhitelisted(object.description, allowed)) {
            reject({success: false, error: 'Invalid project description'});
            return;
            // Delete object.description;
        }
        console.log('> description ok');

        // Name
        if (object.name && !validatorNPM.isWhitelisted(object.name, allowed)) {
            reject({success: false, error: 'Invalid name'});
            return;
            // Delete object.name;
        }
        console.log('> name ok');

        // Check that owner and shortname are present
        if (!object.owner || !object.shortname) {
            reject({success: false, error: 'Invalid owner or project shortname, not present'});
            return;
        }
        console.log('> owner and project shortname present');

        // Check that shortname is alphanumeric
        if (!validatorNPM.isAlphanumeric(object.owner) || !validatorNPM.isAlphanumeric(object.shortname)) {
            reject({success: false, error: 'Invalid owner or project shortname, not alphanumeric'});
            return;
        }
        console.log('> owner and project shortname present');

        // Convenience array for collaborator checks
        arr = object.collaborators.list;

        // Check that the 'anyone' user is present
        flag = false;
        for (i = 0; i < arr.length; i++) {
            if (arr[i].userID === 'anyone') {
                flag = true;
                break;
            }
        }
        if (flag === false) {
            reject({success: false, error: 'User \'anynone\' is not present'});
            return;
        }

        // Check that collaborator's access values are valid
        flag = true;
        for (i = 0; i < arr.length; i++) {
            if (validatorNPM.matches(arr[i].access.collaborators, 'none|view|edit|add|remove') === false) {
                // Console.log("collaborators",arr[i]);
                flag = false;
                break;
            }
            if (validatorNPM.matches(arr[i].access.annotations, 'none|view|edit|add|remove') === false) {
                // Console.log("annotations",arr[i]);
                flag = false;
                break;
            }
            if (validatorNPM.matches(arr[i].access.files, 'none|view|edit|add|remove') === false) {
                // Console.log("files",arr[i]);
                flag = false;
                break;
            }
        }
        if (flag === false) {
            reject({success: false, error: 'Access values are invalid'});
            return;
        }
        console.log('> Access values ok');

        // Check that the list of annotations contains at least 1 volume-type entry
        flag = false;
        for (i = 0; i < object.annotations.list.length; i++) {
            if (object.annotations.list[i].type == 'volume') {
                flag = true;
                break;
            }
        }
        if (flag == false) {
            reject({success: false, error: 'Annotations must contain at least 1 volume-type entry'});
            return;
        }

        // 2. Asynchronous checks
        //-----------------------

        /**
         * @todo Replace the .find calls by .findOne. The check if(val[i].length === 0)
         *       should change to if(val[i])
         */
        arr = [];
        arr.push(req.db.get('user').find({nickname: object.owner}));
        for (i in object.collaborators.list) {
            arr.push(req.db.get('user').find({nickname: object.collaborators.list[i].userID}));
        }
        Promise.all(arr).then(val => {
            let i,
                notFound = false;
            for (i = 0; i < val.length; i++) {
                if (val[i].length === 0) {
                    notFound = true;
                    break;
                }
            }
            if (notFound === true) {
                reject({success: false, error: 'Users are invalid, one or more do not exist'});
                return;
            }

            // All checks are successful, resolve the promisse
            // console.log({success:true,message:"All checks ok. Project object looks valid"});
            resolve(object);
        });
    });

    return pr;
};
/**
 * @function project
 * @desc Render the project page GUI
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 */
const project = function (req, res) {
    const login =	(req.isAuthenticated()) ?
				('<a href=\'/user/' + req.user.username + '\'>' + req.user.username + '</a> (<a href=\'/logout\'>Log Out</a>)') :
				('<a href=\'/auth/github\'>Log in with GitHub</a>');
    let loggedUser = 'anonymous';
    if (req.isAuthenticated()) {
        loggedUser = req.user.username;
    } else
    if (req.isTokenAuthenticated) {
        loggedUser = req.tokenUsername;
    }

    // Store return path in case of login
    req.session.returnTo = req.originalUrl;

    req.db.get('project').findOne({shortname: req.params.projectName, backup: {$exists: 0}}, '-_id')
	.then(json => {
    if (json) {
            // Check that the logged user has access to view this project
        if (checkAccess.toProject(json, loggedUser, 'view') === false) {
            res.status(401).send('Authorization required');
            return;
        }

        json.files.list = [];
        res.render('project', {
            title: json.name,
            projectInfo: JSON.stringify(json),
            projectName: json.name,
            login
        });
    } else {
 			res.status(404).send('Project Not Found');
    }
});
};

/**
 * @function api_project
 * @desc Writes json data for a project
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 * @result A json object with project data
 */
const api_project = function (req, res) {
    let loggedUser = 'anonymous';
    if (req.isAuthenticated()) {
        loggedUser = req.user.username;
    } else
    if (req.isTokenAuthenticated) {
        loggedUser = req.tokenUsername;
    }

    req.db.get('project').findOne({shortname: req.params.projectName, backup: {$exists: 0}}, '-_id')
	.then(json => {
    if (json) {
            // Check that the logged user has access to view this project
        if (checkAccess.toProject(json, loggedUser, 'view') === false) {
            res.status(401).send({error: 'Authorization required'});
            return;
        }

        if (req.query.var) {
            let i,
                arr = req.query.var.split('/');
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
 * @function api_projectAll
 * @desc Writes json data for all project, access-filtered
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 * @result A json object with project data
 */
const api_projectAll = function (req, res) {
    let i, page, nItemsPerPage;
    let loggedUser = 'anonymous';
    if (req.isAuthenticated()) {
        loggedUser = req.user.username;
    } else
    if (req.isTokenAuthenticated) {
        loggedUser = req.tokenUsername;
    }

    if (!req.query.page) {
        res.send({error: 'Specify the \'page\' parameter'});
        return;
    }

    page = Math.max(0, parseInt(req.query.page));
    nItemsPerPage = 20;

    dataSlices.getProjectsSlice(req, page * nItemsPerPage, nItemsPerPage)
    .then(values => {
        res.json(values);
    });
};

/**
 * @function api_projectFiles
 * @desc Writes json data for a slice of project files
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 * @result A json object with project data
 */
const api_projectFiles = function (req, res) {
    const projShortname = req.params.projectName;
    const start = req.query.start;
    const length = req.query.length;
    const namesFlag = req.query.names;

    console.log('projShortname:', projShortname, 'start:', start, 'length:', length, 'namesFlag:', namesFlag);
    dataSlices.getProjectFilesSlice(req, projShortname, start, length, namesFlag)
    .then(list => {
        res.send(list);
    })
    .catch(err => {
        console.log('ERROR:', err);
        res.send();
    });
};

/**
 * @function settings
 * @desc Render the settings page GUI
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 */
const settings = function (req, res) {
    const login = (req.isAuthenticated()) ?
                ('<a href=\'/user/' + req.user.username + '\'>' + req.user.username + '</a> (<a href=\'/logout\'>Log Out</a>)') :
                ('<a href=\'/auth/github\'>Log in with GitHub</a>');
    let loggedUser = 'anonymous';
    if (req.isAuthenticated()) {
        loggedUser = req.user.username;
    } else
    if (req.isTokenAuthenticated) {
        loggedUser = req.tokenUsername;
    }

    // Store return path in case of login
    req.session.returnTo = req.originalUrl;

    req.db.get('project').findOne({shortname: req.params.projectName, backup: {$exists: 0}}, '-_id')
	.then(json => {
    if (json) {
            // Check that the logged user has access to view this project
        if (checkAccess.toProject(json, loggedUser, 'view') === false) {
            res.status(401).send('Authorization required');
            return;
        }
    } else {
		    json = {
        name: '',
        shortname: req.params.projectName,
        url: '',
        brainboxURL: '/project/' + req.params.projectName,
        created: (new Date()).toJSON(),
        owner: loggedUser,
        collaborators: {
            list: [
                {
                    userID: 'anyone',
                    access: {
                        collaborators: 'view',
                        annotations: 'edit',
                        files: 'view'
                    }
                }
            ]
        },
        files: {
            list: []
        },
        annotations: {
            list: []
        }
    };
    }

        // Empty the files.list: it will be filled progressively from the client
    json.files.list = [];

        // Find username and name for each of the collaborators in the project
    let j,
        arr1 = [];
    for (j = 0; j < json.collaborators.list.length; j++) {
        arr1.push(req.db.get('user').findOne({nickname: json.collaborators.list[j].userID, backup: {$exists: 0}}, {name: 1, _id: 0}));
    }
    Promise.all(arr1)
        .then(obj => {
            let j;
            for (j = 0; j < obj.length; j++) {
                json.collaborators.list[j].username = json.collaborators.list[j].userID;
                if (obj[j]) {    // Name found
                    json.collaborators.list[j].name = obj[j].name;
                } else {    // Name not found: set to empty
                    json.collaborators.list[i].name = '';
                }
            }
            const context = {
                projectShortname: json.shortname,
                owner: json.owner,
                projectInfo: JSON.stringify(json),
                login
            };
            res.render('projectSettings', context);
        });
});
};

/**
 * @function newProject
 * @desc Render the page with the GUI for entering a new project
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 */
const newProject = function (req, res) {
    const login = (req.isAuthenticated()) ?
                ('<a href=\'/user/' + req.user.username + '\'>' + req.user.username + '</a> (<a href=\'/logout\'>Log Out</a>)') :
                ('<a href=\'/auth/github\'>Log in with GitHub</a>');
    let loggedUser = 'anonymous';
    if (req.isAuthenticated()) {
        loggedUser = req.user.username;
    } else
    if (req.isTokenAuthenticated) {
        loggedUser = req.tokenUsername;
    }

    // Store return path in case of login
    req.session.returnTo = req.originalUrl;

    if (loggedUser === 'anonymous') {
        var context = {
            title: 'BrainBox: New Project',
            functionality: 'create a new project',
            login
        };
        res.render('askForLogin', context);
    } else {
        var context = {
            title: 'BrainBox: New Project',
            login
        };
        res.render('projectNew', context);
    }
};

function insertMRInames(req, res, list) {
    // Insert MRI names, but only if they don't exist
    for (let i = 0; i < list.length; i++) {
        const name = list[i].name;
        const source = list[i].source;
        const filename = url.parse(source).pathname.split('/').pop();

        // It there's no name, continue to the next mri
        if (!name) {
            continue;
        }

        // Check if the mri entry already exists
        (function (na, so, fi) { // Without a closure, only the last name in the list is used and repeated
            req.db.get('mri').findOne({source: so, backup: {$exists: 0}})
            .then(mri => {
                const hash = crypto.createHash('md5').update(so).digest('hex');

                // If mri exists, and has no name, insert the name
                if (!mri) {
                    mri = {
                        filename: fi,
                        source: so,
                        url: '/data/' + hash + '/',
                        included: (new Date()).toJSON(),
                        owner: req.user.username,
                        mri: {
                            brain: fi,
                            atlas: [{
                                owner: req.user.username,
                                created: (new Date()).toJSON(),
                                modified: (new Date()).toJSON(),
                                type: 'volume',
                                filename: 'Atlas.nii.gz',
                                labels: 'foreground.json'
                            }]
                        }
                    };
                } else {
                    delete mri._id;
                }
                mri.modified = (new Date()).toJSON();
                mri.modifiedBy = req.user.username;

                /* Use this if you want imported names to overwrite existing ones */
                mri.name = na;

                /* Use this if you want imported names to be used only if no previous name exists */
                /*
                if(!mri.name) {
                    mri.name=na;
                }
                */

                // sanitise json
                mri = JSON.parse(DOMPurify.sanitize(JSON.stringify(mri))); // Sanitize works on strings, not objects

                // update and insert
                req.db.get('mri').update({source: mri.source}, {$set: {backup: true}}, {multi: true})
                    .then(() => {
                        req.db.get('mri').insert(mri);
                    });
            });
        })(name, source, filename);
    }
}

/**
 * @function post_project
 * @desc Receives data for creating a new project or updating the settings of an existing one
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 */
const post_project = function (req, res) {
    let loggedUser = 'anonymous';
    if (req.isAuthenticated()) {
        loggedUser = req.user.username;
    } else
    if (req.isTokenAuthenticated) {
        loggedUser = req.tokenUsername;
    }

    if (loggedUser == 'anonymous') {
        console.log('ERROR not Authenticated');
        res.status(403).json({error: 'error', message: 'User not authenticated'});
        return;
    }

    const obj = JSON.parse(DOMPurify.sanitize(req.body.data));
    let k;

    /**
     * @todo Replace .find call by .findOne. if(result.length) should change
     *       to if(result)
     */

    isProjectObject(req, res, obj)
    .then(obj => {
        req.db.get('project').findOne({shortname: obj.shortname, backup: {$exists: false}})
            .then(project => {
                // Update/insert project
                if (project) {
                    // Project exists, save update
                    if (checkAccess.toProject(project, loggedUser, 'edit') == false) {
                        console.log('User does not have edit rights');
                        res.status(403).json({error: 'error', message: 'User does not have edit rights'});
                        return;
                    }
                    console.log('updating...');
                    req.db.get('project').update({shortname: obj.shortname}, {$set: {backup: true}}, {multi: true})
                        .then(() => {
                            obj.modified = (new Date()).toJSON();
                            obj.modifiedBy = req.user.username;
                            req.db.get('project').insert(obj);

                            // Insert MRI names if provided
                            console.log('insert mri names');
                            insertMRInames(req, res, obj.files.list);

                            // Reformat file list
                            console.log('reformat file list');
                            for (k = 0; k < obj.files.list.length; k++) {
                                obj.files.list[k] = obj.files.list[k].source;
                            }

                            console.log('success: true');
                            res.json({success: true, message: 'Project settings updated'});
                        });
                } else {
                    // New project, insert
                    console.log('inserting...');
                    req.db.get('project').insert(obj);

                    console.log('insert mri names');
                    insertMRInames(req, res, obj.files.list);

                    // Reformat file list
                    console.log('reformat file list');
                    for (k = 0; k < obj.files.list.length; k++) {
                        obj.files.list[k] = obj.files.list[k].source;
                    }

                    console.log('success: true');
                    res.json({success: true, message: 'New project inserted'});
                }
            });
    })
    .catch(error => {
        console.log('ERROR', error);
        res.status(300).json({error});
    });
};
/**
 * @function delete_project
 * @desc Delete a project
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 */
const delete_project = function (req, res) {
    let shortname;
    let loggedUser = 'anonymous';
    if (req.isAuthenticated()) {
        loggedUser = req.user.username;
    } else
    if (req.isTokenAuthenticated) {
        loggedUser = req.tokenUsername;
    }

    if (loggedUser == 'anonymous') {
        console.log('The user is not logged in');
        res.json({success: false, message: 'User not authenticated'});
        return;
    }

    shortname = req.params.projectName;
    req.db.get('project').findOne({shortname, backup: {$exists: 0}})
    .then(project => {
        if (project) {
            console.log('>> project does exist');
            if (checkAccess.toProject(project, loggedUser, 'remove') == true) {
                console.log('>> user does have remove rights');

                let query = {},
                    update = {};
                query['mri.annotations.' + shortname] = {$exists: 1};
                query.backup = {$exists: 0};
                update.$unset = {};
                update.$unset['mri.annotations.' + shortname] = '';

                Promise.all([
                    req.db.get('project').remove({_id: project._id, backup: {$exists: false}}),
                    req.db.get('mri').update(query, update, {multi: true}),
                    req.db.get('mri').update({'mri.atlas': {$elemMatch: {project: shortname}}}, {$pull: {'mri.atlas': {project: shortname}}}, {multi: true})
                ])
                .then(() => {
                    console.log('>> project and project-related annotations removed');
                    res.json({success: true, message: 'Project deleted'});
                })
                .catch(err => {
                    console.log('ERROR: cannot remove project or project-related annotations');
                    res.json({success: false, message: 'Unable to delete. Try again later'});
                });
            } else {
                console.log('WARNING: user does not have remove rights');
                res.json({success: false, message: 'The user is not allowed to delete this project'});
            }
        } else {
            console.log('WARNING: project does not exist');
            res.json({success: false, message: 'Unable to delete. Project does not exist in the database'});
        }
    }).catch(err => {
        console.log('ERROR: unable to query the db');
        res.json({success: false, message: 'Unable to delete. Try again later'});
    });
};

const projectController = function () {
    this.validator = validator;
    this.api_projectAll = api_projectAll;
    this.api_project = api_project;
    this.api_projectFiles = api_projectFiles;
    this.project = project;
    this.settings = settings;
    this.newProject = newProject;
    this.post_project = post_project;
    this.delete_project = delete_project;
};

module.exports = new projectController();
