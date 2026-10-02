/**
 * Remotion is CPU-bound (spawned per-render via child_process, see
 * RemotionService.renderVideo) and never competes for GPU VRAM, so it
 * isn't registered with GPUResourceManager - this is just a busy/idle
 * counter for the /api/system/ai-services dashboard display, intentionally
 * as simple as the "don't build complicated GPU monitoring" guidance asks.
 */
let activeRenders = 0;

function begin() {
  activeRenders += 1;
}

function end() {
  activeRenders = Math.max(0, activeRenders - 1);
}

function getStatus() {
  return { status: activeRenders > 0 ? 'busy' : 'idle', active: activeRenders };
}

module.exports = { begin, end, getStatus };
