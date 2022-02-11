const { AccessControlService, AccessLevel, AccessType } = require('neuroweblab');
const _ = require('lodash');

module.exports = class BrainboxAccessControlService extends AccessControlService {

  /**
     * Check the access a user has to an MRI file based on a list of projects. The MRI
     * file is only accessible if all projects allow it.
     * @param {Object} mri The file, which is an MRI object from the db
     * @param {Array} projects Array of project objects relevant to the access decision
     * @param {Object} user The user whose access is being decided
     * @param {AccessLevel} requestedAccessLevel The access level requested
     * @returns {boolean} True if the user does have access to the MRI
     */
  static hasAccesstoFileIfAllowedByAllProjects(mri, projects, user, requestedAccessLevel) {
    const projectsContainingFile = projects.filter((project) => project.files.list.indexOf(mri.source)>=0);

    return projectsContainingFile.every((p) => super.hasFilesAccess(requestedAccessLevel, p, user));
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
    const projectsContainingFile = projects.filter((project) => project.files.list.indexOf(mri.source)>=0);

    return projectsContainingFile.some((p) => super.hasFilesAccess(requestedAccessLevel, p, user));
  }

  /**
    * Set access to volume annotations
    * @param {Object} mri The mri file
    * @param {Array} projects The projects list
    * @param {Object} user UserIdentifier
    * @returns {void}
    */
  static setVolumeAnnotationsAccessByProjects(mri, projects, user) {
    const atlas = _.get(mri, 'mri.atlas');
    if(_.isNil(atlas) || _.isEmpty(projects)) {
      return;
    }

    for (const [i, a] of atlas.entries()) {
      const project = projects.find((p) => p.shortname === a.project);
      if (_.isNil(project)) {
        continue;
      }
      const access = super.getUserOrPublicAccessLevel(project, user, AccessType.ANNOTATIONS);
      if (access.isGreaterThan(AccessLevel.NONE)) {
        a.access = access.toString();
      } else {
        atlas.splice(i, 1);
      }
    }
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
