const { Client } = require("@gradio/client");
const fs = require("fs").promises;
const path = require("path");
const config = require("../../config");
const LoggerService = require("../common/LoggerService");
const { getStorageProvider } = require("../storage/providers");
const AudioService = require("../audio/audioService");
const LocalAIService = require("../localAI");
const withTimeout = require("../../utils/withTimeout");

/**
 * Service for animating a source portrait photo into a small talking-head
 * clip via the MuseTalk Gradio app (see AvatarService.animatePortrait).
 * Mouth motion is driven by the job's own narration audio (a single
 * concatenated track built by narrationTrack.buildNarrationTrack from the
 * job's per-scene TTS output), so the avatar's lips actually track what's
 * being said instead of a canned reference clip. The source photo isn't
 * user-supplied either - it's one of two bundled default portraits
 * (config.avatar.default{Male,Female}ImagePath), picked by the job's own
 * narration voice's gender (see resolveDefaultSourceImage) so the avatar
 * matches the voice without asking the user for a photo.
 *
 * Because the output now depends on the job's own narration content (not
 * just the source image), it's no longer one of a fixed handful of possible
 * outputs - unlike the old LivePortrait-driven version, results aren't
 * cached across jobs.
 *
 * Single Responsibility: avatar overlay clip generation.
 */
class AvatarService {
  /**
   * Picks the bundled default portrait matching `voice`'s gender (reusing
   * AudioService's own voice-metadata gender lookup, the same data already
   * driving the Voice Library's gender filter). Unknown/undetectable gender
   * (e.g. a from-scratch "design:" voice with no gender cue in its
   * description) falls back to the female portrait.
   */
  static resolveDefaultSourceImage(voice) {
    const gender = AudioService.resolveGenderSync(voice);
    return gender === "male" ? config.avatar.defaultMaleImagePath : config.avatar.defaultFemaleImagePath;
  }

  /**
   * Uploads a local file to the Gradio app's REST /upload endpoint and
   * returns the resulting server-side temp path. Goes through this manual
   * multipart path (rather than passing a Blob straight into
   * client.predict) because @gradio/client's own blob-upload path drops the
   * original filename (see FormData.append("files", blob) with no filename
   * argument), which makes a Gradio server reject the file - it infers
   * media type from the uploaded file's extension (confirmed against
   * LivePortrait's server; assumed to hold for MuseTalk's too, since both
   * are plain Gradio apps).
   */
  static async _uploadFile(baseUrl, filePath, filename, mimeType) {
    const buf = await fs.readFile(filePath);
    const form = new FormData();
    form.append("files", new Blob([buf], { type: mimeType }), filename);
    const res = await fetch(`${baseUrl}/upload`, { method: "POST", body: form });
    if (!res.ok) {
      throw new Error(`MuseTalk upload failed: ${res.status} ${await res.text()}`);
    }
    const paths = await res.json();
    return paths[0];
  }

  static _fileData(serverPath, origName) {
    return { path: serverPath, orig_name: origName, meta: { _type: "gradio.FileData" } };
  }

  /**
   * Animate `sourceImagePath` (a local file on disk) with `narrationAudioPath`
   * (a local WAV file - see narrationTrack.buildNarrationTrack), download the
   * result, and save it to jobs/{jobId}/avatar/avatar.mp4 - same
   * jobs/{jobId}/<kind>/ convention AudioService uses for jobs/{jobId}/audio/.
   */
  static async animatePortrait(jobId, sourceImagePath, narrationAudioPath, signal) {
    return LocalAIService.gpu.withGPU("avatar", () => this._generateViaMuseTalk(jobId, sourceImagePath, narrationAudioPath, signal));
  }

  static async _generateViaMuseTalk(jobId, sourceImagePath, narrationAudioPath, signal) {
    const baseUrl = config.avatar.url.replace(/\/$/, "");
    const avatarDir = path.resolve(__dirname, "../../../jobs", jobId, "avatar");
    await fs.mkdir(avatarDir, { recursive: true });
    const outputFile = path.join(avatarDir, "avatar.mp4");

    let lastError = null;
    for (let attempt = 1; attempt <= config.avatar.maxRetries; attempt++) {
      try {
        LoggerService.info(`Generating avatar overlay (attempt ${attempt})`, { jobId, sourceImagePath });

        const srcExt = path.extname(sourceImagePath).slice(1) || "jpg";
        const srcMime = srcExt === "png" ? "image/png" : "image/jpeg";

        const [srcServerPath, audioServerPath] = await Promise.all([
          this._uploadFile(baseUrl, sourceImagePath, `source.${srcExt}`, srcMime),
          this._uploadFile(baseUrl, narrationAudioPath, "narration.wav", "audio/wav"),
        ]);

        // Timeouts guard against a wedged Gradio server (queue subsystem
        // stuck even though its health check still passes) hanging this
        // call forever - see withTimeout's doc comment. `signal` additionally
        // lets a user's Stop click interrupt this call immediately instead
        // of only being noticed after the whole avatar step finishes - see
        // videoWorker/avatarStep.js.
        const client = await withTimeout(Client.connect(baseUrl), config.avatar.timeout, "Connecting to MuseTalk server timed out", signal);

        // NOTE: endpoint name/positional args below match MuseTalk's stock
        // Gradio demo app (image + audio -> lip-synced video). Verify/adjust
        // against the actually-running app the first time it's reachable -
        // same as LivePortrait's own params were hand-verified previously.
        let result;
        try {
          result = await withTimeout(client.predict("/inference", [
            this._fileData(srcServerPath, `source.${srcExt}`), // source image
            this._fileData(audioServerPath, "narration.wav"), // driving audio
            0, // bbox_shift
          ]), config.avatar.timeout, "MuseTalk generation timed out", signal);
        } finally {
          client.close();
        }

        const animatedVideo = result.data?.[0]?.video || result.data?.[0];
        if (!animatedVideo?.url) {
          throw new Error("No animated video returned from MuseTalk");
        }

        const videoRes = await fetch(animatedVideo.url);
        if (!videoRes.ok) {
          throw new Error(`Failed to download animated video: ${videoRes.status} ${videoRes.statusText}`);
        }
        await fs.writeFile(outputFile, Buffer.from(await videoRes.arrayBuffer()));

        // Upload immediately - backend/jobs/ is scratch space, MinIO is the
        // durable copy. `jobId` here is the video's own id.
        const url = await getStorageProvider().uploadFile(jobId, outputFile, "avatar");

        LoggerService.success("Avatar overlay generated", { jobId, file: "avatar/avatar.mp4" });

        return { file: "avatar.mp4", path: outputFile, url };
      } catch (err) {
        // A cancellation should bail out immediately, not burn through the
        // remaining retry attempts with backoff delays first.
        if (err.name === "AbortError") throw err;

        lastError = err;
        const isLastAttempt = attempt === config.avatar.maxRetries;
        LoggerService.warn(`Avatar generation attempt ${attempt} failed${isLastAttempt ? " (final)" : ""}`, {
          jobId,
          error: err.message,
        });
        if (!isLastAttempt) {
          const delay = Math.min(2000 * Math.pow(2, attempt - 1), 16000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`Avatar generation failed after ${config.avatar.maxRetries} attempts: ${lastError.message}`);
  }
}

module.exports = AvatarService;
