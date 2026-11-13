'use strict';

/*
  Every icon (or other image) the app refers to must exist in the repo:
  - relative paths (`<img src="./img/x.svg">` in the viewer HTML, `url(./x.png)`
    in CSS, `import x from './x.svg'` in JS) are resolved against the file;
  - absolute `/img/…` paths (Mustache templates, page JS, CSS, the user doc) are
    served by express.static from `public/`;
  - the shared icons are nwl-components' (UI kit step 11c): `~nwl-components/dist/…`
    in the viewer HTML and `nwl-components/dist/…` in JS are bundled from the
    package, `/lib/nwl-components/…` is served from its `dist/` (app.js). All
    three are resolved against `node_modules/nwl-components/dist`.
  The design notes in `src/resources` are not built and are left out, and so
  is commented-out markup.
*/

const { assert } = require('chai');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const image = String.raw`[\w.@/-]+\.(?:svg|png|jpe?g|gif)`;
// `./x.svg` or `../x.svg` after src=", url(, from ' or require('
const relativeRef = new RegExp(String.raw`(?:src=["']|url\(\s*["']?|from\s+["']|require\(\s*["'])(\.{1,2}/${image})`, 'g');
// `/img/x.svg`, not preceded by a word character, a dot or a slash (so not `./img/x.svg`)
const absoluteRef = new RegExp(String.raw`(?<![\w./])(/img/${image})`, 'g');
// `~nwl-components/dist/x.svg` (html-loader) or `nwl-components/dist/x.svg` (import)
const packageRef = new RegExp(String.raw`(?:src=["']|url\(\s*["']?|from\s+["']|require\(\s*["'])~?nwl-components/dist/(${image})`, 'g');
// `/lib/nwl-components/x.svg`, served from the package's dist
const libRef = new RegExp(String.raw`(?<![\w./])/lib/nwl-components/(${image})`, 'g');
const nwlDist = 'node_modules/nwl-components/dist';

const listFiles = async (dir, extensions) => {
  const entries = await fs.promises.readdir(path.join(root, dir), { withFileTypes: true });
  const lists = await Promise.all(entries.map((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return ['resources', 'dist', 'node_modules'].includes(entry.name) ? [] : listFiles(rel, extensions);
    }

    return extensions.includes(path.extname(entry.name)) ? [rel] : [];
  }));

  return lists.flat();
};

// the file's text, without HTML comments (and CSS comments in CSS files)
const readText = async (file) => {
  const text = (await fs.promises.readFile(path.join(root, file), 'utf8')).replace(/<!--[\s\S]*?-->/g, '');

  return path.extname(file) === '.css' ? text.replace(/\/\*[\s\S]*?\*\//g, '') : text;
};

const exists = (file) => fs.promises.access(path.join(root, file)).then(() => true, () => false);

const scannedFiles = async () => (await Promise.all([
  listFiles('view/atlasmaker/src', ['.html', '.js', '.css']),
  listFiles('view/brainbox/src', ['.html', '.js', '.css']),
  listFiles('templates', ['.mustache']),
  listFiles('public/doc', ['.md', '.html'])
])).flat();

const iconReferences = async () => {
  const files = await scannedFiles();
  const texts = await Promise.all(files.map(readText));

  return files.flatMap((file, i) => [
    ...[...texts[i].matchAll(relativeRef)].map(([, ref]) => ({ file, ref, target: path.join(path.dirname(file), ref) })),
    ...[...texts[i].matchAll(absoluteRef)].map(([, ref]) => ({ file, ref, target: path.join('public', ref) })),
    ...[...texts[i].matchAll(packageRef), ...texts[i].matchAll(libRef)].map(([ref, rel]) => ({ file, ref, target: path.join(nwlDist, rel) }))
  ]);
};

describe('Icon references', function () {
  it('finds the icon references of the viewer, the templates, the page JS and the CSS', async function () {
    const files = new Set((await iconReferences()).map(({ file }) => file));
    for (const file of [
      'view/atlasmaker/src/html/toolsFull.html',
      'view/atlasmaker/src/tools/adjust/index.html',
      'view/atlasmaker/src/atlasmaker.js',
      'view/brainbox/src/brainbox.js',
      'view/brainbox/src/style/access-style.css',
      'templates/index.mustache'
    ]) {
      assert.isTrue(files.has(file), `no icon reference found in ${file}`);
    }
  });

  it('every icon reference points at an existing file', async function () {
    const refs = await iconReferences();
    const found = await Promise.all(refs.map(({ target }) => exists(target)));
    const missing = refs.filter((ref, i) => !found[i]).map(({ file, ref }) => `${file}: ${ref}`);
    assert.deepEqual(missing, []);
  });

  it('the shared icons come from nwl-components, not from a local copy', async function () {
    // the local copies removed in step 11c (nwl-components' src/icons/README.md, "Replaces")
    const removed = [
      ...['3drender', 'adjust', 'bars', 'caret-square-o-left', 'caret-square-o-right', 'chat', 'download', 'erase', 'eyedropper', 'fill', 'floppy', 'fullscreen', 'landmark', 'link', 'paint', 'preciseCursor', 'ruler', 'scroll', 'show', 'times-circle', 'undo', 'upload']
        .map((name) => `view/atlasmaker/src/html/img/${name}.svg`),
      ...['adjust', 'alpha', 'sun-o'].map((name) => `view/atlasmaker/src/tools/adjust/${name}.svg`),
      ...['bug', 'doc', 'download-square', 'eye', 'eye-circle', 'github', 'minus-small', 'minus-small-circle', 'minus-square', 'pencil', 'pencil-circle', 'plus', 'plus-small', 'plus-small-circle', 'search', 'settings']
        .map((name) => `public/img/${name}.svg`)
    ];
    const icons = new Set(await fs.promises.readdir(path.join(root, nwlDist, 'icons')));
    const refs = (await iconReferences()).filter(({ target }) => !target.startsWith(nwlDist));
    const local = refs.filter(({ target }) => removed.includes(target) || icons.has(path.basename(target)));
    assert.deepEqual(local.map(({ file, ref }) => `${file}: ${ref}`), []);
  });

  it('nothing refers to the missing /img/download.svg', async function () {
    const files = await scannedFiles();
    const texts = await Promise.all(files.map(readText));
    assert.deepEqual(files.filter((file, i) => (/(?<![\w./])\/img\/download\.svg/).test(texts[i])), []);
  });
});
