// Lightweight test runner for the generative engine's pure-logic modules.
//
// The project has no test framework configured, and its source uses plain
// ESM import/export without file extensions (resolved by Remotion's webpack
// bundler at build time, not by Node directly). Rather than add a new
// dependency, this bundles the test file with `esbuild` - already present
// transitively via @remotion/cli - into a single CJS file Node can run
// directly against its own built-in test runner (`node:test`).
import { buildSync } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Every suite is bundled into its own file and run by Node's test runner together.
const entries = [
  path.join(__dirname, '..', 'src', 'engine', '__tests__', 'engine.test.js'),
  path.join(__dirname, '..', 'src', 'engine', '__tests__', 'verticalLayout.test.js'),
  path.join(__dirname, '..', 'src', 'speech', '__tests__', 'speech.test.js'),
];
const stamp = Date.now();
const outfiles = entries.map((entry, i) => {
  const outfile = path.join(os.tmpdir(), `vireon-tests-${stamp}-${i}.cjs`);
  buildSync({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    // .js files hold JSX in this project (the same loader Remotion's bundler uses).
    loader: { '.js': 'jsx' },
    jsx: 'automatic',
    external: ['node:test', 'node:assert', 'node:assert/strict'],
    logLevel: 'silent',
  });
  return outfile;
});

const result = spawnSync(process.execPath, ['--test', ...outfiles], { stdio: 'inherit' });

for (const outfile of outfiles) fs.rmSync(outfile, { force: true });

process.exit(result.status ?? 1);
