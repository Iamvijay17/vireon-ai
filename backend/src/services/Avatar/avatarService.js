const { Client } = require("@gradio/client");
const fs = require("fs").promises;
const path = require("path");
const config = require("../../config");
const LoggerService = require("../LoggerService");
const AudioService = require("../TTS/audioService");

/**
 * Service for animating a source portrait photo into a small talking-head
 * clip via the LivePortrait Gradio app (see AvatarService.animatePortrait).
 * Motion is driven by a fixed stock reference clip (config.avatar.drivingVideoPath).
 * The source photo isn't user-supplied either - it's one of two bundled
 * default portraits (config.avatar.default{Male,Female}ImagePath), picked by
 * the job's own narration voice's gender (see resolveDefaultSourceImage) so
 * the avatar matches the voice without asking the user for a photo.
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
   * argument), which makes LivePortrait's server reject the file - it
   * infers media type from the uploaded file's extension.
   */
  static async _uploadFile(baseUrl, filePath, filename, mimeType) {
    const buf = await fs.readFile(filePath);
    const form = new FormData();
    form.append("files", new Blob([buf], { type: mimeType }), filename);
    const res = await fetch(`${baseUrl}/upload`, { method: "POST", body: form });
    if (!res.ok) {
      throw new Error(`LivePortrait upload failed: ${res.status} ${await res.text()}`);
    }
    const paths = await res.json();
    return paths[0];
  }

  static _fileData(serverPath, origName) {
    return { path: serverPath, orig_name: origName, meta: { _type: "gradio.FileData" } };
  }

  /**
   * Animate `sourceImagePath` (a local file on disk) with the stock driving
   * clip, download the result, and save it to
   * jobs/{jobId}/avatar/avatar.mp4 - same jobs/{jobId}/<kind>/ convention
   * AudioService uses for jobs/{jobId}/audio/.
   */
  static async animatePortrait(jobId, sourceImagePath) {
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

        const [srcServerPath, drvServerPath] = await Promise.all([
          this._uploadFile(baseUrl, sourceImagePath, `source.${srcExt}`, srcMime),
          this._uploadFile(baseUrl, config.avatar.drivingVideoPath, "driving.mp4", "video/mp4"),
        ]);

        const client = await Client.connect(baseUrl);

        let result;
        try {
          result = await client.predict("/gpu_wrapped_execute_video", [
            this._fileData(srcServerPath, `source.${srcExt}`), // source image
            null, // source video
            { video: this._fileData(drvServerPath, "driving.mp4"), subtitles: null }, // driving video
            null, // driving image
            null, // driving file
            true, // relative motion
            true, // do crop (source)
            true, // paste-back
            true, // stitching
            "all", // animation region
            "expression-friendly", // driving option (i2v)
            1, // driving multiplier (i2v)
            false, // do crop (driving)
            2.3, // source crop scale
            0, // source crop x
            -0.125, // source crop y
            2.2, // driving crop scale
            0, // driving crop x
            -0.1, // driving crop y
            3e-7, // motion smooth strength (v2v)
            "", // internal textbox
            "", // internal textbox
          ]);
        } finally {
          client.close();
        }

        const animatedVideo = result.data?.[0]?.video;
        if (!animatedVideo?.url) {
          throw new Error("No animated video returned from LivePortrait");
        }

        const videoRes = await fetch(animatedVideo.url);
        if (!videoRes.ok) {
          throw new Error(`Failed to download animated video: ${videoRes.status} ${videoRes.statusText}`);
        }
        await fs.writeFile(outputFile, Buffer.from(await videoRes.arrayBuffer()));

        LoggerService.success("Avatar overlay generated", { jobId, file: "avatar/avatar.mp4" });

        return { file: "avatar.mp4", path: outputFile };
      } catch (err) {
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
