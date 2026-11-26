/* eslint-disable max-lines */
console.log('dataSlices.js');
const dateFormat = require('dateformat');

const { AccessLevel, CURRENT, isAnyoneRow, visitor } = require('neuroweblab');
const BrainboxAccessControlService = require('../../services/BrainboxAccessControlService');

/**
 * @func getUserFilesSlice
 * @desc Get an access-filtered slice of the mri files from a user
 * @param {Object} req Request object
 * @param {String} requestedUser Username of the user whose files are requested
 * @param {integer} start Start index of the file slice
 * @param {integer} length Number of files to include in the slice
 * @returns {Object} user files slice
 */
const getUserFilesSlice = function getUserFilesSlice(req, requestedUser, start, length) {
  console.log('getUserFilesSlice. Start, end:', start, length);
  let loggedUser = 'anonymous';
  if (req.isAuthenticated()) {
    loggedUser = req.user.username;
  }

  return new Promise(function (resolve, reject) {
    Promise.all([
      req.nativeDb.collection('mri')
        .find({ owner: requestedUser, ...CURRENT }, { skip: start, limit: length })
        .toArray(),
      req.nativeDb.collection('project').find({
        $or: [
          { owner: requestedUser },
          { 'collaborators.list': { $elemMatch: { userID: requestedUser } } }
        ],
        ...CURRENT
      })
        .toArray()
    ])
      .then(function (values) {
        const [unfilteredMRI, unfilteredProjects] = values;
        const mri = [];
        const mriFiles = [];

        // filter for view access
        for (const umri of unfilteredMRI) {
          if (BrainboxAccessControlService.hasAccesstoFileIfAllowedBySomeProjects(umri, unfilteredProjects, loggedUser, AccessLevel.VIEW)) {
            mri.push(umri);
          }
        }

        mri.forEach(function (o) {
          const obj = {
            url: o.source,
            name: o.name,
            included: dateFormat(o.included, 'd mmm yyyy, HH:MM')
          };

          if (typeof o.dim !== 'undefined') {
            obj.volDimensions = o.dim.join(' x ');
            mriFiles.push(obj);
          }
        });

        resolve({ success: true, list: mriFiles });
        // if(mri.length>0)
        //     resolve({success:true, list:mriFiles});
        // else
        //     resolve({success:false, list:[]});
      })
      .catch(function (err) {
        console.log('ERROR:', err);
        reject(err);
      });
  });
};

/**
 * @func getUserAtlasSlice
 * @desc Get an access-filtered slice of the atlas from a user
 * @param {Object} req request object
 * @param {String} requestedUser Username of the user whose files are requested
 * @param {integer} start Start index of the file slice
 * @param {integer} length Number of files to include in the slice
 * @returns {Object} user atlas slice
 */
const getUserAtlasSlice = function getUserAtlasSlice(req, requestedUser, start, length) {
  let loggedUser = 'anonymous';
  if (req.isAuthenticated()) {
    loggedUser = req.user.username;
  }

  return new Promise(function (resolve, reject) {
    Promise.all([
      req.nativeDb.collection('mri')
        .find({ 'mri.atlas': { $elemMatch: { owner: requestedUser } }, ...CURRENT }, { skip: start, limit: length })
        .toArray(),
      req.nativeDb.collection('project').find({
        $or: [
          { owner: requestedUser },
          { 'collaborators.list': { $elemMatch: { userID: requestedUser } } }
        ],
        ...CURRENT
      })
        .toArray()
    ])
      .then(function (values) {
        const [unfilteredAtlas, unfilteredProjects] = values;
        const atlas = [];
        const atlasFiles = [];

        // filter for view access
        for (const ua of unfilteredAtlas) {
          if (BrainboxAccessControlService.hasAccesstoFileIfAllowedBySomeProjects(ua, unfilteredProjects, loggedUser, AccessLevel.VIEW)) {
            atlas.push(ua);
          }
        }

        atlas.forEach(function (o) {
          for (const a of o.mri.atlas) {
            atlasFiles.push({
              url: o.source,
              parentName: o.name,
              name: a.name || '',
              project: a.project || '',
              projectURL: '/project/' + a.project || '',
              modified: dateFormat(a.modified, 'd mmm yyyy, HH:MM')
            });
          }
        });

        resolve({ success: true, list: atlasFiles });
        // if(atlas.length>0)
        //     resolve({success:true, list:atlasFiles});
        // else
        //     resolve({success:false, list:[]});
      })
      .catch(function (err) {
        console.log('ERROR:', err);
        reject(err);
      });
  });
};

/**
 * The number of collaborator rows a user may see: every row with `collaborators: view`, else only
 * the 'anyone' row (NWL isAnyoneRow), as the project JSON route shows them (NWL visibleProject; shared suite 3.5)
 * @param {Object} project The stored project
 * @param {string} loggedUser The user's name, or 'anonymous'
 * @returns {number} The number of rows
 */
const visibleCollaborators = (project, loggedUser) => {
  const { list } = project.collaborators;

  return BrainboxAccessControlService.canViewCollaborators(project, loggedUser)
    ? list.length
    : list.filter(isAnyoneRow).length;
};

/**
 * The visitor of a request: the logged user's name, or 'anonymous'
 * @param {Object} req The request
 * @returns {string} The username, or 'anonymous'
 */
const visitorOf = (req) => visitor(req) || 'anonymous';

/**
 * @func projectFileEntries
 * @desc What GET /project/json/:projectName/files answers for a slice of a project's files: the
 * `entries` of NeuroWebLab's projectFilesRoute (1.17.0, T002 M10), which reads the project, checks
 * the view right and slices `files.list`. One query reads the slice's `mri` documents; a file
 * without one (probably not yet downloaded) is `{source, name: ''}`
 * @param {Object} req The request
 * @param {Object} project The current version of the project
 * @param {Array<string>} sources The slice of the project's `files.list`
 * @param {Object} [options] Options
 * @param {boolean} [options.names] Only `{source, name}` for each file, `name` a string ('' for
 *   an `mri` document without one); else the whole `mri` document, its annotations' access set
 *   for the visitor by the project
 * @returns {Promise<Array>} The entries, in the order of the slice
 */
const projectFileEntries = async (req, project, sources, { names = false } = {}) => {
  const requester = visitorOf(req);

  // a single query for the whole slice (mri.source is indexed, see app.js)
  const mris = await req.nativeDb.collection('mri')
    .find(
      { source: { $in: sources }, ...CURRENT },
      { projection: names ? { _id: 0, source: 1, name: 1 } : { _id: 0 } }
    )
    .toArray();
  const mriBySource = new Map(mris.map((mri) => [mri.source, mri]));

  return sources.map((source) => {
    const mri = mriBySource.get(source);
    if (!mri) {
      return { source, name: '' };
    }
    if (names) {
      return { source: mri.source, name: typeof mri.name === 'string' ? mri.name : '' };
    }
    BrainboxAccessControlService.setVolumeAnnotationsAccessByProjects(mri, [project], requester);

    return mri;
  });
};

/**
 * @func getFilesSlice
 * @desc Get an access-filtered slice of all mri files
 * @param {Object} req request object
 * @param {integer} start Start index of the file slice
 * @param {integer} length Number of files to include in the slice
 * @returns {Object} files slice
 */
const getFilesSlice = function getFilesSlice(req, start, length) {
  let loggedUser = 'anonymous';
  if (req.isAuthenticated()) {
    loggedUser = req.user.username;
  }

  return new Promise(function (resolve, reject) {
    Promise.all([
      req.nativeDb.collection('mri')
        .find({ ...CURRENT }, { projection: { source: 1, _id: 0 }, skip: start, limit: length })
        .toArray(),
      req.nativeDb.collection('project').find({ ...CURRENT })
        .toArray()
    ])
      .then(function (values) {
        const [unfilteredMRI, unfilteredProjects] = values,
          mri = [];
        let mriFiles = [];

        // filter for view access
        for (let i = 0; i < unfilteredMRI.length; i++) {
          if (BrainboxAccessControlService.hasAccesstoFileIfAllowedBySomeProjects(unfilteredMRI[i], unfilteredProjects, loggedUser, AccessLevel.VIEW)) {
            mri.push(unfilteredMRI[i]);
          }
        }

        mri.forEach(function (o) {
          mriFiles.push(o.source);
        });

        // constrain start and length to available data
        start = Math.min(start, mriFiles.length);
        length = Math.min(length, mriFiles.length - start);
        mriFiles = mriFiles.slice(start, start + length);

        resolve(mriFiles);
      })
      .catch(function (err) {
        console.log('ERROR:', err);
        reject(err);
      });
  });
};

/**
 * @func projectRow
 * @desc The row GET /project/json answers for a project: the `row` of NeuroWebLab's
 * projectListRoute (1.17.0, T002 M10), which reads every current project (with its default
 * projection), keeps the ones the visitor may view the files of, then pages them
 * @param {Object} req The request
 * @param {Object} project A current project, as projected
 * @returns {Object} {project, projectName, numFiles, numCollaborators, owner}
 */
const projectRow = (req, project) => ({
  project: project.shortname,
  projectName: project.name,
  numFiles: project.files.list.length,
  numCollaborators: visibleCollaborators(project, visitorOf(req)),
  owner: project.owner
});

/**
 * @func userProjectRow
 * @desc The row GET /user/json/:userName/projects answers for a project: the `rows` of
 * NeuroWebLab's userProjectsRoute (1.22.0, T002 M15), which reads the user's current projects
 * (owned, or with a collaborator row naming the user by userID, username or nickname), keeps
 * the ones the visitor may view the files of, then slices them. A project without a files list
 * counts 0 files
 * @param {Object} project A current project the visitor may view the files of
 * @param {string} loggedUser The visitor, or 'anonymous'
 * @returns {Object} {project, projectName, projectURL, numFiles, numCollaborators, owner, modified}
 */
const userProjectRow = (project, loggedUser) => ({
  project: project.shortname,
  projectName: project.name,
  projectURL: project.brainboxURL,
  numFiles: project.files && Array.isArray(project.files.list) ? project.files.list.length : 0,
  numCollaborators: visibleCollaborators(project, loggedUser),
  owner: project.owner,
  // the stored ISO date: the user page formats it, and sorts by it
  modified: project.modified
});

const DataSlices = function () {
  this.getUserFilesSlice = getUserFilesSlice;
  this.getUserAtlasSlice = getUserAtlasSlice;
  this.getFilesSlice = getFilesSlice;
  this.projectFileEntries = projectFileEntries;
  this.projectRow = projectRow;
  this.userProjectRow = userProjectRow;
};

module.exports = new DataSlices();
