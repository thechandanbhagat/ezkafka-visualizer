import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NEXT_FILES, RUNTIME_FILES, getRuntimeFiles, stampBuild, validateReleaseBuild,
  validateProductionBuild, getBundledPackages, validateBundledRuntime, hashFiles, listFiles } from '../../scripts/release-validation.cjs';
import { validatePackManifest } from '../../scripts/release-pack.cjs';

// @group TestSetup : Isolated build fixtures never read or modify the active Next.js output
const scratchRoot = path.resolve('excluded/test-scripts');
const fixtures: string[] = [];
fs.mkdirSync(scratchRoot, { recursive: true });
afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    if (path.dirname(fixture) !== scratchRoot) throw new Error('Unexpected fixture path');
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

// @group TestHelpers : Minimal production build and dependency graph with development-only entries
const manifest = {
  name: 'ezkafka-visualizer', version: '1.1.0',
  dependencies: { next: '15.5.28', '@next/env': '15.5.28' },
  bundleDependencies: ['next', '@next/env'],
};
function getLock() {
  return { name: manifest.name, version: manifest.version, lockfileVersion: 3,
    packages: {
      '': { ...manifest, devDependencies: { vitest: '^4' } },
      'node_modules/next': { version: '15.5.28', resolved: 'https://registry.npmjs.org/next/-/next-15.5.28.tgz',
        dependencies: { postcss: '8.4.31' }, optionalDependencies: { '@next/swc-linux-x64-gnu': '15.5.28' },
        peerDependencies: { '@playwright/test': '^1' }, peerDependenciesMeta: { '@playwright/test': { optional: true } } },
      'node_modules/@next/env': { version: '15.5.28', resolved: 'https://registry.npmjs.org/@next/env/-/env-15.5.28.tgz' },
      'node_modules/postcss': { version: '8.5.31', resolved: 'https://registry.npmjs.org/postcss/-/postcss-8.5.31.tgz' },
      'node_modules/vitest': { version: '4.0.0', dev: true },
      'node_modules/@playwright/test': { version: '1.64.1', devOptional: true },
      'node_modules/@next/swc-linux-x64-gnu': { version: '15.5.28', optional: true, os: ['linux'] },
    } };
}
function write(root: string, file: string, value = '{}') {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), value);
}
function createBuild() {
  const root = fs.mkdtempSync(path.join(scratchRoot, 'release-unit-'));
  fixtures.push(root);
  for (const filename of NEXT_FILES) write(root, `.next/${filename}`);
  for (const filename of RUNTIME_FILES) write(root, filename, '// runtime');
  write(root, '.next/BUILD_ID', 'production-build');
  write(root, '.next/server/app-paths-manifest.json');
  write(root, '.next/server/middleware-manifest.json');
  write(root, '.next/static/chunks/application.js', '// compiled application');
  write(root, 'package.json', JSON.stringify(manifest));
  write(root, 'package-lock.json', JSON.stringify(getLock()));
  write(root, 'next.config.ts');
  write(root, 'postcss.config.mjs');
  write(root, 'tsconfig.json');
  write(root, 'src/app/page.tsx', 'export default function Page() {}');
  return root;
}
function createBundledRuntime(root: string) {
  const packages = getBundledPackages(manifest, getLock());
  for (const [location, entry] of Object.entries(packages)) {
    write(root, `${location}/package.json`, JSON.stringify(entry));
  }
  const inventory = { version: manifest.version, packages, filesHash: hashFiles(root, listFiles(root, 'node_modules')) };
  write(root, 'release-runtime.json', JSON.stringify(inventory));
  return inventory;
}

// @group UnitTests > Build : Release requires an unchanged, complete production build
describe('release build verification', () => {
  it('accepts a stamped production build', () => {
    const root = createBuild();
    const metadata = stampBuild(root);
    expect(validateReleaseBuild(root).metadata).toEqual(metadata);
    expect(metadata.version).toBe('1.1.0');
  });

  it.each(['', 'development'])('rejects an invalid production build id %j', (buildId) => {
    const root = createBuild();
    write(root, '.next/BUILD_ID', buildId);
    expect(() => stampBuild(root)).toThrow('production build');
  });

  it('rejects mixed development output even when an older BUILD_ID remains', () => {
    const root = createBuild();
    write(root, '.next/static/development/_buildManifest.js');
    expect(() => stampBuild(root)).toThrow('Development output');
  });

  it('rejects development build manifests', () => {
    const root = createBuild();
    write(root, '.next/build-manifest.json', JSON.stringify({ devFiles: ['hot-reloader.js'] }));
    expect(() => stampBuild(root)).toThrow('Development output');
  });

  it('rejects incomplete browser assets', () => {
    const root = createBuild();
    fs.unlinkSync(path.join(root, '.next/static/chunks/application.js'));
    expect(() => validateProductionBuild(root)).toThrow('browser assets');
  });

  it('rejects unstamped output and runtime edits after the build', () => {
    const root = createBuild();
    expect(() => validateReleaseBuild(root)).toThrow('verification is missing');
    stampBuild(root);
    write(root, '.next/static/chunks/application.js', '// changed by dev server');
    expect(() => validateReleaseBuild(root)).toThrow('Build output changed');
  });

  it('rejects source or version changes after the build', () => {
    const root = createBuild();
    stampBuild(root);
    write(root, 'src/app/page.tsx', '// another revision');
    expect(() => validateReleaseBuild(root)).toThrow('Source changed');
    write(root, 'package.json', JSON.stringify({ ...manifest, version: '1.2.0' }));
    expect(() => validateReleaseBuild(root)).toThrow('version changed');
  });

  it('verifies staged content without requiring source or development dependencies', () => {
    const root = createBuild();
    stampBuild(root);
    fs.unlinkSync(path.join(root, 'src/app/page.tsx'));
    expect(() => validateReleaseBuild(root, { staged: true })).toThrow('release:pack');
    createBundledRuntime(root);
    expect(validateReleaseBuild(root, { staged: true }).manifest.version).toBe('1.1.0');
  });

  it('does not select caches, duplicated dependencies, source maps, or tracing files', () => {
    const root = createBuild();
    for (const filename of ['.next/cache/cache.bin', '.next/standalone/node_modules/next/index.js',
      '.next/diagnostics/build.json', '.next/static/chunks/application.js.map', '.next/server/app.js.nft.json']) {
      write(root, filename, 'excluded');
    }
    const files = getRuntimeFiles(root);
    expect(files).toContain('.next/static/chunks/application.js');
    expect(files).not.toEqual(expect.arrayContaining([expect.stringMatching(/cache|standalone|diagnostics|\.map$|\.nft\.json$/)]));
  });
});

// @group UnitTests > Dependencies : Bundle the patched runtime without copying native or optional peer packages
describe('bundled production dependencies', () => {
  it('selects the required closure and excludes optional native or peer-only test dependencies', () => {
    const lock = getLock();
    const packages = getBundledPackages(manifest, lock);
    expect(packages['node_modules/next'].version).toBe('15.5.28');
    expect(packages['node_modules/postcss'].version).toBe('8.5.31');
    expect(packages['node_modules/vitest']).toBeUndefined();
    expect(packages['node_modules/@playwright/test']).toBeUndefined();
    expect(packages['node_modules/@next/swc-linux-x64-gnu']).toBeUndefined();
    expect(lock.packages['node_modules/vitest']).toBeDefined();
  });

  it('rejects vulnerable PostCSS, mismatched Next.js imports, and version drift', () => {
    const release = getLock();
    release.packages['node_modules/postcss'].version = '8.4.31';
    expect(() => getBundledPackages(manifest, release)).toThrow('patched PostCSS');
    release.packages['node_modules/postcss'].version = '8.5.31';
    release.packages['node_modules/@next/env'].version = '15.5.27';
    expect(() => getBundledPackages(manifest, release)).toThrow('same pinned version');
    release.version = '1.0.0';
    expect(() => getBundledPackages(manifest, release)).toThrow('versions must match');
  });

  it('rejects local dependency paths', () => {
    const release = getLock();
    release.packages['node_modules/next'].resolved = 'file:../local-next';
    expect(() => getBundledPackages(manifest, release)).toThrow('local dependency');
  });

  it('rejects changed bundled runtime content', () => {
    const root = createBuild();
    const inventory = createBundledRuntime(root);
    expect(() => validateBundledRuntime(root, manifest, inventory)).not.toThrow();
    write(root, 'node_modules/next/runtime.js', 'unexpected contents');
    expect(() => validateBundledRuntime(root, manifest, inventory)).toThrow('contents changed');
  });

  it('rejects build-host native binaries', () => {
    const root = createBuild();
    const inventory = createBundledRuntime(root);
    write(root, 'node_modules/next/compiler.node', 'native binary');
    expect(() => validateBundledRuntime(root, manifest, inventory)).toThrow('native binaries');
  });
});

// @group UnitTests > Tarball : Extra files cannot silently enter a reviewed package
describe('packed file inventory', () => {
  it('requires exactly the reviewed files', () => {
    const files = [{ path: 'package.json' }, { path: 'server.js' }];
    expect(() => validatePackManifest({ files }, ['server.js', 'package.json'])).not.toThrow();
    expect(() => validatePackManifest({ files }, ['package.json'])).toThrow('inventory');
  });

  it.each(['.env.local', '.npmrc', '.next/cache/data', '.next/standalone/server.js',
    'native.node', '.next/static/source.js.map'])('rejects %s', (filename) => {
    expect(() => validatePackManifest({ files: [{ path: filename }] }, [filename])).toThrow('private, or platform-specific');
  });
});
