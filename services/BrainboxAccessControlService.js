const { AccessControlService, AccessLevel, AccessType } = require('neuroweblab');
const _ = require('lodash');

module.exports = class BrainboxAccessControlService extends AccessControlService {

  /**
   * Whether a user is a logged-out visitor: no server-verified user
   * @param {string|null} user The username, null or 'anonymous'
   * @returns {boolean} True for a logged-out visitor
   */
  static isLoggedOut(user) {
    return typeof user !== 'string' || user === '' || user === 'anonymous';
  }

  /**
   * The access level a user has to a project: 'anyone' is the minimum a named
   * collaborator has, so the higher of their own row and 'anyone' (shared
   * suite 4.2, decided 2026-11-11; NWL's own function takes the own row first).
   * A logged-out visitor never writes annotations: 'anyone' with annotations
   * 'edit' (or more) means any logged-in user, and gives a logged-out visitor
   * 'view' (shared suite 4.4, 2026-11-11)
   * @param {Object} project The project
   * @param {string} user The username, or 'anonymous'
   * @param {string} accessType The access type
   * @returns {AccessLevel} The access level (throws as NWL's when the project has neither row)
   */
  static getUserOrPublicAccessLevel(project, user, accessType) {
    let level = super.getUserOrPublicAccessLevel(project, user, accessType);
    try {
      const publicLevel = super.getUserOrPublicAccessLevel(project, 'anyone', accessType);
      if (publicLevel.isGreaterThan(level)) {
        level = publicLevel;
      }
    } catch (err) {
      // no 'anyone' row: the own row alone
    }
    if (accessType === AccessType.ANNOTATIONS && BrainboxAccessControlService.isLoggedOut(user) &&
      level.isGreaterThan(AccessLevel.VIEW)) {
      return AccessLevel.VIEW;
    }

    return level;
  }

  /**
   * The access a user has to a layer whose access is stored with it (a layer
   * without a project, or whose project is gone): at most 'view' for a
   * logged-out visitor
   * @param {string} access The stored access
   * @param {string|null} user The username, null or 'anonymous'
   * @returns {string} The access
   */
  static storedLayerAccess(access, user) {
    const levels = AccessLevel.values;
    if (BrainboxAccessControlService.isLoggedOut(user) && levels.indexOf(access) > levels.indexOf('view')) {
      return 'view';
    }

    return access;
  }

  /**
     * Check the access a user has to an MRI file based on a list of projects. The MRI
     * file is only accessible if some projects allow it.
     * @param {Object} mri The file, which is an MRI object from the db
     * @param {Array} projects Array of project objects relevant to the access decision
     * @param {Object} user The user whose access is being decided
     * @param {AccessLevel} requestedAccessLevel The access level requested
     * @returns {boolean} True if the user does have access to the MRI
     */
  static hasAccesstoFileIfAllowedBySomeProjects(mri, projects, user, requestedAccessLevel) {
    const projectsContainingFile = projects.filter(
      (project) =>
        _.isObject(project) &&
        (
          project.files.list.indexOf(mri.source) >= 0 ||
          project.files.list.map((file) => file.source).indexOf(mri.source) >= 0
        )
    );

    return projectsContainingFile.some((p) => super.hasFilesAccess(requestedAccessLevel, p, user));
  }

  /**
    * Set the `access` property on volume annotations, to be processed by view.
    * Will remove any layers users shouldn't see.
    * @param {Object} mri The mri file
    * @param {Array} projects The projects list
    * @param {Object} user UserIdentifier
    * @returns {void}
    */
  static setVolumeAnnotationsAccessByProjects(mri, projects, user) {
    const atlas = _.get(mri, 'mri.atlas');
    if (_.isEmpty(atlas)) {
      return;
    }

    const filteredAtlas = atlas.map((a) => {
      const project = (projects || []).filter(_.isObject).find((p) => p.shortname === a.project);
      if (_.isNil(project)) {
        // the stored access; a logged-out visitor only views
        return (_.isObject(a) && _.has(a, 'access')) ? { ...a, access: BrainboxAccessControlService.storedLayerAccess(a.access, user) } : a;
      }
      const access = BrainboxAccessControlService.getUserOrPublicAccessLevel(project, user, AccessType.ANNOTATIONS);
      // console.log('access found', project.shortname, access);
      if (access.isGreaterThan(AccessLevel.NONE)) {
        return {
          ...a,
          access: access.toString()
        };
      }

      return null;

    }).filter(_.isObject);

    mri.mri.atlas = filteredAtlas;
  }

  /*

  There was a bug related to the way the following method was previously defined and most text annotations
  have no access set at all.
  https://github.com/neuroanatomy/BrainBox/blob/0f2672acf4f6dc7d0c94f165b97b1e7478fb7fab/controller/mri/mri.controller.js#L284
  If no migration is run, calling it will prevent most annotations from being displayed.

  /**
    * Set access to text annotations
    * @param {Object} mri The mri file
    * @param {Array} projects The projects list
    * @param {Object} user UserIdentifier
    * @returns {void}
    * /
  static setTextAnnotationsAccessByProjects(mri, projects, user) {
    if (_.isNil(mri.annotations)) {
      return;
    }

    const projectNames = projects.map((p) => p.shortname);
    _.forEach(mri.annotation, (projectName, annotations) => {
      if (!projectNames.includes(projectName)) {
        return true;
      }
      const project = projects.find((p) => p.shortname === projectName);
      _.forEach(annotations, (contents, properties) => {
        const access = BrainboxAccessControlService.getUserOrPublicAccessLevel(project, user, AccessType.ANNOTATIONS);
        if (access.isGreaterThan(AccessLevel.NONE)) {
          properties.access = access.toString();
        } else {
          delete mri.annotations[projectName][contents];
        }

      });
    });
  }
  */

};
