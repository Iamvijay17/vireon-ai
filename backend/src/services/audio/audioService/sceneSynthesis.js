const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs").promises;
const path = require("path");
const config = require("../../../config");
const LoggerService = require("../../common/LoggerService");
const { getStorageProvider } = require("../../storage/providers");
const { resolveVoice } = require("./voiceCatalog");
const { seedForScene } = require("./seeding");
const ttsClient = require("./ttsClient");
const { alignCaptions } = require("./captionAlignment");

const execFileAsync = promisify(execFile);

/**
 * Podcast turns are synthesized one at a time with no awareness of the
 * conversation around them, which is what made two alternating voices
 * read as two monologues instead of people talking to each other. Give
 * the TTS model an explicit conversational-delivery instruction based on
 * the turn's role so host/guest lines actually sound like they're
 * reacting to one another.
 */
function instructFor(scene) {
  // A line can carry more than one emotion in a single breath (self-aware
  // humor sliding into real nervousness, then curiosity) - no fixed
  // per-role string captures that. The script LLM writes the line and
  // already knows its intended emotional arc, so prefer its own
  // scene.audio.emotion note (e.g. "wry and relatable at first, a flash
  // of genuine nervousness on 'terrifying', landing on sincere
  // curiosity") over a generic role-based default.
  const emotion = scene?.audio?.emotion?.trim();

  if (scene?.speaker === "host") {
    return emotion
      ? `Speak like a podcast host in a live conversation with a guest, with this delivery: ${emotion}`
      : "Speak like a podcast host in a live conversation with a guest: warm, curious, reacting naturally to what was just said.";
  }
  if (scene?.speaker === "guest") {
    return emotion
      ? `Speak like a podcast guest responding to the host in a live conversation, with this delivery: ${emotion}`
      : "Speak like a podcast guest responding to the host in a live conversation: natural, engaged, as if genuinely replying to their question.";
  }
  if (emotion) {
    return `Speak naturally like a human narrator, with this delivery: ${emotion}`;
  }
  // Default narrator delivery for non-podcast scenes. Without this the
  // Qwen3-TTS custom-voice endpoint gets an empty instruct and falls back
  // to a flat, monotone read-the-text-aloud delivery instead of sounding
  // like a human narrator.
  return "Speak naturally and expressively like a human narrator telling a story: vary your pitch, pace and emphasis, add warmth and emotion that fits the content, and avoid a flat monotone reading.";
}

/**
 * Synthesize + download a single scene's audio and resolve its final
 * timeline duration. Implements retry with exponential backoff.
 * Deliberately does NOT run caption alignment (see captionAlignment.js) -
 * that's a separate ~7s CPU-bound step with no dependency on the next
 * scene's TTS call, so generateAllAudio pipelines it against the next
 * scene's synthesis instead of paying for both serially. generateSceneAudio
 * below (the public single-scene entry point) still does both together for
 * standalone callers like "regenerate this one scene's audio".
 */
async function synthesizeSceneAudio(jobId, scene, voice, fastMode = false) {
  const { Client } = require("@gradio/client");
  const { text } = scene.audio;
  if (!text) {
    LoggerService.warn("Scene has no audio text, skipping", {
      sceneNumber: scene.sceneNumber,
    });
    return null;
  }

  const audioDir = path.resolve(__dirname, "../../../../jobs", jobId, "audio");
  await fs.mkdir(audioDir, { recursive: true });

  const outputFile = path.join(audioDir, `scene${scene.sceneNumber}.mp3`);
  let lastError = null;

  // Resolve the voice once up front - an invalid/missing clone file is a
  // configuration error, not a transient failure, so don't retry on it.
  const resolved = await resolveVoice(voice);

  // Fixed per-job (or per-podcast-turn) seed so every scene, including
  // later resumed ones, deterministically reproduces the same prosody
  // instead of a random seed per call.
  const seed = seedForScene(jobId, scene, voice);

  for (let attempt = 1; attempt <= config.tts.maxRetries; attempt++) {
    try {
      LoggerService.tts(
        `Generating audio scene ${scene.sceneNumber} (attempt ${attempt})`,
        {
          voice,
          mode: resolved.mode,
          speaker: resolved.speaker,
          cloneFile: resolved.file,
          textLength: text.length,
        },
      );

      // Connect to Gradio Qwen3-TTS server. ttsClient.generate always
      // closes the connection, even on failure, so a run of TTS
      // retries/scenes doesn't leak one websocket connection per attempt.
      const client = await Client.connect(
        config.tts.url.replace(/\/generate$/, "").replace(/\/$/, ""),
      );

      const instruct = instructFor(scene);
      const result = await ttsClient.generate(client, resolved, text, seed, instruct, fastMode);

      const audio = result.data[0];

      if (audio && audio.url) {
        // Download the generated audio
        const outputResponse = await fetch(audio.url);
        if (!outputResponse.ok) {
          throw new Error(
            `Failed to download generated audio: ${outputResponse.status} ${outputResponse.statusText}`,
          );
        }
        const outputAudioBuffer = await outputResponse.arrayBuffer();
        await fs.writeFile(outputFile, Buffer.from(outputAudioBuffer));

        // Get exact duration by decoding the audio file via helper ESM script
        const helperScript = path.resolve(__dirname, "../getAudioDuration.mjs");
        const { stdout: durationStr } = await execFileAsync(
          "node",
          [helperScript, outputFile],
          { encoding: "utf8", timeout: 30000 },
        );
        const duration = parseFloat(durationStr);

        LoggerService.tts(`Audio generated for scene ${scene.sceneNumber}`, {
          file: `scene${scene.sceneNumber}.mp3`,
          duration: duration,
        });

        const spokenDuration = duration || Math.ceil(text.split(" ").length * 0.4); // fallback: ~0.4s per word

        // Podcast turns are rendered back-to-back with zero gap (the next
        // scene's Sequence starts the instant this one's declared duration
        // ends), so the next speaker cut in immediately - reading as two
        // people talking at/over each other rather than a real
        // back-and-forth. Pad the timeline duration (not the clip itself)
        // with a short natural beat so the next turn has a breath of space
        // to land in. A fixed gap read as metronomic across 30 turns, so
        // vary it (0.15-0.5s) using the same per-turn seed already derived
        // above - still fully deterministic/resumable, just not identical
        // every time. Non-podcast scenes (scene.speaker is unset) keep the
        // exact audio length.
        const turnGap =
          scene.speaker === "host" || scene.speaker === "guest" ? 0.15 + (seed % 350) / 1000 : 0;

        // Upload to storage the moment the file exists, rather than
        // waiting for a bulk end-of-pipeline upload - backend/jobs/ is
        // scratch space now, MinIO is the durable copy. `jobId` here is
        // the video's own id (see the storage plan's bucket table).
        await getStorageProvider().uploadFile(jobId, outputFile, "audio");

        return {
          file: `scene${scene.sceneNumber}.mp3`,
          path: outputFile,
          duration: spokenDuration + turnGap,
        };
      }

      throw new Error("No audio URL returned from TTS API");
    } catch (err) {
      lastError = err;
      const isLastAttempt = attempt === config.tts.maxRetries;

      LoggerService.warn(
        `TTS attempt ${attempt} failed for scene ${scene.sceneNumber}${isLastAttempt ? " (final)" : ""}`,
        { error: err.message },
      );

      if (!isLastAttempt) {
        const delay = Math.min(2000 * Math.pow(2, attempt - 1), 16000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `TTS failed after ${config.tts.maxRetries} attempts for scene ${scene.sceneNumber}: ${lastError.message}`,
  );
}

/**
 * Public single-scene entry point: synthesize + align in one call. Used
 * by standalone "regenerate this one scene" callers that have no next
 * scene to pipeline alignment against (see synthesizeSceneAudio).
 */
async function generateSceneAudio(jobId, scene, voice, fastMode = false) {
  const result = await synthesizeSceneAudio(jobId, scene, voice, fastMode);
  if (!result) return null;
  const captionTimestamps = await alignCaptions(result.path);
  // Already uploaded to storage inside synthesizeSceneAudio - see the
  // matching cleanup in generateAllAudio for why the local copy isn't
  // needed once alignment (the last local-path consumer) is done.
  await fs.unlink(result.path).catch(() => {});
  return { ...result, captionTimestamps };
}

/**
 * Generate audio for all scenes in a script.
 * If `onSceneComplete(sceneNumber, result)` is provided, it is invoked
 * immediately after each individual scene's audio finishes, so callers can
 * persist/broadcast progress without waiting for the whole batch.
 * If `checkCancelled` is provided, it's awaited before each scene - it
 * should throw to abort the batch (used to let a "stop job" request take
 * effect between scenes instead of only after the whole batch finishes).
 *
 * Pipelined: scene N's caption alignment (~7s, CPU-bound, local subprocess)
 * runs concurrently with scene N+1's TTS synthesis (network/GPU-bound,
 * ~45-65s) instead of paying for both back to back - they're independent
 * resources with no reason to serialize. This never has two TTS requests
 * in flight at once, so it doesn't depend on the TTS server supporting
 * concurrent generation.
 */
async function generateAllAudio(jobId, scenes, voice, onSceneComplete, checkCancelled, fastMode = false) {
  LoggerService.tts("Starting batch audio generation", {
    jobId,
    scenes: scenes.length,
    voice,
  });

  const results = [];
  // Holds the previous scene's synthesized result plus its in-flight
  // alignment promise, so it can be settled and flushed (persisted, via
  // onSceneComplete) once the *next* scene's synthesis has already been
  // kicked off - not before.
  let pending = null;

  for (let i = 0; i <= scenes.length; i++) {
    const scene = scenes[i]; // undefined on the final flush-only pass

    let synthesizing = null;
    if (scene) {
      if (typeof checkCancelled === "function") {
        await checkCancelled();
      }
      synthesizing = synthesizeSceneAudio(jobId, scene, voice || scene.audio?.voice, fastMode);
    }

    if (pending) {
      const captionTimestamps = await pending.alignmentPromise;
      const result = { ...pending.synthResult, captionTimestamps };
      results.push(result);
      if (typeof onSceneComplete === "function") {
        await onSceneComplete(pending.scene.sceneNumber, result);
      }
      // Already durably in storage (see synthesizeSceneAudio's upload)
      // and alignment (the only other consumer of the local path) just
      // finished above - nothing left needs the local copy, so drop it
      // instead of letting backend/jobs/ accumulate every scene's audio
      // for the whole pipeline run.
      await fs.unlink(pending.synthResult.path).catch(() => {});
    }
    pending = null;

    if (!scene) break;

    const synthResult = await synthesizing;
    if (synthResult) {
      pending = { scene, synthResult, alignmentPromise: alignCaptions(synthResult.path) };
    }
  }

  LoggerService.tts("Batch audio generation complete", {
    jobId,
    generated: results.length,
  });

  return results;
}

module.exports = { instructFor, synthesizeSceneAudio, generateSceneAudio, generateAllAudio };
