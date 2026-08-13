#!/usr/bin/env node
/**
 * Fails the deploy when a page references a file that is not in the artifact.
 *
 * This site ships as static files with no bundler, so nothing ever resolves
 * the reference graph before it reaches a visitor. A module that imports a
 * sibling that was never committed does not fail loudly at build time — it
 * 404s in the browser and takes the whole import graph down with it, so the
 * page renders but does nothing.
 *
 * The near miss that prompted this: js/lib/realismCheck.js was updated to
 * import ./format.js, a brand-new file. `git commit -a` does not stage
 * untracked files, so the import would have shipped without its target and
 * broken race-time.html completely — a worse outcome than the rounding bug
 * the change was fixing.
 *
 * Lives under .github/ on purpose: the sync from apex-flow/website/ runs
 * `rsync --delete` and excludes only .git, .github and .gitignore, so a
 * script anywhere else would be deleted on the next sync.
 *
 *   node .github/scripts/check-imports.mjs
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKIP_DIRS = ['.git', '.github', 'node_modules', 'fonts', 'images', 'data'];

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.includes(e.name)) walk(join(dir, e.name), out);
    } else if (/\.(js|mjs|html)$/.test(e.name)) {
      out.push(join(dir, e.name));
    }
  }
  return out;
}

/** Resolve a reference as the browser would, or null if it is not ours. */
function target(spec, fromFile) {
  if (/^(https?:)?\/\//.test(spec) || spec.startsWith('data:') || spec.startsWith('#')) return null;
  const clean = spec.split(/[?#]/)[0];
  if (!clean) return null;
  return clean.startsWith('/') ? join(ROOT, clean) : resolve(dirname(fromFile), clean);
}

const PATTERNS = [
  // import x from './y.js' / export * from './y.js' / import('./y.js')
  { re: /(?:^|[\s;}])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g, kind: 'import', files: /\.(js|mjs)$/ },
  { re: /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, kind: 'import()', files: /\.(js|mjs|html)$/ },
  { re: /<script[^>]+src\s*=\s*['"]([^'"]+)['"]/gi, kind: '<script src>', files: /\.html$/ },
  { re: /<link[^>]+rel\s*=\s*['"]stylesheet['"][^>]*href\s*=\s*['"]([^'"]+)['"]/gi, kind: '<link css>', files: /\.html$/ },
  { re: /<link[^>]+href\s*=\s*['"]([^'"]+)['"][^>]*rel\s*=\s*['"]stylesheet['"]/gi, kind: '<link css>', files: /\.html$/ },
];

const files = walk(ROOT);
const missing = [];
let checked = 0;

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const { re, kind, files: applies } of PATTERNS) {
    if (!applies.test(file)) continue;
    for (const m of src.matchAll(re)) {
      const abs = target(m[1], file);
      if (!abs) continue;
      checked++;
      if (!existsSync(abs) || !statSync(abs).isFile()) {
        missing.push({ from: relative(ROOT, file), spec: m[1], kind });
      }
    }
  }
}

if (missing.length) {
  console.error(`\n${missing.length} Referenz(en) zeigen ins Leere:\n`);
  for (const m of missing) console.error(`  ${m.from}\n      ${m.kind}  ->  ${m.spec}  (fehlt)`);
  console.error('\nMeist eine neue Datei, die nicht mit committet wurde (git add).\n');
  process.exit(1);
}

console.log(`ok  ${checked} lokale Referenzen in ${files.length} Dateien loesen auf`);
