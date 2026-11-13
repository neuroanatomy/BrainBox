#!/usr/bin/env node
/*
  The stylesheets and templates that read nwl-components' tokens (UI kit step 4) must not
  bring back hex colours: a colour is written var(--nwl-…), and its value lives in
  nwl-components/tokens.css. ALLOWED lists, per file, the hex values that have no token
  yet; remove them from here when they get one. Run by `npm run lint`.
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ALLOWED = {
  'view/brainbox/src/style/style.css': [],
  'view/brainbox/src/style/ui.css': [],
  'view/brainbox/src/style/tables.css': [],
  'view/brainbox/src/style/ask-for-login.css': [],
  'view/atlasmaker/src/css/atlasmaker.css': ['#F00'],
  'view/atlasmaker/src/css/loading-style.css': [],
  'view/atlasmaker/src/tools/render3D/style.css': [],
  'templates/admin.mustache': ['#2a2a2a', '#a83', '#888', '#888', '#f99', '#633', '#aaa', '#f77'],
  'templates/projectSettings.mustache': ['#aaa'],
  'templates/mriEmbed.mustache': [],
  'templates/mriRender3D.mustache': [],
  'templates/askForLogin.mustache': [],
  'templates/mri.mustache': [],
  'templates/project.mustache': [],
  'templates/partials/viewer-header.mustache': [],
  'templates/partials/viewer-footer.mustache': []
};
const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/giu;

/**
 * The CSS of a file: all of a stylesheet; the style elements and attributes of a template
 * @param {string} file The file's path, from the repository's root
 * @param {string} text The file's content
 * @returns {string} Its CSS
 */
const cssOf = (file, text) => {
  if (file.endsWith('.css')) { return text; }
  const blocks = [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gu)].map((m) => m[1]);
  const attributes = [...text.matchAll(/\sstyle="([^"]*)"/gu)].map((m) => `{${m[1]}}`);

  return blocks.concat(attributes).join('\n');
};

/**
 * The hex colours in the declarations of some CSS (not in comments or selectors)
 * @param {string} css The CSS
 * @returns {Array<string>} The hex colours, in order
 */
const hexColours = (css) => {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//gu, '');
  const bodies = [...noComments.matchAll(/\{([^{}]*)\}/gu)].map((m) => m[1]);

  return bodies.flatMap((body) => body.split(';').flatMap((decl) => {
    const colon = decl.indexOf(':');

    return colon < 0 ? [] : decl.slice(colon + 1).match(HEX) || [];
  }));
};

let errors = 0;
for (const [file, allowed] of Object.entries(ALLOWED)) {
  const found = hexColours(cssOf(file, fs.readFileSync(path.join(ROOT, file), 'utf8')));
  if (found.join() !== allowed.join()) {
    console.error(`${file}: hex colours ${JSON.stringify(found)}, expected ${JSON.stringify(allowed)} (use var(--nwl-…) from nwl-components/tokens.css)`);
    errors += 1;
  }
}
if (errors) {
  process.exitCode = 1;
} else {
  console.log(`check-hex-colours: ${Object.keys(ALLOWED).length} files, no hex colours outside the allowed ones`);
}
