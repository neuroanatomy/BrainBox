/* eslint-disable max-lines */
/**
 * What a user may change when they save an MRI document over the WebSocket
 * ('saveMetadata' message).
 *
 * The client sends its whole copy of the document, and that copy is filtered
 * by the user's access (a project page leaves out the layers the user cannot
 * see). Replacing the stored document with it would let anyone detach a layer
 * from its project or raise its stored access (and then paint on it), and
 * would delete the layers the user cannot see. So the client's copy is merged
 * into the stored document, keeping what the user may not change:
 *
 * - the MRI's name: its owner, or a user with 'edit' on the files of a project
 *   that lists it;
 * - the MRI's other fields (owner, source, url, filename, dimensions...):
 *   nobody (the server sets modified and modifiedBy);
 * - a layer: its fields if the user may edit it (its project's annotation
 *   access for the user, or, without a project, its stored access, as the
 *   HTTP API gives it; the MRI's owner may edit the layers without a project),
 *   but never its project, filename or owner; the stored access of a layer
 *   without a project only by the MRI's owner (that of a project layer is not
 *   used while the project exists, and is kept);
 * - layers are never removed: those missing from the client's copy are kept;
 * - a new layer: in a project the user can see (it gets the user's access to
 *   the project's annotations and the user as owner), as the project page
 *   creates them for every visitor; without a project, only by the MRI's owner;
 * - text annotations of a project: if the user may edit the project's
 *   annotations; those of a project that does not exist, by the MRI's owner.
 *   They are never removed.
 */
const _ = require('lodash');
const { AccessType } = require('neuroweblab');
const BrainboxAccessControlService = require('../../services/BrainboxAccessControlService');

const accessLevels = ['none', 'view', 'edit', 'add', 'remove'];
const levelIndex = (level) => accessLevels.indexOf(level);
const mayEditLevel = (level) => levelIndex(level) >= levelIndex('edit');

// top-level fields the client may send but not change
const volatileFields = ['modified', 'modifiedBy'];
// a layer's file name: a single path component
const layerFilenamePattern = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

/**
 * Whether a value sent is the one stored: pages send '' for a field that is
 * not set (their tables show it empty)
 * @param {*} storedValue The stored value
 * @param {*} sentValue The value sent
 * @returns {boolean} True if it is no change
 */
const sameValue = (storedValue, sentValue) => {
  const isBlank = (v) => typeof v === 'undefined' || v === null || v === '';

  return _.isEqual(storedValue, sentValue) || (isBlank(storedValue) && isBlank(sentValue));
};

/**
 * A user's access to a project, as the HTTP API gives it
 * @param {object} project The project
 * @param {string|null} username The server-verified username, or null
 * @param {string} accessType AccessType.ANNOTATIONS or AccessType.FILES
 * @returns {string} 'none', 'view', 'edit', 'add' or 'remove'
 */
const projectAccessLevel = (project, username, accessType) => {
  try {
    return BrainboxAccessControlService
      .getUserOrPublicAccessLevel(project, username || 'anonymous', accessType)
      .toString();
  } catch (err) {
    // no collaborator entry for the user nor for 'anyone'
    return 'none';
  }
};

/**
 * The projects that decide what a user may change in an MRI document: those of
 * its layers and text annotations (stored or sent), and those that list it
 * @param {object} nativeDb MongoDB database
 * @param {string} source The MRI's source
 * @param {Array<object>} docs The stored document and the client's
 * @returns {Promise<Map>} shortname -> project
 */
const projectsForMetadata = async (nativeDb, source, docs) => {
  const names = new Set();
  for (const doc of docs) {
    const mri = doc && doc.mri;
    if (mri && Array.isArray(mri.atlas)) {
      mri.atlas.filter((a) => a && typeof a.project === 'string' && a.project !== '').forEach((a) => names.add(a.project));
    }
    if (mri && _.isPlainObject(mri.annotations)) {
      Object.keys(mri.annotations).forEach((name) => names.add(name));
    }
  }
  const projects = await nativeDb.collection('project').find({
    $or: [
      { shortname: { $in: [...names] } },
      { 'files.list': source },
      { 'files.list.source': source }
    ],
    backup: { $exists: false }
  })
    .toArray();

  return new Map(projects.map((p) => [p.shortname, p]));
};

/**
 * Whether a project lists an MRI among its files
 * @param {object} project The project
 * @param {string} source The MRI's source
 * @returns {boolean} True if it does
 */
const projectListsFile = (project, source) => {
  const list = project && project.files && project.files.list;

  return Array.isArray(list) && list.some((f) => f === source || (f && f.source === source));
};

/**
 * Whether a user may change an MRI itself (its name, its image): its owner, or a
 * user who may edit the files of a project that lists it
 * @param {object} params Parameters
 * @param {object} params.stored The stored MRI document
 * @param {string|null} params.username The server-verified username, or null
 * @param {Map} params.projects shortname -> project (see projectsForMetadata)
 * @returns {boolean} True if the user may
 */
const mayChangeMri = ({ stored, username, projects }) => {
  if (!username) {
    return false;
  }

  return stored.owner === username || [...projects.values()].some((p) => projectListsFile(p, stored.source) &&
    mayEditLevel(projectAccessLevel(p, username, AccessType.FILES)));
};

/**
 * The text of a text annotation, to tell a real change from a page that only
 * initialised the entry or updated its date
 * @param {object} entry The annotation
 * @returns {string} Its data, as JSON ('' if it has none)
 */
const annotationData = (entry) => {
  const data = entry && entry.data;

  return (typeof data === 'undefined' || data === null || data === '') ? '' : JSON.stringify(data);
};

/**
 * A user's access to a stored layer, as the HTTP API gives it
 * @param {object} ctx The merge context
 * @param {object} layer The stored layer
 * @returns {object} { project, level }: its project (null if it has none, or
 * if the project does not exist) and the user's access
 */
const storedLayerAccess = (ctx, layer) => {
  const project = (layer.project && ctx.projects.get(layer.project)) || null;
  if (project) {
    return { project, level: projectAccessLevel(project, ctx.username, AccessType.ANNOTATIONS) };
  }

  return { project, level: accessLevels.includes(layer.access) ? layer.access : 'none' };
};

/**
 * The MRI's own fields: only the name may change
 * @param {object} ctx The merge context
 * @param {object} doc The document being built (a copy of the stored one)
 * @param {object} stored The stored document
 * @param {object} incoming The client's copy
 * @returns {void}
 */
const mergeTopLevel = (ctx, doc, stored, incoming) => {
  for (const key of Object.keys(incoming)) {
    if (key === 'mri' || key === '_id' || volatileFields.includes(key) || sameValue(stored[key], incoming[key])) {
      continue;
    }
    if (key === 'name' && ctx.canRename) {
      doc.name = incoming.name;
    } else if (key === 'name') {
      ctx.refuse('name', `${ctx.who} may not rename the MRI`, 'you may not rename this MRI');
    } else {
      // only the owner field is something a page could show and let change
      ctx.refuse(key, `the MRI's ${key} cannot be changed`, `the MRI's ${key} cannot be changed`, key === 'owner');
    }
  }
};

/**
 * A stored layer, with the changes the user may make from the client's copy
 * @param {object} ctx The merge context
 * @param {object} layer The stored layer
 * @param {object} sentLayer The client's copy of it
 * @returns {object} The layer to store
 */
const mergeLayer = (ctx, layer, sentLayer) => {
  const { project, level } = storedLayerAccess(ctx, layer);
  const mayEdit = mayEditLevel(level) || (!project && ctx.isOwner);
  const result = { ...layer };
  const what = `layer '${layer.name}' (${layer.filename})`;
  for (const key of Object.keys(sentLayer)) {
    if (sameValue(layer[key], sentLayer[key]) || (key === 'access' && project)) {
      // a page sends the user's own access to a project layer: the project decides
      continue;
    }
    if (key === 'access' && ctx.isOwner && accessLevels.includes(sentLayer.access)) {
      result.access = sentLayer.access;
    } else if (key === 'access') {
      ctx.refuse(`${what}.access`, `${ctx.who} may not change the access of ${what}`, `you may not change who can edit the layer '${layer.name}'`);
    } else if (key === 'project' || key === 'owner') {
      ctx.refuse(`${what}.${key}`, `the ${key} of ${what} cannot be changed`, `the ${key} of the layer '${layer.name}' cannot be changed`);
    } else if (mayEdit) {
      result[key] = sentLayer[key];
    } else {
      ctx.refuse(`${what}.${key}`, `${ctx.who} has '${level}' access to ${what}`, `your access to the layer '${layer.name}' is '${level}'`);
    }
  }

  return result;
};

/**
 * A layer the client's copy adds, as it may be stored, if the user may add it
 * @param {object} ctx The merge context
 * @param {object} layer The new layer
 * @returns {object|null} The layer to store, or null
 */
// eslint-disable-next-line max-statements
const newLayer = (ctx, layer) => {
  const { name } = layer;
  if (!layer.project) {
    if (ctx.isOwner) {
      return { ...layer };
    }
    ctx.refuse('mri.atlas', `${ctx.who} may not add a layer without a project`, 'only the owner of this MRI can add a layer that is not in a project');

    return null;
  }
  const project = ctx.projects.get(layer.project);
  if (!project) {
    ctx.refuse('mri.atlas', `no project '${layer.project}' for a new layer '${name}'`, `there is no project '${layer.project}'`);

    return null;
  }
  const level = projectAccessLevel(project, ctx.username, AccessType.ANNOTATIONS);
  if (level === 'none') {
    // a project page creates it for a user who cannot see its annotations
    ctx.refuse('mri.atlas', `${ctx.who} has no access to the annotations of ${layer.project}`, `you cannot add layers to the project '${layer.project}'`, false);

    return null;
  }
  if (levelIndex(layer.access) > levelIndex(level)) {
    ctx.refuse(`layer '${name}' (${layer.filename}).access`, `${ctx.who} has '${level}' access to ${layer.project}, not '${layer.access}'`,
      `your access to the project '${layer.project}' is '${level}'`);
  }

  return { ...layer, access: level, owner: ctx.who };
};

/**
 * The layers: the stored ones, with the changes the user may make, and the new
 * ones the user may add. None is removed
 * @param {object} ctx The merge context
 * @param {Array} storedLayers The stored layers
 * @param {Array} sentLayers The client's layers
 * @returns {Array} The layers to store
 */
// eslint-disable-next-line max-statements
const mergeLayers = (ctx, storedLayers, sentLayers) => {
  const sent = new Map();
  for (const layer of sentLayers) {
    if (layer && typeof layer.filename === 'string' && !sent.has(layer.filename)) {
      sent.set(layer.filename, layer);
    }
  }
  // a layer left out is one the user cannot see, or one the page does not know yet: kept
  const atlas = storedLayers.map((layer) => ((layer && sent.has(layer.filename)) ? mergeLayer(ctx, layer, sent.get(layer.filename)) : layer));
  const filenames = new Set(storedLayers.filter(Boolean).map((layer) => layer.filename));
  for (const layer of sentLayers) {
    if (!layer || filenames.has(layer.filename)) {
      continue;
    }
    if (typeof layer.filename !== 'string' || !layerFilenamePattern.test(layer.filename) || sent.get(layer.filename) !== layer) {
      ctx.refuse('mri.atlas', `a new layer '${layer.name}' has an invalid file name`, `the new layer '${layer.name}' has an invalid file name`);
      continue;
    }
    filenames.add(layer.filename);
    const added = newLayer(ctx, layer);
    if (added) {
      atlas.push(added);
    }
  }

  return atlas;
};

/**
 * The text annotations: those of the projects whose annotations the user may
 * edit (of a project that does not exist: the MRI's owner). None is removed
 * @param {object} ctx The merge context
 * @param {object} annotations The stored annotations (a copy, changed here)
 * @param {object} sentAnnotations The client's
 * @returns {object} The annotations to store
 */
const mergeAnnotations = (ctx, annotations, sentAnnotations) => {
  for (const [projectName, entries] of Object.entries(sentAnnotations)) {
    if (!_.isPlainObject(entries)) {
      continue;
    }
    const project = ctx.projects.get(projectName);
    const level = project ? projectAccessLevel(project, ctx.username, AccessType.ANNOTATIONS) : null;
    const mayEdit = project ? mayEditLevel(level) : ctx.isOwner;
    const storedEntries = _.isPlainObject(annotations[projectName]) ? annotations[projectName] : {};
    const changed = Object.keys(entries).filter((name) => !_.isEqual(storedEntries[name], entries[name]));
    for (const name of changed) {
      if (mayEdit) {
        annotations[projectName] = { ...annotations[projectName], [name]: entries[name] };
      } else {
        ctx.refuse(
          `mri.annotations.${projectName}.${name}`,
          project ? `${ctx.who} has '${level}' access to the annotations of ${projectName}` : `${ctx.who} may not change the annotations of a project that does not exist`,
          project ? `your access to the annotations of '${projectName}' is '${level}'` : 'you may not change these annotations',
          // a page initialises the entries of the annotations it shows, and their dates
          annotationData(storedEntries[name]) !== annotationData(entries[name])
        );
      }
    }
  }

  return annotations;
};

/**
 * Merge the copy of an MRI document a user sent into the stored one, keeping
 * what the user may not change (see the top of this file)
 * @param {object} params Parameters
 * @param {object} params.stored The stored document
 * @param {object} params.incoming The client's copy
 * @param {string|null} params.username The server-verified username, or null
 * @param {Map} params.projects shortname -> project (see projectsForMetadata)
 * @returns {object} { doc, refused }: the document to store, and the changes
 * not applied: { path, reason (for the log), userReason (about the user only),
 * notify (whether the user is told: false for what pages send without the
 * user asking for a change) }
 */
// eslint-disable-next-line max-statements
const mergeMetadata = ({ stored, incoming, username, projects }) => {
  const refused = [];
  const isOwner = Boolean(username) && stored.owner === username;
  const ctx = {
    username,
    projects,
    isOwner,
    who: username || 'anonymous',
    canRename: mayChangeMri({ stored, username, projects }),
    refuse: (path, reason, userReason, notify = true) => refused.push({ path, reason, userReason, notify })
  };

  const doc = _.cloneDeep(stored);
  delete doc._id;
  mergeTopLevel(ctx, doc, stored, incoming);
  doc.modified = (new Date()).toJSON();
  doc.modifiedBy = ctx.who;

  const sentMri = _.isPlainObject(incoming.mri) ? incoming.mri : {};
  if (!_.isPlainObject(doc.mri)) {
    doc.mri = {};
  }
  if (Array.isArray(sentMri.atlas)) {
    doc.mri.atlas = mergeLayers(ctx, Array.isArray(doc.mri.atlas) ? doc.mri.atlas : [], sentMri.atlas);
  }
  if (_.isPlainObject(sentMri.annotations)) {
    doc.mri.annotations = mergeAnnotations(ctx, _.isPlainObject(doc.mri.annotations) ? doc.mri.annotations : {}, sentMri.annotations);
  }
  // any other part of the client's 'mri' is ignored
  for (const key of Object.keys(sentMri)) {
    if (key !== 'atlas' && key !== 'annotations' && !_.isEqual(doc.mri[key], sentMri[key])) {
      ctx.refuse(`mri.${key}`, `the MRI's mri.${key} cannot be changed`, `the MRI's mri.${key} cannot be changed`, false);
    }
  }

  return { doc, refused };
};

/**
 * What the other users are sent once a save is applied: the sender's copy,
 * with what was stored instead of what it asked for (and without the layers
 * it asked for and did not get), so that they see what is saved, and nothing
 * the sender could not see
 * @param {object} doc The document stored
 * @param {object} incoming The client's copy
 * @returns {object} The copy to send
 */
const savedView = (doc, incoming) => {
  const view = _.cloneDeep(incoming);
  for (const key of Object.keys(view).filter((k) => k !== 'mri')) {
    view[key] = _.cloneDeep(doc[key]);
  }
  Object.assign(view, { modified: doc.modified, modifiedBy: doc.modifiedBy });
  const mri = doc.mri || {};
  if (_.isPlainObject(view.mri) && Array.isArray(view.mri.atlas)) {
    const layers = new Map((mri.atlas || []).filter(Boolean).map((layer) => [layer.filename, layer]));
    view.mri.atlas = view.mri.atlas.filter((layer) => layer && layers.has(layer.filename))
      .map((layer) => _.cloneDeep(layers.get(layer.filename)));
  }
  if (_.isPlainObject(view.mri) && _.isPlainObject(view.mri.annotations)) {
    for (const [projectName, entries] of Object.entries(view.mri.annotations)) {
      const storedEntries = (mri.annotations || {})[projectName] || {};
      // an entry that was not stored is sent without its text (pages expect the entries they sent)
      const sentEntries = _.isPlainObject(entries) ? _.mapValues(entries, (entry) => _.omit(entry, 'data')) : {};
      view.mri.annotations[projectName] = _.cloneDeep({ ...sentEntries, ...storedEntries });
    }
  }

  return JSON.parse(JSON.stringify(view)); // without the fields that are not stored
};

module.exports = { mergeMetadata, projectsForMetadata, savedView, projectAccessLevel, mayChangeMri };
