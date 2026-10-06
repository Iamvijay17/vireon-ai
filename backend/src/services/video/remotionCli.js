const { spawn } = require('child_process');
const { makeAbortError } = require('../../utils/abortableDelay');

/**
 * Matches the plain-text progress lines Remotion's CLI writes to stdout
 * when it isn't attached to a TTY (see @remotion/cli's
 * shouldUseNonOverlayingLogger + getGuiProgressSubtitle) - which is always
 * true here since execFile/spawn never gives the child a pty. Each is its
 * own line (no ANSI cursor tricks), so line-buffered parsing is reliable.
 */
const REMOTION_PROGRESS_PATTERNS = {
  bundling: /^Bundling (\d+)%/,
  rendering: /^Rendered (\d+)\/(\d+)/,
  stitching: /^Encoded (\d+)\/(\d+)/,
};

/**
 * Weights mirror @remotion/cli's own aggregate progress formula
 * (bundling*0.3 + rendering*0.6 + stitching*0.1) so the fraction handed to
 * `onProgress` tracks what Remotion itself considers "done" rather than an
 * arbitrary approximation.
 */
function parseRemotionProgressLine(line, state) {
  const bundlingMatch = line.match(REMOTION_PROGRESS_PATTERNS.bundling);
  if (bundlingMatch) {
    state.bundling = Number(bundlingMatch[1]) / 100;
    return true;
  }

  const renderingMatch = line.match(REMOTION_PROGRESS_PATTERNS.rendering);
  if (renderingMatch) {
    state.bundling = 1;
    state.rendering = Number(renderingMatch[1]) / Number(renderingMatch[2]);
    return true;
  }

  const stitchingMatch = line.match(REMOTION_PROGRESS_PATTERNS.stitching);
  if (stitchingMatch) {
    state.bundling = 1;
    state.rendering = 1;
    state.stitching = Number(stitchingMatch[1]) / Number(stitchingMatch[2]);
    return true;
  }

  return false;
}

function remotionProgressFraction(state) {
  return state.bundling * 0.3 + state.rendering * 0.6 + state.stitching * 0.1;
}

/**
 * Runs a Remotion CLI command with the child's stdout streamed line-by-line
 * to `onLine`, instead of execFile's buffer-until-exit behavior - needed so
 * render progress can be reported while the (multi-minute) render is still
 * running rather than only once it finishes. Mirrors execFileAsync's
 * contract otherwise: resolves {stdout, stderr} on exit code 0, rejects
 * with stdout/stderr/code attached on failure or timeout.
 */
function runRemotionCommandStreaming(binaryPath, args, { cwd, timeout, onLine, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(makeAbortError());
      return;
    }

    // Passing `signal` lets Node kill the child itself the moment the job
    // is cancelled (SIGTERM, then rejects with a standard AbortError below)
    // instead of only noticing between whole render attempts - a single
    // attempt can run for the full config.remotion.timeout (minutes).
    const child = spawn(process.execPath, [binaryPath, ...args], { cwd, windowsHide: true, signal });

    let stdout = '';
    let stderr = '';
    let lineBuffer = '';
    let settled = false;

    const timer = timeout
      ? setTimeout(() => {
          if (settled) return;
          settled = true;
          child.kill();
          const err = new Error(`Command timed out after ${timeout}ms`);
          Object.assign(err, { stdout, stderr, code: 'ETIMEDOUT' });
          reject(err);
        }, timeout)
      : null;

    child.stdout.on('data', (chunk) => {
      const str = chunk.toString('utf8');
      stdout += str;
      lineBuffer += str;
      let newlineIndex;
      while ((newlineIndex = lineBuffer.indexOf('\n')) !== -1) {
        const line = lineBuffer.slice(0, newlineIndex).trim();
        lineBuffer = lineBuffer.slice(newlineIndex + 1);
        if (line && onLine) onLine(line);
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      Object.assign(err, { stdout, stderr });
      reject(err);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const err = new Error(`Command failed with exit code ${code}`);
        Object.assign(err, { stdout, stderr, code, status: code });
        reject(err);
      }
    });
  });
}

module.exports = { parseRemotionProgressLine, remotionProgressFraction, runRemotionCommandStreaming };
