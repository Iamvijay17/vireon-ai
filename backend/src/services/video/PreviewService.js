const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const HyperFramesService = require('./HyperFramesService');
const LoggerService = require('../common/LoggerService');
const { getStorageProvider } = require('../storage/providers');

const execFileAsync = promisify(execFile);

// Single shared preview server - this is a personal, single-tenant tool (no
// `user` field anywhere in the schema), so only one Studio session previews
// at a time in practice. Switching jobId stops the previous server and
// starts a fresh one rather than pooling multiple ports/processes.
const PREVIEW_PORT = 4790;
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
// `_buildComposition` always writes into a `hf-composition` subfolder of
// whatever baseDir it's given (see HyperFramesService.js) - the CLI's
// preview server takes that folder's basename as its project id, so this is
// always the same literal string, not something to derive per job.
const PROJECT_ID = 'hf-composition';

let active = null; // { jobId, compDir, lastAccess }
let idleTimer = null;
// Serializes ensurePreview calls - each stop+build+start cycle takes several
// seconds, and two overlapping calls (e.g. the initial page-load build still
// mid-restart when a template switch fires its own debounced rebuild) race
// on the single shared server: whichever call's `start` finishes last wins,
// which can leave an EARLIER edit's content showing after a LATER edit was
// made. Confirmed by direct testing, not just a theoretical race. Queuing
// every call onto this promise chain guarantees they apply in call order.
let queue = Promise.resolve();

function getPreviewDir(jobId) {
  return path.resolve(__dirname, '../../../previews', jobId);
}

/**
 * Same Windows npx.cmd/shell quoting concern as HyperFramesService's
 * runHyperFramesCommandStreaming: with shell:true, Node does NOT auto-quote
 * array args on Windows - it just space-joins them, so this repo's own
 * "Video Generation" directory name (and any other arg with a space) splits
 * into two argv entries unless quoted first.
 */
async function runHyperFramesCommand(args, { timeout = 30000 } = {}) {
  const isWin = process.platform === 'win32';
  const npxBin = isWin ? 'npx.cmd' : 'npx';
  const quoteArg = (arg) => (isWin && /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg);
  const spawnArgs = isWin ? args.map(quoteArg) : args;
  return execFileAsync(npxBin, spawnArgs, { windowsHide: true, shell: isWin, timeout });
}

async function stopActive() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  const { compDir, jobId } = active || {};
  active = null;
  if (!compDir) return;
  try {
    await runHyperFramesCommand(['--yes', 'hyperframes@0.8.37', 'preview', compDir, '--stop']);
  } catch (err) {
    LoggerService.warn('Failed to stop idle preview server', { jobId, error: err.message });
  }
}

/**
 * Best-effort stop of whatever `hyperframes preview` server may already be
 * bound to PREVIEW_PORT for this jobId's compDir, ignoring `active` entirely.
 *
 * `active` is in-memory only, so it's wiped by any backend process restart
 * (e.g. `node --watch` picking up an unrelated file save) - but the CLI's
 * `--background` preview server is spawned detached and outlives that
 * restart, orphaned on the port with nothing left tracking it. Without this,
 * the next `ensurePreview` after a restart skips `stopActive` (active is
 * null) and tries to bind an already-occupied port, so thumbnails stay
 * permanently broken until someone manually kills the orphan. compDir is
 * deterministic per jobId (see getPreviewDir), so this can target the same
 * orphaned process even with no memory of it ever starting. Failure here
 * just means nothing was running - safe to ignore.
 */
async function stopOrphan(compDir) {
  try {
    await runHyperFramesCommand(['--yes', 'hyperframes@0.8.37', 'preview', compDir, '--stop']);
  } catch {
    // Nothing was running on this compDir - expected in the common case.
  }
}

function scheduleIdleStop() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    stopActive().catch(() => {});
  }, IDLE_TIMEOUT_MS);
  idleTimer.unref?.();
}

/**
 * Builds a scratch composition from in-memory scene edits and ensures a
 * `hyperframes preview` server is serving it, so Studio can fetch live
 * thumbnail frames without a full render.
 *
 * Confirmed by direct testing: the CLI's "changes reload automatically in
 * the studio" claim covers an actively-open Studio *browser tab* (its own
 * live-reload channel) - it does NOT cover the headless thumbnail HTTP
 * endpoint this uses. A background server kept running across an edit kept
 * serving the pre-edit composition indefinitely; only a full stop+restart
 * picked up the rewritten files. So every call here restarts the server,
 * not just ones that switch jobId - callers (ScenePreview.jsx) debounce
 * their own calls so this doesn't fire on every keystroke, since a
 * stop+start cycle costs several seconds.
 *
 * Queued onto `queue` (see its own comment) rather than run directly - two
 * calls racing here is exactly the failure mode that made a restart
 * necessary in the first place, just moved up a level.
 */
function ensurePreview(jobId, opts) {
  const result = queue.then(() => doEnsurePreview(jobId, opts));
  // Keep the queue alive even if this call fails, so a rejected build
  // doesn't wedge every subsequent call behind a permanently-rejected promise.
  queue = result.catch(() => {});
  return result;
}

async function doEnsurePreview(jobId, { scenes, resolution, fontPairing } = {}) {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error('ensurePreview requires at least one scene');
  }

  const assetsFile = {
    resolution: resolution || '1920x1080',
    fontPairing: fontPairing || 'default',
    scenes: scenes.map((scene, index) => {
      const sceneNumber = scene.sceneNumber || index + 1;
      return {
        sceneNumber,
        sceneType: scene.sceneType || (index === 0 ? 'title' : 'content'),
        title: scene.title,
        subtitle: scene.subtitle,
        elements: scene.elements || null,
        duration: scene.audio?.duration || scene.duration || 8,
        // The scene's `audio.file` field (from the DB / editor state) is a
        // bare filename ("scene1.mp3"), not a fetchable URL - same
        // resolution prepareAssets already does for real jobs (see
        // HyperFramesService.js). _buildComposition only fetches it when
        // duration > 0, so this is safe even for not-yet-generated audio.
        audio: {
          file: getStorageProvider().getPublicUrl(jobId, 'audio', `scene${sceneNumber}.mp3`),
          duration: scene.audio?.duration || 0,
        },
      };
    }),
  };

  const previewDir = getPreviewDir(jobId);
  const { compDir } = await HyperFramesService._buildComposition(jobId, assetsFile, { baseDir: previewDir });

  await stopActive();
  // Defensive stop against this specific compDir even when `active` was
  // already null - covers a backend restart orphaning the previous
  // `--background` server on this port (see stopOrphan's own comment).
  await stopOrphan(compDir);
  // Same npx version as HyperFramesService's render call - on a cold npx
  // cache (package not yet downloaded on this machine), resolving it can
  // take well over 30s, so this needs the same generous timeout as a real
  // render rather than the short one `stop` uses.
  await runHyperFramesCommand([
    '--yes', 'hyperframes@0.8.37', 'preview', compDir,
    '--background', '--port', String(PREVIEW_PORT),
  ], { timeout: 300000 });
  active = { jobId, compDir, lastAccess: Date.now() };

  scheduleIdleStop();
  return { projectId: PROJECT_ID, port: PREVIEW_PORT };
}

/** Fetches one rendered PNG frame at time `t` (seconds) from the running preview server. */
async function getThumbnail(jobId, t) {
  if (!active || active.jobId !== jobId) {
    throw new Error('No active preview for this job - call ensurePreview first');
  }
  active.lastAccess = Date.now();
  scheduleIdleStop();

  const url = `http://localhost:${PREVIEW_PORT}/api/projects/${PROJECT_ID}/thumbnail/index.html?t=${encodeURIComponent(t)}&format=png`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Preview thumbnail request failed: ${res.status} ${res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

module.exports = { ensurePreview, getThumbnail, stopActive, getPreviewDir };
