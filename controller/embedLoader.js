'use strict';

/**
 * /embed.js, the loader a host page includes to get a brain viewer in an iframe of /mri/embed,
 * kept at the height the viewer asks for:
 *
 *   <script src="https://brainbox.pasteur.fr/embed.js" data-url="..."></script>
 *
 * The text is made once, at start-up, by nwl-components' embedScript() (src/embed/loader.js,
 * unminified and with its comments), with BrainBox's names. Pages outside our control load it
 * and listen for brainbox:embed-resize: the data-* attributes, the iframe URL and its query
 * parameters, and the message must not change.
 */
const { embedScript } = require('nwl-components/embed');

const embedJs = embedScript({
  prefix: 'brainbox',
  appName: 'BrainBox',
  endpoint: '/mri/embed',
  required: 'url',
  // data-* attribute (camelCased by dataset) -> /mri/embed query parameter, in this order
  params: {
    url: 'url',
    view: 'view',
    slice: 'slice',
    project: 'project',
    annotation: 'annotation',
    maxHeight: 'maxHeight',
    brainboxLink: 'brainboxLink'
  },
  optionsDoc: [
    ['data-url', 'source URL of the MRI            (required)'],
    ['data-view', 'sag | cor | axi'],
    ['data-slice', 'initial slice number'],
    ['data-project', 'project shortname of the annotation layer'],
    ['data-annotation', 'annotation layer name, or "none" for the bare MRI'],
    ['data-max-height', 'cap, in px, on the height the viewer may ask for'],
    ['data-brainbox-link', '"0" hides the BrainBox button']
  ]
});

// a Buffer, so that res.send keeps the Content-Type as set (with a string, it would write the
// charset as utf-8, where the static file had UTF-8)
const embedJsBuffer = Buffer.from(embedJs, 'utf8');

/**
 * GET /embed.js, with the headers express.static gave the file it replaces (CORS comes from
 * the app's middleware, the ETag from res.send)
 * @param {Object} req Express request
 * @param {Object} res Express response
 * @returns {void}
 */
const serveEmbedJs = function (req, res) {
  res.set('Content-Type', 'application/javascript; charset=UTF-8');
  res.set('Cache-Control', 'public, max-age=0');
  res.send(embedJsBuffer);
};

module.exports = { embedJs, serveEmbedJs };
