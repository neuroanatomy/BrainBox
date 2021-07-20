/* eslint-disable prefer-exponentiation-operator */
/* eslint-disable max-lines */
/* eslint-disable no-invalid-this */
/* eslint-disable new-cap */
/* eslint-disable sort-vars */
/* eslint-disable guard-for-in */
/* eslint-disable prefer-promise-reject-errors */
/* eslint-disable array-callback-return */
/* eslint-disable no-undef */
/* eslint-disable prefer-destructuring */
/* eslint-disable valid-jsdoc */
/* eslint-disable no-path-concat */
/* eslint-disable max-lines */
console.log('dataSlices.js');
const dateFormat = require('dateformat');

const checkAccess = require(__dirname + '/../checkAccess/checkAccess.js');

/**
 * @func getUserFilesSlice
 * @desc Get an access-filtered slice of the mri files from a user
 * @param {String} requestedUser Username of the user whose files are requested
 * @param {integer} start Start index of the file slice
 * @param {integer} length Number of files to include in the slice
 */
const getUserFilesSlice = function getUserFilesSlice(req, requestedUser, start, length) {
  console.log('getUserFilesSlice. Start, end:', start, length);
  var loggedUser = "anonymous";
  if(req.isAuthenticated()) {
    loggedUser = req.user.username;
  } else
  if(req.isTokenAuthenticated) {
    loggedUser = req.tokenUsername;
  }

  return new Promise(function (resolve, reject) {
    Promise.all([
      req.db.get('mri')
        .find({owner: requestedUser, backup: {$exists: false}}, {skip:start, limit:length}),
      req.db.get('project').find({
        $or: [
          {owner: requestedUser},
          {"collaborators.list": {$elemMatch:{userID:requestedUser}}}
        ],
        backup: {$exists: false}
      })
    ])
      .then(function(values) {
        const unfilteredMRI = values[0];
        const unfilteredProjects = values[1];
        const mri = [];
        const mriFiles = [];

        // filter for view access
        for(umri of unfilteredMRI) { if(checkAccess.toFileByAllProjects(umri, unfilteredProjects, loggedUser, "view")) { mri.push(umri); } }

        mri.map(function (o) {
          const obj = {
            url: o.source,
            name: o.name,
            included: dateFormat(o.included, "d mmm yyyy, HH:MM")
          };

          if(typeof o.dim !== "undefined") {
            obj.volDimensions = o.dim.join(" x ");
            mriFiles.push(obj);
          }
        });

        resolve({success: true, list: mriFiles});
        // if(mri.length>0)
        //     resolve({success:true, list:mriFiles});
        // else
        //     resolve({success:false, list:[]});
      })
      .catch(function(err) {
        console.log("ERROR:", err);
        reject();
      });
  });
};

/**
 * @func getUserAtlasSlice
 * @desc Get an access-filtered slice of the atlas from a user
 * @param {String} requestedUser Username of the user whose files are requested
 * @param {integer} start Start index of the file slice
 * @param {integer} length Number of files to include in the slice
 */
const getUserAtlasSlice = function getUserAtlasSlice(req, requestedUser, start, length) {
  let loggedUser = "anonymous";
  if(req.isAuthenticated()) {
    loggedUser = req.user.username;
  } else
  if(req.isTokenAuthenticated) {
    loggedUser = req.tokenUsername;
  }

  return new Promise(function (resolve, reject) {
    Promise.all([
      req.db.get('mri')
        .find({"mri.atlas": {$elemMatch: {owner: requestedUser}}, backup: {$exists: false}}, {skip:start, limit:length}),
      req.db.get('project').find({
        $or: [
          {owner: requestedUser},
          {"collaborators.list": {$elemMatch:{userID:requestedUser}}}
        ],
        backup: {$exists: false}
      })
    ])
      .then(function(values) {
        const unfilteredAtlas = values[0];
        const unfilteredProjects = values[1];
        const atlas = [];
        const atlasFiles = [];

        // filter for view access
        for(ua of unfilteredAtlas) { if(checkAccess.toFileByAllProjects(ua, unfilteredProjects, loggedUser, "view")) { atlas.push(ua); } }

        atlas.map(function (o) {
          for (const a in o.mri.atlas) {
            atlasFiles.push({
              url: o.source,
              parentName: o.name,
              name: a.name||"",
              project: o.mri.atlas[i].project||"",
              projectURL: '/project/'+a.project||"",
              modified: dateFormat(a.modified, "d mmm yyyy, HH:MM")
            });
          }
        });

        resolve({success:true, list:atlasFiles});
        // if(atlas.length>0)
        //     resolve({success:true, list:atlasFiles});
        // else
        //     resolve({success:false, list:[]});
      })
      .catch(function(err) {
        console.log("ERROR:", err);
        reject();
      });
  });
};

/**
 * @func getUserProjectsSlice
 * @desc Get a slice of the projects from a user
 * @param {String} requestedUser Username of the user whose files are requested
 * @param {integer} start Start index of the file slice
 * @param {integer} length Number of files to include in the slice
 */
const getUserProjectsSlice = function getUserProjectsSlice(req, requestedUser, start, length) {
  var loggedUser = "anonymous";
  if(req.isAuthenticated()) {
    loggedUser = req.user.username;
  } else
  if(req.isTokenAuthenticated) {
    loggedUser = req.tokenUsername;
  }

  return new Promise(function (resolve, reject) {
    req.db.get('project').find({
      $or: [
        {owner: requestedUser},
        {"collaborators.list": {$elemMatch:{userID:requestedUser}}}
      ],
      backup: {$exists: false}
    }, {skip:start, limit:length})
      .then(function(unfilteredProjects) {
        var projects = [];

        // filter for view access
        for(i in unfilteredProjects) { if(checkAccess.toProject(unfilteredProjects[i], loggedUser, "view")) { projects.push(unfilteredProjects[i]); } }

        projects = projects.map(function (o) {
          return {
            project: o.shortname,
            projectName: o.name,
            projectURL: o.brainboxURL,
            numFiles: o.files.list.length,
            numCollaborators: o.collaborators.list.length,
            owner: o.owner,
            modified: dateFormat(o.modified, "d mmm yyyy, HH:MM")
          };
        });

        if(projects.length>0) { resolve({success:true, list:projects}); } else { resolve({success:false, list:[]}); }
      })
      .catch(function(err) {
        console.log("ERROR:", err);
        reject();
      });
  });
};

/**
 * @func getProjectFilesSlice
 * @desc Get a slice of the mri files in a project
 * @param {String} projectShortname Shortname of the project containing the files
 * @param {integer} start Start index of the file slice
 * @param {integer} length Number of files to include in the slice
 * @param {boolean} namesFlag Whether to append only the name of each MRI or the complete structure
 */
// eslint-disable-next-line max-statements
const getProjectFilesSlice = async (req, projShortname, start, length, namesFlag) => {
  var loggedUser = "anonymous";
  if(req.isAuthenticated()) {
    loggedUser = req.user.username;
  } else
  if(req.isTokenAuthenticated) {
    loggedUser = req.tokenUsername;
  }

  // query project
  let project;
  try {
    project = await req.db.get('project').findOne({shortname:projShortname, backup:{$exists:0}}, "-_id");
  } catch (err) {
    throw new Error(err);
  }

  // return if project is empty
  if (!project) {
    console.log("project is empty");

    return;
  }

  // check access
  if(checkAccess.toProject(project, loggedUser, "view") === false) {
    const msg = `User  ${loggedUser} is not allowed to view project ${projShortname}`;

    return Promise.reject(new Error(msg));
  }

  // query mri info for project files
  const {list} = project.files;
  const arr = [];

  start = Math.min(start, list.length);
  length = Math.min(length, list.length-start);
  for(let i=start; i<start+length; i++) {
    arr.push(req.db.get('mri').findOne({source:list[i], backup:{$exists:0}}, {_id:0}));
  }

  let mris;
  try {
    mris = await Promise.all(arr);
  } catch (err) {
    throw new Error(err);
  }

  const newList = [];
  for(let j=0; j<mris.length; j++) {
    if(mris[j]) {
      // mri file present in DB
      // check j-th mri annotation access
      checkAccess.filterAnnotationsByProjects(mris[j], [project], loggedUser);

      // append to list
      if(typeof namesFlag !== "undefined" && namesFlag === true) {
        newList[j] = {source: mris[j].source, name: mris[j].name};
      } else {
        newList[j] = mris[j];
      }
    } else {
      // mri file not present in DB (probably not yet downloaded)
      newList[j] = {
        source: list[start+j],
        name: ""
      };
    }
  }

  return newList;
};

/**
 * @func getFilesSlice
 * @desc Get an access-filtered slice of all mri files
 * @param {integer} start Start index of the file slice
 * @param {integer} length Number of files to include in the slice
 */
const getFilesSlice = function getFilesSlice(req, start, length) {
  var loggedUser = "anonymous";
  if(req.isAuthenticated()) {
    loggedUser = req.user.username;
  } else
  if(req.isTokenAuthenticated) {
    loggedUser = req.tokenUsername;
  }

  return new Promise(function (resolve, reject) {
    Promise.all([
      req.db.get('mri')
        .find({backup: {$exists: false}}, {fields:{source:1, _id:0}}, {skip:start, limit:length}),
      req.db.get('project').find({backup: {$exists: false}})
    ])
      .then(function(values) {
        var unfilteredMRI = values[0],
          unfilteredProjects = values[1],
          mri = [],
          mriFiles = [],
          i;

        // filter for view access
        for(i=0; i<unfilteredMRI.length; i++) { if(checkAccess.toFileByAllProjects(unfilteredMRI[i], unfilteredProjects, loggedUser, "view")) { mri.push(unfilteredMRI[i]); } }

        mri.map(function (o) {
          mriFiles.push(o.source);
        });

        // constrain start and length to available data
        start = Math.min(start, mriFiles.length);
        length = Math.min(length, mriFiles.length-start);
        mriFiles = mriFiles.slice(start, start+length);

        resolve(mriFiles);
      })
      .catch(function(err) {
        console.log("ERROR:", err);
        reject();
      });
  });
};

/**
 * @func getProjectsSlice
 * @desc Get an access-filtered slice of all projects
 * @param {integer} start Start index of the file slice
 * @param {integer} length Number of files to include in the slice
 */
const getProjectsSlice = function getProjectsSlice(req, start, length) {
  var loggedUser = "anonymous";
  if(req.isAuthenticated()) {
    loggedUser = req.user.username;
  } else
  if(req.isTokenAuthenticated) {
    loggedUser = req.tokenUsername;
  }

  return new Promise(async function (resolve, reject) {
    const unfilteredProjects = await req.db.get('project')
      .find({backup: {$exists: false}}, {skip:start, limit:length})
      .catch(function(err) {
        console.log("ERROR:", err);
        reject();
      });
    var projects = [];

    // filter for view access
    for(i in unfilteredProjects) { if(checkAccess.toProject(unfilteredProjects[i], loggedUser, "view")) { projects.push(unfilteredProjects[i]); } }

    // constrain start and length to available data
    start = Math.min(start, projects.length);
    length = Math.min(length, projects.length-start);

    projects = projects.slice(start, start+length);

    projects = projects.map(function (o) {
      return {
        project: o.shortname,
        projectName: o.name,
        numFiles: o.files.list.length,
        numCollaborators: o.collaborators.list.length,
        owner: o.owner
      };
    });

    resolve(projects);
  });
};

const dataSlices = function () {
  this.getUserFilesSlice = getUserFilesSlice;
  this.getUserAtlasSlice = getUserAtlasSlice;
  this.getUserProjectsSlice = getUserProjectsSlice;
  this.getProjectFilesSlice = getProjectFilesSlice;
  this.getFilesSlice = getFilesSlice;
  this.getProjectsSlice = getProjectsSlice;
};

module.exports = new dataSlices();
