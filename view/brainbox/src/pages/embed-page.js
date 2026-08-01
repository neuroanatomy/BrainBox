/*global AtlasMakerWidget mriInfo params embedWsTicket*/
import '../style/ui.css';
import '../../../atlasmaker/src/css/embed-layout.css';

import embedSizing from '../../../shared/embedSizing.js';

// Message type embedding pages listen for to auto-size their <iframe>.
// The iframe's own box is controlled entirely by the host page's CSS, not by
// its content, so an iframe sized for e.g. the coronal plane would clip or
// leave dead space once the viewer switches to a plane with a different aspect
// ratio. This mirrors the postMessage-based auto-resize pattern used by
// YouTube/Twitter/CodePen embeds, which works across origins (unlike reading
// iframe.contentDocument, which only works for same-origin embeds).
//
// The viewer is laid out to look right at whatever size the host gives it (see
// embed-layout.css), so a host that ignores these messages still gets a usable
// widget. This is an enhancement, not a requirement.
const EMBED_RESIZE_MESSAGE_TYPE = 'brainbox:embed-resize';

/**
 * Find the index of the atlas/annotation the host page asked for via the
 * `project`/`annotation` query params, defaulting to the first available one.
 * @param {Object} mri The mri.atlas-bearing object from mriInfo
 * @param {string} project Project shortname requested by the embedding page
 * @param {string} annotation Annotation name requested by the embedding page
 * @returns {number} The index into mri.atlas to load
 */
const findAnnotationItemIndex = function (mri, project, annotation) {
  if (!mri || !mri.atlas || !project || !annotation) {
    return 0;
  }
  const index = mri.atlas.findIndex((a) => a.project === project && a.name === annotation);

  return index >= 0 ? index : 0;
};

/**
 * @function isDisabled
 * @desc Read an on-by-default switch from the query string.
 * @param {string} value Raw query-string value
 * @returns {boolean} True when the host page explicitly turned the feature off
 */
const isDisabled = function (value) {
  return value === '0' || value === 'false' || value === 'no';
};

/**
 * Point the BrainBox button at this brain's own page, deep-linked to whatever
 * the visitor is currently looking at - the same courtesy an embedded video's
 * logo does when it opens at the current timestamp.
 * @returns {void}
 */
const updateBrainBoxLink = function () {
  const link = document.getElementById('brainboxLink');
  if (!link || !AtlasMakerWidget.User.source) { return; }

  const query = new URLSearchParams({ url: AtlasMakerWidget.User.source });
  if (AtlasMakerWidget.User.view) { query.set('view', AtlasMakerWidget.User.view); }
  if (AtlasMakerWidget.User.slice !== null) { query.set('slice', AtlasMakerWidget.User.slice); }
  if (params.project) { query.set('project', params.project); }
  if (params.annotation) { query.set('annotation', params.annotation); }

  link.href = AtlasMakerWidget.hostname + '/mri?' + query.toString();
};

/**
 * @function positiveIntParam
 * @param {string} value Raw query-string value
 * @returns {number|undefined} The parsed value, or undefined when unusable
 */
const positiveIntParam = function (value) {
  const n = parseInt(value, 10);

  // eslint-disable-next-line no-undefined
  return (isFinite(n) && n > 0) ? n : undefined;
};

/**
 * Report the height this viewer wants to the parent window, computed from the
 * current plane's aspect ratio plus the toolbar. Never derived from the
 * rendered document height: that is clamped by the iframe box we are trying to
 * change, so it can only ever grow and never shrink back.
 * @returns {void}
 */
const reportSizeToParent = function () {
  if (window.parent === window) { return; }

  const toolbar = document.getElementById('tools-side');
  const width = document.documentElement.clientWidth;
  const aspect = embedSizing.planeAspect(AtlasMakerWidget);
  const height = embedSizing.desiredEmbedHeight({
    width,
    aspect,
    toolbarHeight: toolbar ? toolbar.offsetHeight : 0,
    maxHeight: positiveIntParam(params.maxHeight) || Infinity
  });

  if (!isFinite(height)) { return; }

  window.parent.postMessage({
    type: EMBED_RESIZE_MESSAGE_TYPE,
    height,
    width,
    aspect,
    view: AtlasMakerWidget.User.view
  }, '*');
};

if (!mriInfo || !mriInfo.mri) {
  document.getElementById('stereotaxic').innerHTML = '<p style="color:white;text-align:center;font:14px sans-serif;padding:2rem">This brain could not be loaded.</p>';
} else {
  const index = findAnnotationItemIndex(mriInfo.mri, params.project, params.annotation);

  // Tag this viewer as an embed before anything else runs: embedMode picks the
  // stripped-down toolbar (no paint/erase/link tools) and the flex layout, and
  // embedTicket is the server-verified proof, sent on the WebSocket handshake,
  // that this connection must never be allowed to write. Read-only here is a UI
  // nicety only - the real guarantee is enforced by the WebSocket server
  // regardless of this flag.
  AtlasMakerWidget.embedMode = true;
  AtlasMakerWidget.embedTicket = embedWsTicket;

  if (params.view) {
    AtlasMakerWidget.User.view = params.view;
    AtlasMakerWidget.User.slice = null; // resets to the middle slice unless overridden below
  }
  if (params.slice) {
    AtlasMakerWidget.User.slice = parseInt(params.slice, 10);
  }
  AtlasMakerWidget.fullscreen = false;

  // AtlasMaker's own CSS (atlasmaker.css) scopes its text/toolbar colors under
  // #atlasmaker specifically - it must be the id of the element handed to
  // initAtlasMaker, not the outer #stereotaxic wrapper, or the UI renders
  // essentially invisible (default black-on-transparent).
  const stereotaxic = document.getElementById('stereotaxic');
  const atlasmakerContainer = document.createElement('div');
  atlasmakerContainer.id = 'atlasmaker';
  atlasmakerContainer.className = 'display-mode embed-layout';
  stereotaxic.appendChild(atlasmakerContainer);

  // resizeWindow() is AtlasMaker's single choke point for recomputing the
  // canvas size to fit the current plane; it fires this event on initial load,
  // every plane switch, and fullscreen enter/exit.
  atlasmakerContainer.addEventListener('atlasmaker:resize', reportSizeToParent);
  atlasmakerContainer.addEventListener('atlasmaker:resize', updateBrainBoxLink);

  AtlasMakerWidget.initAtlasMaker(atlasmakerContainer);
  AtlasMakerWidget.editMode = 0; // never editable, unconditionally - defense in depth

  // Attribution link: shown unless the embedding page opts out with
  // brainboxLink=0. Its href is refreshed on every plane change, and again
  // just before it is followed, so it always points at what is on screen
  // (a slice change alone does not resize anything).
  const brainboxLink = document.getElementById('brainboxLink');
  if (brainboxLink) {
    if (isDisabled(params.brainboxLink)) {
      brainboxLink.parentNode.remove();
    } else {
      brainboxLink.addEventListener('mousedown', updateBrainBoxLink);
      brainboxLink.addEventListener('touchstart', updateBrainBoxLink);
      brainboxLink.addEventListener('focus', updateBrainBoxLink);
    }
  }

  // The toolbar's height is part of the reported height, and the host's width
  // drives all of it, so both have to be watched: a host page that resizes the
  // iframe's width (responsive layout, window resize, orientation change) must
  // get a matching height back.
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => { reportSizeToParent(); });
    observer.observe(document.documentElement);
    const toolbar = document.getElementById('tools-side');
    if (toolbar) { observer.observe(toolbar); }
  }

  AtlasMakerWidget.configureAtlasMaker(mriInfo, index)
    .then(() => {
      reportSizeToParent();
    })
    .catch((err) => {
      console.error('ERROR configuring embed viewer:', err);
      AtlasMakerWidget.setViewerState({
        state: 'error',
        message: 'This brain could not be loaded.'
      });
    });
}
