/**
 * The plane and slice of a link to the MRI page, which reads them from the
 * query (brainbox.js configureBrainBox: `param.view`, `param.slice`). Shared by
 * the viewer's Link button and the embed's BrainBox button. Set, not appended:
 * a view or slice already in the link is replaced, never repeated.
 *
 * Authored as CommonJS, like embedSizing.js, so that mocha can `require` it.
 * @param {URLSearchParams} query The query to change
 * @param {object} user The viewer's state
 * @param {string} [user.view] The plane: 'sag', 'cor' or 'axi'
 * @param {number|null} [user.slice] The slice
 * @returns {URLSearchParams} The query
 */
const setViewAndSlice = (query, { view, slice } = {}) => {
  if (view) { query.set('view', view); }
  if (slice !== null && typeof slice !== 'undefined') { query.set('slice', slice); }

  return query;
};

/**
 * A link to this page showing the given plane and slice
 * @param {string} href The page's address
 * @param {object} user The viewer's state, {view, slice}
 * @returns {string} The link
 */
const linkToView = (href, user) => {
  const link = new URL(href);
  setViewAndSlice(link.searchParams, user);

  return link.href;
};

module.exports = { setViewAndSlice, linkToView };
