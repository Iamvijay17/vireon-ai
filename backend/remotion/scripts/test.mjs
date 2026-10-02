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
const entry = path.join(__dirname, '..', 'src', 'engine', '__tests__', 'engine.test.js');
const outfile = path.join(os.tmpdir(), `vireon-engine-tests-${Date.now()}.cjs`);

buildSync({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile,
  external: ['node:test', 'node:assert', 'node:assert/strict'],
  logLevel: 'silent',
});

const result = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit' });

fs.rmSync(outfile, { force: true });

process.exit(result.status ?? 1);
