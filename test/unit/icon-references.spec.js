'use strict';

/*
  Every icon (or other image) the app refers to must exist in the repo:
  - relative paths (`<img src="./img/x.svg">` in the viewer HTML, `url(./x.png)`
    in CSS, `import x from './x.svg'` in JS) are resolved against the file;
  - absolute `/img/…` paths (Mustache templates, page JS, CSS) are served by
    express.static from `public/`.
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
  listFiles('templates', ['.mustache'])
])).flat();

const iconReferences = async () => {
  const files = await scannedFiles();
  const texts = await Promise.all(files.map(readText));

  return files.flatMap((file, i) => [
    ...[...texts[i].matchAll(relativeRef)].map(([, ref]) => ({ file, ref, target: path.join(path.dirname(file), ref) })),
    ...[...texts[i].matchAll(absoluteRef)].map(([, ref]) => ({ file, ref, target: path.join('public', ref) }))
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

  it('nothing refers to the missing /img/download.svg', async function () {
    const files = await scannedFiles();
    const texts = await Promise.all(files.map(readText));
    assert.deepEqual(files.filter((file, i) => (/(?<![\w./])\/img\/download\.svg/).test(texts[i])), []);
  });
});
