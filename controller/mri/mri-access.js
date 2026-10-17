'use strict';

/**
 * Who may see an MRI over HTTP: its files (the MRI page, /mri/embed,
 * /mri/json) and, within it, the layers and text annotations of each project.
 */
const net = require('net');
const _ = require('lodash');
const { AccessType, AccessLevel } = require('neuroweblab');
const BrainboxAccessControlService = require('../../services/BrainboxAccessControlService');
const { projectAccessLevel, ownsMri } = require('../atlasmakerServer/metadata-save-access');

/**
 * Collect the projects relevant to an MRI's access decisions: the projects
 * referenced by its volume/text annotations, plus any project that lists this
 * MRI's URL among its files.
 * @param {Object} nativeDb Native MongoDB driver database instance
 * @param {Object|null} json The MRI document (null if there is none)
 * @param {string} myurl The MRI's source URL
 * @returns {Promise<Array>} The related project documents
 */
const getRelatedProjects = async function (nativeDb, json, myurl) {
  const prj = new Set();
  const atlas = _.get(json, 'mri.atlas');
  const annotations = _.get(json, 'mri.annotations');

  (Array.isArray(atlas) ? atlas : [])
    .map((a) => a && a.project)
    .filter((p) => !_.isEmpty(p))
    .forEach(prj.add, prj);

  if (!_.isNil(annotations)) {
    Object.keys(annotations).forEach(prj.add, prj);
  }

  const arr = [...prj].map((o) => nativeDb.collection('project').findOne({
    shortname: o,
    backup: { $exists: false }
  }));
  const projects = await Promise.all(arr)
    .catch((err) => {
      console.log('ERROR Cannot get db information:', err);

      return [];
    });

  projects.push(...await nativeDb.collection('project').find({
    $or: [
      { 'files.list': { $eq: myurl } },
      { 'files.list.source': { $eq: myurl } }
    ],
    backup: { $exists: false }
  })
    .toArray());

  return projects;
};

/**
 * Leave out of an MRI document what a user cannot see, as the MRI page does:
 * the layers of the projects whose annotations are hidden from the user (the
 * others get the user's access), and, as GET /mri/json does, their text
 * annotations
 * @param {Object} nativeDb Native MongoDB driver database instance
 * @param {Object} json The MRI document, changed here
 * @param {string} myurl The MRI's source URL
 * @param {string} loggedUser The username, or 'anonymous'
 * @returns {Promise<void>} Once it is filtered
 */
const filterMriForUser = async function (nativeDb, json, myurl, loggedUser) {
  if (json.mri && !json.mri.atlas) {
    json.mri.atlas = [];
  }
  if (!json.mri) {
    return;
  }
  const projects = await getRelatedProjects(nativeDb, json, myurl);
  BrainboxAccessControlService.setVolumeAnnotationsAccessByProjects(json, projects, loggedUser);
  if (_.isPlainObject(json.mri.annotations)) {
    for (const project of projects.filter(_.isObject)) {
      if (project.shortname in json.mri.annotations && projectAccessLevel(project, loggedUser, AccessType.ANNOTATIONS) === 'none') {
        delete json.mri.annotations[project.shortname];
      }
    }
  }
};

const isFilePubliclyVisible = function (projects) {
  return projects.some((project) => BrainboxAccessControlService.canViewFiles(project, 'anyone'));
};

const hasCustomFileViewAccess = function (json, projects, loggedUser) {
  return BrainboxAccessControlService.hasAccesstoFileIfAllowedBySomeProjects(json, projects, loggedUser, AccessLevel.VIEW);
};

/**
 * @param {Object} project A project document (or null)
 * @param {string} source An MRI's source URL
 * @returns {boolean} True if the project lists the MRI among its files
 */
const listsMri = (project, source) => {
  const list = _.get(project, 'files.list');

  return Array.isArray(list) && list.some((f) => f === source || (_.isObject(f) && f.source === source));
};

/**
 * Whether a user owns an MRI document (see ownsMri): is the user named in its
 * `owner` field. An anonymous visitor owns nothing, and nobody owns an MRI an
 * anonymous visitor added
 * @param {Object|null} json The MRI document
 * @param {string|null} loggedUser The server-verified username, or 'anonymous'
 * @returns {boolean} True if the user owns it
 */
const isMriOwner = (json, loggedUser) => ownsMri(json, loggedUser);

/**
 * The owner of an MRI that an anonymous visitor adds: 'ip:' and the visitor's
 * address, so that it is never a username. The address is req.ip, which Express
 * takes from X-Forwarded-For only as far as the proxies it trusts ('trust
 * proxy', app.js) added it, never the header as the client sent it. When req.ip
 * is not an address (a trusted local client sent a value that is not one), the
 * peer's address
 * @param {Object} req The request
 * @returns {string} The owner
 */
const anonymousOwner = (req) => {
  const ip = net.isIP(req.ip || '') ? req.ip : _.get(req, 'socket.remoteAddress');

  return `ip:${ip || 'unknown'}`;
};

/**
 * Whether a user may see an MRI's files. Its owner always may. An MRI that no
 * project lists is public: anyone who has its URL may open it. An MRI that
 * projects list is visible as /mri/embed decides it: if one of the projects
 * relevant to it lets anyone see its files, or one of the projects listing it
 * lets the user see them (several projects: any one is enough)
 * @param {string} source The MRI's source URL
 * @param {Array} projects The projects relevant to it (getRelatedProjects)
 * @param {string} loggedUser The username, or 'anonymous'
 * @param {Object|null} [json] The MRI document (null if there is none)
 * @returns {boolean} True if the user may see the MRI's files
 */
const mayViewMriFiles = function (source, projects, loggedUser, json = null) {
  if (isMriOwner(json, loggedUser) || !projects.some((p) => listsMri(p, source))) {
    return true;
  }

  return isFilePubliclyVisible(projects) || hasCustomFileViewAccess({ source }, projects, loggedUser);
};

/**
 * Whether a user may see an MRI in the embed (/mri/embed, /mri/render3d,
 * /mri/layers): if one of the projects relevant to it lets anyone see its
 * files, or one of the projects listing it lets the user see them, or the user
 * owns it and a project lists it. An MRI that no project lists is not embedded
 * unless a project relevant to it lets anyone see its files
 * @param {Object} json The MRI document
 * @param {Array} projects The projects relevant to it (getRelatedProjects)
 * @param {string} loggedUser The username, or 'anonymous'
 * @returns {boolean} True if the user may see it in the embed
 */
const mayEmbedMri = function (json, projects, loggedUser) {
  if (isFilePubliclyVisible(projects) || hasCustomFileViewAccess(json, projects, loggedUser)) {
    return true;
  }

  return isMriOwner(json, loggedUser) && projects.some((p) => listsMri(p, json.source));
};

/**
 * What /mri/json answers a user who may not see an MRI's files
 * @param {string} loggedUser The username, or 'anonymous'
 * @returns {Object} { success: false, error }
 */
const privateMriError = (loggedUser) => ({
  success: false,
  error: (loggedUser === 'anonymous') ? 'This brain is private, log in if you have access to it' : 'This brain is private'
});

module.exports = {
  getRelatedProjects,
  filterMriForUser,
  isFilePubliclyVisible,
  hasCustomFileViewAccess,
  listsMri,
  isMriOwner,
  anonymousOwner,
  mayViewMriFiles,
  mayEmbedMri,
  privateMriError
};
