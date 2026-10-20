const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { BUILD_STAMP, validateReleaseBuild, getBundledPackages, listFiles, hashFiles } = require('./release-validation.cjs');

// @group Validation > Contents : Reject anything outside the exact staged runtime inventory
function validatePackManifest(result, expectedFiles) {
  const actualFiles = result.files.map(({ path: filename }) => filename).sort();
  const expected = [...expectedFiles].sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expected)) throw new Error('npm pack contents differ from the reviewed runtime inventory.');
  if (actualFiles.some((file) => /(?:^|\/)(?:\.env[^/]*|\.npmrc)(?:\/|$)|\.(?:node|map|tgz)$|^\.next\/(?:cache|standalone)\//.test(file))) {
    throw new Error('The package contains development, private, or platform-specific files.');
  }
}

// @group BusinessLogic > Packaging : Snapshot a verified build, then produce a reviewable tarball and checksum
function packRelease(root) {
  const { files, metadata, manifest } = validateReleaseBuild(root);
  const readme = path.join(root, 'excluded/docs/README.md');
  if (!fs.existsSync(readme) || !fs.existsSync(path.join(root, 'LICENSE'))) {
    throw new Error('Release packaging requires excluded/docs/README.md and LICENSE.');
  }
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const packages = getBundledPackages(manifest, lock);
  const releases = path.join(root, 'excluded/test-scripts/releases');
  fs.mkdirSync(releases, { recursive: true });
  const releaseDir = fs.mkdtempSync(path.join(releases, `${manifest.version}-`));
  const stage = path.join(releaseDir, 'package');
  fs.mkdirSync(stage);
  for (const file of [...files, BUILD_STAMP, 'scripts/release-validation.cjs', 'LICENSE']) {
    const destination = path.join(stage, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, file), destination);
  }
  fs.copyFileSync(readme, path.join(stage, 'README.md'));
  for (const [location, expected] of Object.entries(packages)) {
    const installed = JSON.parse(fs.readFileSync(path.join(root, location, 'package.json'), 'utf8'));
    if (installed.version !== expected.version) throw new Error(`Installed runtime does not match the lockfile: ${location}`);
    for (const file of listFiles(root, location)) {
      const packageRelative = file.slice(location.length + 1);
      if (packageRelative.split('/').includes('node_modules') || file.endsWith('.map')) continue;
      if (file.endsWith('.node')) throw new Error(`Cannot bundle a build-host native binary: ${file}`);
      const destination = path.join(stage, file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(root, file), destination);
    }
  }
  const publishedManifest = { ...manifest, scripts: { start: manifest.scripts.start, prepack: manifest.scripts.prepack } };
  delete publishedManifest.devDependencies;
  fs.writeFileSync(path.join(stage, 'package.json'), `${JSON.stringify(publishedManifest, null, 2)}\n`);
  const runtimeInventory = { version: manifest.version, packages, filesHash: hashFiles(stage, listFiles(stage, 'node_modules')) };
  fs.writeFileSync(path.join(stage, 'release-runtime.json'), `${JSON.stringify(runtimeInventory, null, 2)}\n`);
  validateReleaseBuild(stage, { staged: true });
  const expectedFiles = listFiles(stage, '');
  const npmCli = process.env.npm_execpath;
  if (!npmCli || !fs.existsSync(npmCli)) throw new Error('Run this command using npm run release:pack.');
  const result = spawnSync(process.execPath, [npmCli, 'pack', '--json', '--pack-destination', releaseDir], {
    cwd: stage, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`npm pack failed: ${result.stderr || result.stdout}`);
  const output = JSON.parse(result.stdout.slice(result.stdout.indexOf('[\n')))[0];
  validatePackManifest(output, expectedFiles);
  const tarball = path.join(releaseDir, output.filename);
  const sha512 = createHash('sha512').update(fs.readFileSync(tarball)).digest('hex');
  const report = { ...output, tarball, sha512, sourceHash: metadata.sourceHash, runtimeHash: metadata.runtimeHash };
  fs.writeFileSync(path.join(releaseDir, 'manifest.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(`${tarball}.sha512`, `${sha512}  ${output.filename}\n`);
  console.log(JSON.stringify({ tarball, manifest: path.join(releaseDir, 'manifest.json'), sha512,
    size: output.size, unpackedSize: output.unpackedSize, files: output.entryCount }, null, 2));
  return report;
}

// @group Exports : Keep tarball validation available to regression tests
module.exports = { validatePackManifest, packRelease };
if (require.main === module) {
  try { packRelease(path.resolve(__dirname, '..')); } catch (error) {
    console.error(`Release packaging failed: ${error.message}`);
    process.exitCode = 1;
  }
}
