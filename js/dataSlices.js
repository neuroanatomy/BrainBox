console.log('dataSlices.js');
var dateFormat = require("dateformat");
var checkAccess = require(__dirname+"/checkAccess.js");

/**
 * @func getUserFilesSlice
 * @desc Get an access-filtered slice of the mri files from a user
 * @param {String} requestedUser Username of the user whose files are requested
 * @param {integer} start Start index of the file slice
 * @param {integer} length Number of files to include in the slice
 */
var getUserFilesSlice = function getUserFilesSlice(req,requestedUser,start,length) {
    console.log('getUserFilesSlice');
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
            start = Math.min(start, mriFiles.length);
            length = Math.min(length, mriFiles.length-start);
            mriFiles = mriFiles.slice(start,start+length);

            resolve(mriFiles);
        })
        .catch(function(err) {
            console.log("ERROR:",err);
            reject();
        })
    });
};

/**
 * @func getUserAtlasSlice
 * @desc Get an access-filtered slice of the atlas from a user
 * @param {String} requestedUser Username of the user whose files are requested
 * @param {integer} start Start index of the file slice
 * @param {integer} length Number of files to include in the slice
 */
var getUserAtlasSlice = function getUserAtlasSlice(req,requestedUser,start,length) {
    console.log("getUserAtlasSlice",requestedUser,start,length);

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
            start = Math.min(start, atlasFiles.length);
            length = Math.min(length, atlasFiles.length-start);
            atlasFiles = atlasFiles.slice(start,start+length);

            resolve(atlasFiles);
        })
        .catch(function(err) {
            console.log("ERROR:",err);
            reject();
        })
    });
};

/**
 * @func getUserProjectsSlice
 * @desc Get a slice of the projects from a user
 * @param {String} requestedUser Username of the user whose files are requested
 * @param {integer} start Start index of the file slice
 * @param {integer} length Number of files to include in the slice
 */
var getUserProjectsSlice = function getUserProjectsSlice(req,requestedUser,start,length) {
    console.log("getUserProjectsSlice",start,length);

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
            start = Math.min(start, projects.length);
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
};

/**
 * @func getFilesSlice
 * @desc Get an access-filtered slice of all mri files
 * @param {integer} start Start index of the file slice
 * @param {integer} length Number of files to include in the slice
 */
var getFilesSlice = function getFilesSlice(req,start,length) {
    var loggedUser = req.isAuthenticated()?req.user.username:"anonymous";

	return new Promise(function (resolve, reject) {
        Promise.all([
            req.db.get('mri').find({backup: {$exists: false}},{fields:{source:1,_id:0}}),
            req.db.get('project').find({backup: {$exists: false}})
        ])
        .then(function(values) {
            var unfilteredMRI = values[0],
                unfilteredProjects = values[1],
                mri = [], mriFiles = [], i;

            // filter for view access
            for(i=0;i<unfilteredMRI.length;i++)
                if(checkAccess.toFileByAllProjects(unfilteredMRI[i],unfilteredProjects,loggedUser,"view"))
                    mri.push(unfilteredMRI[i]);

            mri.map(function (o) {
                mriFiles.push(o.source);
            });

            // constrain start and length to available data
            start = Math.min(start, mriFiles.length);
            length = Math.min(length, mriFiles.length-start);
            mriFiles = mriFiles.slice(start,start+length);

            resolve(mriFiles);
        })
        .catch(function(err) {
            console.log("ERROR:",err);
            reject();
        })
    });
};

/**
 * @func getProjectsSlice
 * @desc Get an access-filtered slice of all projects
 * @param {integer} start Start index of the file slice
 * @param {integer} length Number of files to include in the slice
 */
var getProjectsSlice = function getProjectsSlice(req,start,length) {
    console.log("getProjectsSlice",start,length);

    var loggedUser = req.isAuthenticated()?req.user.username:"anonymous";
	return new Promise(function (resolve, reject) {
        req.db.get('project').find({backup: {$exists: false}})
        .then(function(unfilteredProjects) {
            var projects = [];
    
            // filter for view access
            for(i in unfilteredProjects)
                if(checkAccess.toProject(unfilteredProjects[i],loggedUser,"view"))
                    projects.push(unfilteredProjects[i]);

            // constrain start and length to available data
            start = Math.min(start, projects.length);
            length = Math.min(length, projects.length-start);

            projects = projects.slice(start,start+length);
            
            projects = projects.map(function (o) {return {
                project: o.shortname,
                projectName: o.name,
                numFiles: o.files.list.length,
                numCollaborators: o.collaborators.list.length,
                owner: o.owner
            }; });            
            
            resolve(projects);
        })
        .catch(function(err) {
            console.log("ERROR:",err);
            reject();
        })
    });
};

var dataSlices = function () {
    this.getFilesSlice = getFilesSlice;
    this.getProjectsSlice = getProjectsSlice;
    this.getUserFilesSlice = getUserFilesSlice;
    this.getUserAtlasSlice = getUserAtlasSlice;
    this.getUserProjectsSlice = getUserProjectsSlice;
};

module.exports = new dataSlices();