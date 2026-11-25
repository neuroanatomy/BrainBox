#!/usr/bin/env node
'use strict';

// Checks the vendored third-party assets against the checksums recorded in
// public/vendor/vendor.json, so a file cannot drift from the CDN build it came
// from without anyone noticing. Pass --refetch to also download each upstream
// URL and confirm it still serves those exact bytes (needs network access).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const root = path.join(__dirname, '..');
const manifestPath = path.join(root, 'public/vendor/vendor.json');
const refetch = process.argv.includes('--refetch');

const sha256 = (buf) => crypto
  .createHash('sha256')
  .update(buf)
  .digest('hex');

const readOrNull = (file) => fs.promises.readFile(file).catch(() => null);

const collect = (res) => new Promise((resolve) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => resolve(Buffer.concat(chunks)));
});

const download = (url) => new Promise((resolve, reject) => {
  https.get(url, { headers: { 'user-agent': 'brainbox-verify-vendor' } }, (res) => {
    const { statusCode, headers } = res;
    const redirected = statusCode > 299 && statusCode < 400 && headers.location;
    if (redirected || statusCode !== 200) {
      res.resume();
      if (redirected) {
        resolve(download(new URL(headers.location, url).href));
      } else {
        reject(new Error(`HTTP ${statusCode}`));
      }

      return;
    }
    resolve(collect(res));
  }).on('error', reject);
});

// Does the file on disk still hash to what we recorded?
const checkLocal = async (asset) => {
  const buf = await readOrNull(path.join(root, asset.path));
  if (!buf) { return [`MISSING  ${asset.path}`]; }

  const actual = sha256(buf);
  if (actual === asset.sha256) { return []; }

  return [
    `CHANGED  ${asset.path}`,
    `         expected ${asset.sha256}`,
    `         actual   ${actual}`
  ];
};

// Does the CDN still serve exactly those bytes?
const checkUpstream = async (asset) => {
  try {
    const upstream = sha256(await download(asset.url));
    if (upstream === asset.sha256) { return []; }

    return [
      `UPSTREAM the CDN now serves different bytes at ${asset.url}`,
      `         vendored ${asset.sha256}`,
      `         upstream ${upstream}`
    ];
  } catch (err) {
    return [`UNREACHABLE ${asset.url} (${err.message})`];
  }
};

const checkAsset = async (asset) => {
  const problems = await checkLocal(asset);
  if (problems.length || !refetch) { return problems; }

  // Some hosts (gstatic) re-subset their binaries behind a versioned URL, so a
  // re-download legitimately differs. Their checksum still guards in-repo drift.
  if (asset.upstreamStable === false) { return []; }

  return checkUpstream(asset);
};

const checkDerived = async (entry) => (
  await readOrNull(path.join(root, entry.path))
    ? []
    : [`MISSING  ${entry.path}`]
);

const report = (label, problems) => {
  if (problems.length) {
    problems.forEach((line) => console.error(line.startsWith(' ') ? line : `${line}  [${label}]`));
  } else {
    console.log(`ok       ${label}`);
  }

  return problems.length ? 1 : 0;
};

const main = async () => {
  const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));

  const assetResults = await Promise.all(manifest.assets.map(checkAsset));
  const derivedResults = await Promise.all((manifest.derived || []).map(checkDerived));

  const failures =
    manifest.assets.reduce(
      (n, a, i) => n + report(`${a.name}@${a.version}`, assetResults[i]), 0
    ) +
    (manifest.derived || []).reduce(
      (n, d, i) => n + report(`${d.path} (derived, not checksummed)`, derivedResults[i]), 0
    );

  if (failures) {
    console.error(`\n${failures} problem(s). See ${path.relative(root, manifestPath)}.`);
    process.exitCode = 1;

    return;
  }
  console.log(`\nAll ${manifest.assets.length} vendored assets match vendor.json (retrieved ${manifest.retrieved}).`);
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
