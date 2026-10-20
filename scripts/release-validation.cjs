const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// @group Constants : Only platform-independent production assets belong in the npm package
const NEXT_FILES = [
  'BUILD_ID', 'package.json', 'app-build-manifest.json', 'app-path-routes-manifest.json',
  'build-manifest.json', 'images-manifest.json', 'prerender-manifest.json',
  'react-loadable-manifest.json', 'required-server-files.json', 'routes-manifest.json',
];
const RUNTIME_FILES = ['server.js', 'bin/ezkafka-visualizer.js', 'scripts/access-config.cjs'];
const BUILD_STAMP = '.next/release-build.json';

// @group Utilities : Traverse regular files without following symlinks outside the release tree
function listFiles(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return [];
  const stat = fs.lstatSync(absolutePath);
  if (stat.isSymbolicLink()) throw new Error(`Release files must not be symlinks: ${relativePath}`);
  if (stat.isFile()) return [relativePath.replaceAll('\\', '/')];
  if (!stat.isDirectory()) throw new Error(`Unsupported release file: ${relativePath}`);
  return fs.readdirSync(absolutePath).flatMap((name) => listFiles(root, path.join(relativePath, name)));
}

function getRuntimeFiles(root) {
  return [...RUNTIME_FILES, ...NEXT_FILES.map((name) => `.next/${name}`),
    ...listFiles(root, '.next/server'), ...listFiles(root, '.next/static'), ...listFiles(root, 'public')]
    .filter((file) => !file.endsWith('.map') && !file.endsWith('.nft.json')).sort();
}

function hashFiles(root, files) {
  const digest = createHash('sha256');
  for (const file of [...files].sort()) {
    const absolutePath = path.join(root, file);
    if (!fs.existsSync(absolutePath)) throw new Error(`Release file is missing: ${file}`);
    if (!fs.lstatSync(absolutePath).isFile()) throw new Error(`Release file must be regular: ${file}`);
    digest.update(file).update('\0').update(fs.readFileSync(absolutePath)).update('\0');
  }
  return digest.digest('hex');
}

function getSourceHash(root) {
  const files = ['package.json', 'package-lock.json', 'next.config.ts', 'postcss.config.mjs',
    'tsconfig.json', ...RUNTIME_FILES, ...listFiles(root, 'src'), ...listFiles(root, 'public')];
  return hashFiles(root, files);
}

// @group Validation > Build : Reject absent, partial, development, and subsequently changed builds
function validateProductionBuild(root) {
  const buildIdPath = path.join(root, '.next/BUILD_ID');
  if (!fs.existsSync(buildIdPath) || !fs.readFileSync(buildIdPath, 'utf8').trim() ||
      fs.readFileSync(buildIdPath, 'utf8').trim() === 'development') {
    throw new Error('A production build is required. Stop the development server and run npm run build.');
  }
  const build = JSON.parse(fs.readFileSync(path.join(root, '.next/build-manifest.json'), 'utf8'));
  if (build.devFiles?.length || fs.existsSync(path.join(root, '.next/static/development'))) {
    throw new Error('Development output cannot be published. Stop the development server and rebuild.');
  }
  for (const file of ['server/app-paths-manifest.json', 'server/middleware-manifest.json']) {
    if (!fs.existsSync(path.join(root, '.next', file))) throw new Error(`Incomplete production build: ${file}`);
  }
  if (!listFiles(root, '.next/static').some((file) => file.endsWith('.js'))) {
    throw new Error('Production browser assets are missing.');
  }
  return getRuntimeFiles(root);
}

function stampBuild(root) {
  const files = validateProductionBuild(root);
  const metadata = {
    version: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version,
    sourceHash: getSourceHash(root),
    runtimeHash: hashFiles(root, files),
  };
  fs.writeFileSync(path.join(root, BUILD_STAMP), `${JSON.stringify(metadata, null, 2)}\n`);
  return metadata;
}

function validateReleaseBuild(root, { staged = false } = {}) {
  const files = validateProductionBuild(root);
  const stampPath = path.join(root, BUILD_STAMP);
  if (!fs.existsSync(stampPath)) throw new Error('Build verification is missing. Run npm run build before release:pack.');
  const metadata = JSON.parse(fs.readFileSync(stampPath, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (metadata.version !== manifest.version) throw new Error('The package version changed after the build. Rebuild before packing.');
  if (metadata.runtimeHash !== hashFiles(root, files)) throw new Error('Build output changed after verification. Rebuild before packing.');
  if (!staged && metadata.sourceHash !== getSourceHash(root)) throw new Error('Source changed after the build. Rebuild before packing.');
  if (staged) {
    const inventoryPath = path.join(root, 'release-runtime.json');
    if (!fs.existsSync(inventoryPath)) throw new Error('Use npm run release:pack to create the reviewed release tarball.');
    validateBundledRuntime(root, manifest, JSON.parse(fs.readFileSync(inventoryPath, 'utf8')));
  }
  return { files, metadata, manifest };
}

// @group Validation > Dependencies : Bundle the locked JavaScript runtime instead of relying on downstream overrides
function getBundledPackages(manifest, lock) {
  if (lock.lockfileVersion !== 3) throw new Error('The release requires a version 3 package lock.');
  if (lock.name !== manifest.name || lock.version !== manifest.version ||
      lock.packages?.['']?.version !== manifest.version) throw new Error('Release and lockfile versions must match.');
  const nextVersion = manifest.dependencies.next;
  if (manifest.dependencies['@next/env'] !== nextVersion ||
      lock.packages['node_modules/@next/env']?.version !== nextVersion ||
      lock.packages['node_modules/next']?.version !== nextVersion) {
    throw new Error('Next.js and the directly imported @next/env must have the same pinned version.');
  }
  const packages = new Map();
  function resolveDependency(from, dependency) {
    let directory = from;
    while (true) {
      const candidate = `${directory ? `${directory}/` : ''}node_modules/${dependency}`;
      if (lock.packages[candidate]) return candidate;
      if (!directory) throw new Error(`Missing locked dependency: ${dependency}`);
      directory = path.posix.dirname(directory);
      if (directory === '.') directory = '';
    }
  }
  function visit(location) {
    if (packages.has(location)) return;
    const entry = lock.packages[location];
    if (!entry || entry.dev || entry.link || !entry.resolved?.startsWith('https://registry.npmjs.org/')) {
      throw new Error(`Unexpected non-production or local dependency: ${location}`);
    }
    packages.set(location, { version: entry.version, integrity: entry.integrity });
    // Native optional dependencies are installed for the consumer's platform, never copied from the build host.
    for (const dependency of Object.keys(entry.dependencies ?? {})) visit(resolveDependency(location, dependency));
  }
  for (const dependency of manifest.bundleDependencies) visit(resolveDependency('', dependency));
  const postcssPath = resolveDependency('node_modules/next', 'postcss');
  if (packages.get(postcssPath)?.version !== '8.5.31') throw new Error('The release must bundle patched PostCSS 8.5.31.');
  return Object.fromEntries([...packages.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function validateBundledRuntime(root, manifest, inventory) {
  if (inventory.version !== manifest.version) throw new Error('Release and bundled runtime versions must match.');
  if (manifest.dependencies['@next/env'] !== manifest.dependencies.next ||
      !manifest.bundleDependencies?.includes('next') || !manifest.bundleDependencies?.includes('@next/env')) {
    throw new Error('Next.js and the directly imported @next/env must be pinned and bundled together.');
  }
  for (const [location, expected] of Object.entries(inventory.packages)) {
    const filename = path.join(root, location, 'package.json');
    const actual = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (actual.version !== expected.version) throw new Error(`Bundled runtime version changed: ${location}`);
  }
  const postcss = inventory.packages['node_modules/next/node_modules/postcss'] ?? inventory.packages['node_modules/postcss'];
  if (postcss?.version !== '8.5.31') throw new Error('The release must bundle patched PostCSS 8.5.31.');
  const files = listFiles(root, 'node_modules');
  if (files.some((file) => file.endsWith('.node') || file.endsWith('.map'))) throw new Error('The bundled runtime contains native binaries or source maps.');
  if (inventory.filesHash !== hashFiles(root, files)) throw new Error('Bundled runtime contents changed after staging.');
}

// @group Exports : Reuse validation from the release command and regression tests
module.exports = { BUILD_STAMP, NEXT_FILES, RUNTIME_FILES, listFiles, getRuntimeFiles, hashFiles,
  getSourceHash, validateProductionBuild, stampBuild, validateReleaseBuild, getBundledPackages, validateBundledRuntime };

// @group Configuration > Lifecycle : Never rebuild implicitly while an active preview owns .next
if (require.main === module) {
  try {
    const root = path.resolve(__dirname, '..');
    if (process.argv.includes('--stamp')) {
      stampBuild(root);
      console.log('Production build verified for release packaging.');
    } else {
      validateReleaseBuild(root, { staged: process.argv.includes('--staged') });
      console.log('Release contents verified.');
    }
  } catch (error) {
    console.error(`Release validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
