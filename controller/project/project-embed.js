/**
 * GET /project/:projectName/embed: what nwl-components' "Embed Project" button
 * frames (ProjectInfo.vue: `<iframe src="…/project/<shortname>/embed">`). It
 * had no route, so the snippet showed a 404 (2026-11-15).
 *
 * It answers with the embed of the project's first MRI, `/mri/embed?url&project`
 * (mri.controller.js mriEmbed), as microdraw's same route does with its first
 * dataset (app/controller/embed/embed.controller.js projectEmbed). The access
 * check is mriEmbed's (mayEmbedMri), done before redirecting, so that a
 * project the visitor may not see never gives away its file's URL: the embed
 * error page instead.
 */
const { getRelatedProjects, mayEmbedMri } = require('../mri/mri-access');

const embedError = (res, status, message) => {
  res.status(status);
  res.render('embedError', { message });
};

// The first file of a project's list (strings, or {source} objects)
const firstSource = (project) => {
  const list = (project.files && Array.isArray(project.files.list)) ? project.files.list : [];

  return list.map((f) => (typeof f === 'string' ? f : f && f.source))
    .find((s) => typeof s === 'string' && s.length > 0) || null;
};

/**
 * @function projectEmbed
 * @param {Object} req Express request
 * @param {Object} res Express response
 * @returns {Promise<void>} Once answered
 */
// eslint-disable-next-line max-statements
const projectEmbed = async function (req, res) {
  // framed by other sites, as /mri/embed
  res.set('Content-Security-Policy', 'frame-ancestors *');
  try {
    const loggedUser = req.isAuthenticated() ? req.user.username : 'anonymous';
    const project = await req.nativeDb.collection('project')
      .findOne({ shortname: req.params.projectName, backup: { $exists: false } }, { projection: { _id: 0 } });
    if (!project) {
      embedError(res, 404, 'This project could not be found.');

      return;
    }
    const source = firstSource(project);
    const json = source && await req.nativeDb.collection('mri')
      .findOne({ source, backup: { $exists: false } }, { projection: { _id: 0 } });
    if (!json) {
      embedError(res, 404, 'This project has no brain to show.');

      return;
    }
    const projects = await getRelatedProjects(req.nativeDb, json, source);
    if (!mayEmbedMri(json, projects, loggedUser)) {
      embedError(res, 403, 'This content is private.');

      return;
    }
    const query = new URLSearchParams({ url: source, project: project.shortname });
    res.redirect(302, `/mri/embed?${query.toString()}`);
  } catch (err) {
    console.log('ERROR projectEmbed:', err);
    embedError(res, 500, 'This project could not be shown.');
  }
};

module.exports = { projectEmbed, firstSource };
