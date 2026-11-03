// Bumps the version used by every commit: release.major.minor (e.g. 1.0.3).
//   node scripts/bump-version.mjs            -> minor +1 (default, every commit)
//   node scripts/bump-version.mjs major      -> major +1, minor reset to 0
//   node scripts/bump-version.mjs release    -> release +1, major and minor reset to 0
// Updates package.json, package-lock.json and src/version.ts together.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kind = process.argv[2] ?? 'minor';
const pkgPath = resolve(root, 'package.json');
const lockPath = resolve(root, 'package-lock.json');
const versionPath = resolve(root, 'src/version.ts');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const [release, major, minor] = pkg.version.split('.').map(Number);

const next = {
  release: [release + 1, 0, 0],
  major: [release, major + 1, 0],
  minor: [release, major, minor + 1],
}[kind];
if (!next) {
  console.error(`unknown bump "${kind}" — use release, major or minor`);
  process.exit(1);
}
const version = next.join('.');

pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
lock.version = version;
if (lock.packages?.['']) lock.packages[''].version = version;
writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');

writeFileSync(versionPath, `export const APP_VERSION = '${version}';\n`);
console.log(`version ${version} (was ${[release, major, minor].join('.')})`);
