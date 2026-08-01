/**
 * BrainBox embed loader.
 *
 * Drop one line into a page and get a brain viewer:
 *
 *   <script src="https://brainbox.pasteur.fr/embed.js"
 *           data-url="http://example.org/brain.nii.gz"></script>
 *
 * The script inserts an <iframe> pointing at /mri/embed where it sits, and
 * keeps that iframe at the height the viewer asks for. It is exactly what a
 * host page can write by hand (see docs/embeddable-plan.md §4.6) - this just
 * removes the copy-pasting.
 *
 * Deliberately dependency-free and unbundled: it has to be servable from a
 * fixed, cacheable URL and readable by whoever is deciding whether to trust it.
 *
 * Options, all optional except data-url:
 *   data-url            source URL of the MRI            (required)
 *   data-view           sag | cor | axi
 *   data-slice          initial slice number
 *   data-project        project shortname of the annotation layer
 *   data-annotation     annotation layer name
 *   data-max-height     cap, in px, on the height the viewer may ask for
 *   data-brainbox-link  "0" hides the BrainBox button
 *   data-width          CSS width of the box     (default 100%)
 *   data-max-width      CSS max-width of the box (default 560px)
 *   data-height         CSS height to start from (default 420px)
 *   data-target         CSS selector of the element to render into; by default
 *                       the viewer appears where the script tag is
 */
(function () {
  'use strict';

  const RESIZE_MESSAGE = 'brainbox:embed-resize';
  const MAX_SANE_HEIGHT = 4000;

  // data-* attribute (camelCased by dataset) -> /mri/embed query parameter
  const QUERY_ATTRIBUTES = {
    url: 'url',
    view: 'view',
    slice: 'slice',
    project: 'project',
    annotation: 'annotation',
    maxHeight: 'maxHeight',
    brainboxLink: 'brainboxLink'
  };

  const embeds = [];
  let listening = false;

  /**
   * The <script> element being executed. document.currentScript covers the
   * normal case; the fallback covers async/deferred loading, where it is null.
   * @returns {Element|null} The script element that pulled us in
   */
  const findScript = function () {
    if (document.currentScript) { return document.currentScript; }
    const candidates = document.querySelectorAll('script[src*="embed.js"]:not([data-brainbox-embedded])');

    return candidates.length ? candidates[candidates.length - 1] : null;
  };

  /**
   * @param {Element} script The script element
   * @returns {string} Origin BrainBox is served from
   */
  const brainboxOrigin = function (script) {
    const link = document.createElement('a');
    link.href = script.src;

    return link.protocol + '//' + link.host;
  };

  /**
   * @param {Element} script The script element carrying the data-* options
   * @returns {string} Query string for /mri/embed
   */
  const queryString = function (script) {
    const parts = [];
    Object.keys(QUERY_ATTRIBUTES).forEach(function (key) {
      const value = script.dataset[key];
      if (value) {
        parts.push(QUERY_ATTRIBUTES[key] + '=' + encodeURIComponent(value));
      }
    });

    return parts.join('&');
  };

  /**
   * Resize the iframe a message came from. The sender is identified by its
   * window, so one embed cannot resize another and an unrelated page cannot
   * resize any of them.
   * @param {MessageEvent} event The postMessage event
   * @returns {void}
   */
  const onMessage = function (event) {
    if (!event.data || event.data.type !== RESIZE_MESSAGE) { return; }
    const { height } = event.data;
    if (typeof height !== 'number' || !isFinite(height) || height <= 0 || height > MAX_SANE_HEIGHT) { return; }

    const target = embeds.find(function (frame) {
      return event.source === frame.contentWindow;
    });
    if (target) { target.style.height = height + 'px'; }
  };

  /**
   * @param {Element} script The script element
   * @returns {Element} The iframe to show the viewer in
   */
  const buildFrame = function (script) {
    const frame = document.createElement('iframe');
    frame.className = 'brainbox-embed';
    frame.title = 'BrainBox viewer';
    frame.setAttribute('allow', 'fullscreen');
    frame.setAttribute('allowfullscreen', '');
    frame.style.display = 'block';
    frame.style.border = '0';
    frame.style.background = '#222';
    frame.style.width = script.dataset.width || '100%';
    frame.style.maxWidth = script.dataset.maxWidth || '560px';
    // A starting guess only: the viewer reports the height it actually needs
    // as soon as it knows the shape of the brain.
    frame.style.height = script.dataset.height || '420px';

    return frame;
  };

  /**
   * @param {Element} script The script element
   * @param {Element} frame The iframe to place
   * @returns {void}
   */
  const place = function (script, frame) {
    const target = script.dataset.target ? document.querySelector(script.dataset.target) : null;
    if (target) {
      target.appendChild(frame);
    } else if (script.parentNode) {
      script.parentNode.insertBefore(frame, script);
    }
  };

  const init = function () {
    const script = findScript();
    if (!script || script.hasAttribute('data-brainbox-embedded')) { return; }
    script.setAttribute('data-brainbox-embedded', '');

    if (!script.dataset.url) {
      console.error('BrainBox embed: data-url is required');

      return;
    }

    const frame = buildFrame(script);
    frame.src = brainboxOrigin(script) + '/mri/embed?' + queryString(script);
    place(script, frame);
    embeds.push(frame);

    // One listener for the whole page, however many embeds it has.
    if (!listening) {
      listening = true;
      window.addEventListener('message', onMessage);
    }
  };

  init();
}());
