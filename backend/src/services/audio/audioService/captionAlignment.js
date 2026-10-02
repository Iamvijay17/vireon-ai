const { execFile } = require("child_process");
const { promisify } = require("util");
const path = require("path");
const LoggerService = require("../../common/LoggerService");

const execFileAsync = promisify(execFile);

/**
 * Run forced alignment on a finished audio clip to get real per-word
 * timestamps for caption sync. Best-effort: returns null on any failure
 * (missing python/faster-whisper, timeout, etc.) rather than throwing,
 * since a missing alignment just means CaptionRenderer's estimated-pace
 * fallback kicks in instead.
 *
 * Async (execFile, not execFileSync) so this ~7s subprocess doesn't block
 * Node's event loop - with the worker's `concurrency: 3`, a blocking call
 * here previously froze every other concurrently-processing job for its
 * entire duration, not just the one it belongs to. Also lets
 * generateAllAudio overlap one scene's alignment with the next scene's
 * TTS call instead of paying for both serially.
 */
async function alignCaptions(audioFilePath) {
  try {
    const script = path.resolve(__dirname, "../alignCaptions.py");
    const { stdout } = await execFileAsync("python", [script, audioFilePath], {
      encoding: "utf8",
      timeout: 60000,
    });

    const lastLine = stdout.trim().split("\n").filter(Boolean).pop() || "[]";
    const words = JSON.parse(lastLine);
    return Array.isArray(words) && words.length > 0 ? words : null;
  } catch (err) {
    LoggerService.warn("Caption alignment failed, falling back to estimated pacing", {
      error: err.message,
    });
    return null;
  }
}

module.exports = { alignCaptions };
