const { AccessControlService, AccessLevel, AccessType } = require('neuroweblab');
const _ = require('lodash');

module.exports = class BrainboxAccessControlService extends AccessControlService {

  // FIXME: test me
  /**
     * Check the access a user has to an MRI file based on a list of projects. The MRI
     * file is only accessible if all project allow it.
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

  // FIXME: test me
  /**
    * Set access to volume annotations
    * @param {Object} mri The mri file
    * @param {Array} projects The projects list
    * @param {Object} user UserIdentifier
    * @returns {void}
    */
  static setAnnotationsAccessByProjects(mri, projects, user) {
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
};

