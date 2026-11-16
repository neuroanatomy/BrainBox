/**
 * GET /project/:projectName/embed: what nwl-components' "Embed Project" button
 * frames (ProjectInfo.vue: `<iframe src="…/project/<shortname>/embed">`).
 *
 * NeuroWebLab's projectEmbedRoute (1.12.0) answers with the embed of the
 * project's first MRI, `/mri/embed?url&project` (mri.controller.js mriEmbed).
 * The access check is mriEmbed's (mayEmbedMri), done before redirecting, so
 * that a project the visitor may not see never gives away its file's URL: the
 * embed error page instead.
 */
const { projectEmbedRoute } = require('neuroweblab');
const { getRelatedProjects, mayEmbedMri } = require('../mri/mri-access');

const embedError = (res, status, message) => {
  res.status(status);
  res.render('embedError', { message });
};

const noBrain = { status: 404, message: 'This project has no brain to show.' };

/**
 * @function projectEmbed
 * @param {Object} req Express request
 * @param {Object} res Express response
 * @returns {Promise<void>} Once answered
 */
const projectEmbed = projectEmbedRoute({
  findProject: (req, shortname) => req.nativeDb.collection('project')
    .findOne({ shortname, backup: { $exists: false } }, { projection: { _id: 0 } }),
  mayEmbed: async (req, { source }) => {
    const json = await req.nativeDb.collection('mri')
      .findOne({ source, backup: { $exists: false } }, { projection: { _id: 0 } });
    if (!json) { return noBrain; }
    const projects = await getRelatedProjects(req.nativeDb, json, source);
    const loggedUser = req.isAuthenticated() ? req.user.username : 'anonymous';

    return mayEmbedMri(json, projects, loggedUser) ? { status: 200 } : { status: 403, message: 'This content is private.' };
  },
  embedURL: (url, project) => `/mri/embed?${new URLSearchParams({ url, project }).toString()}`,
  embedError,
  noFilesMessage: noBrain.message,
  serverErrorMessage: 'This project could not be shown.'
});

module.exports = { projectEmbed };
