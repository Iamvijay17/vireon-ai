// Starts the local MinIO server for the `start` / `dev` / `worker*` npm
// scripts. Everything comes from backend/.env, so no machine path is baked
// into package.json:
//   MINIO_EXE           path to the minio binary (default: `minio` on PATH)
//   MINIO_DATA_DIR      data directory (required - without it this is a no-op)
//   MINIO_PORT          API port (default 9000)
//   MINIO_CONSOLE_PORT  web console port (default 9001)
//   MINIO_ROOT_USER / MINIO_ROOT_PASSWORD  passed through to MinIO
// If MinIO is already running, the new process fails to bind and exits;
// concurrently runs with --kill-others-on-fail=false, so that is harmless.
const path = require('path');
const { spawn } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const exe = process.env.MINIO_EXE || 'minio';
const dataDir = process.env.MINIO_DATA_DIR;
const port = process.env.MINIO_PORT || '9000';
const consolePort = process.env.MINIO_CONSOLE_PORT || '9001';

if (!dataDir) {
  console.log('[minio] MINIO_DATA_DIR is not set in backend/.env - not starting MinIO (assuming it runs elsewhere).');
  process.exit(0);
}

const child = spawn(exe, ['server', dataDir, '--address', `:${port}`, '--console-address', `:${consolePort}`], {
  stdio: 'inherit',
  env: process.env,
});

child.on('error', (err) => {
  console.error(`[minio] could not start "${exe}": ${err.message}. Set MINIO_EXE in backend/.env.`);
  process.exit(0);
});
child.on('exit', (code) => process.exit(code ?? 0));
