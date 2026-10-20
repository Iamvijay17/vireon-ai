const fs = require('fs').promises;
const config = require('../../../config');
const LoggerService = require('../../common/LoggerService');
const { buildCues } = require('../../../utils/subtitles');
const mediaTools = require('./mediaTools');
const analyzers = require('./analyzers');
const { buildTimeline, expectedDurationSec, renderedSeconds } = require('./timeline');
const { buildReport } = require('./report');

const { ERROR, WARN, issue } = analyzers;

/** A rendered file smaller than this cannot be a real video (a container header alone is bigger). */
const MIN_VIDEO_BYTES = 1024;
const IMAGE_PROBE_CONCURRENCY = 6;

/**
 * ffmpeg's own wording, made presentable: it prefixes every line with an
 * allocator address (`[h264 @ 000001f7f35dd3c0]`) and echoes the temp file path,
 * neither of which means anything to the person reading the report.
 */
const tidy = (line, filePath) =>
  String(line)
    .replace(/\[[^\]]*@ [0-9a-fA-F]+\]\s*/g, '')
    .split(filePath || '\u0000').join('the file')
    .replace(/\s+/g, ' ')
    .trim();

const firstLines = (lines, n = 2, filePath) => lines.slice(0, n).map((l) => tidy(l, filePath)).filter(Boolean).join(' | ').slice(0, 300);

/** Run `fn` over `items` with at most `limit` in flight; resolves to results in order. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  }));
  return results;
}

/**
 * Output QC: open the finished render and the script it came from and decide
 * whether the video is fit to be called complete.
 *
 * It does not trust the pipeline's own bookkeeping. Earlier stages record that
 * audio "was generated" and a render "succeeded"; this reads the file back -
 * probes the container, decodes the audio and sampled frames - and measures
 * what a viewer would actually get. The pre-render validation (remotionAssetChecks)
 * and layout check (LayoutQcService) look at inputs; this is the only check that
 * looks at the output.
 *
 * Every dependency is injectable (`deps`), so the orchestration - which checks
 * run, how a missing file or missing ffmpeg degrades, how results become a
 * report - is testable without media files.
 */
class VideoQualityService {
  /**
   * @param {object} args
   * @param {string}  args.jobId
   * @param {object[]} args.scenes        the script's scenes (final: after audio and images)
   * @param {string}  args.videoPath      absolute path of the rendered file
   * @param {string}  [args.resolution]   'WxH' - used when the file cannot be probed
   * @param {AbortSignal} [args.signal]
   * @param {object}  [args.deps]
   */
  static async run({ jobId, scenes, videoPath, resolution, signal, deps = {} }) {
    const startedAt = Date.now();
    const settings = config.qc.video;
    const d = {
      stat: (p) => fs.stat(p),
      resolveTools: () => mediaTools.resolveTools(),
      probe: (...a) => mediaTools.probe(...a),
      decodeAudio: (...a) => mediaTools.decodeAudio(...a),
      decodeFrames: (...a) => mediaTools.decodeFrames(...a),
      objectExists: null, // (jobId, file) => Promise<boolean>; null = skip the storage check
      probeImage: null, // (url) => Promise<string|null>; null = skip the image fetch
      ...deps,
    };

    const timeline = buildTimeline(scenes);
    const expectedSec = expectedDurationSec(timeline);
    const issues = [];
    const skipped = {};
    const media = { expectedSec: Math.round(expectedSec * 10) / 10 };

    // ── Is there a file, and can the tools read it? ─────────────────────────
    let fileOk = false;
    try {
      const stats = await d.stat(videoPath);
      media.sizeBytes = stats.size;
      if (stats.size < MIN_VIDEO_BYTES) {
        issues.push(issue('video-file', ERROR, `The rendered video file is empty (${stats.size} bytes)`));
      } else {
        fileOk = true;
      }
    } catch (err) {
      issues.push(issue('video-file', ERROR, 'The rendered video file is missing'));
      LoggerService.warn('[QC] rendered video not found', { jobId, videoPath, error: err.code || err.message });
    }

    const tools = fileOk ? await d.resolveTools() : null;
    const decodeChecks = ['video-decodable', 'audio-stream', 'duration', 'audio-silence', 'video-black-frames'];
    if (!fileOk) {
      for (const id of decodeChecks) skipped[id] = 'there is no video file to read';
    } else if (!tools) {
      for (const id of decodeChecks) skipped[id] = 'ffmpeg is not available - install it or set FFMPEG_PATH';
    } else {
      await this._checkMedia({ d, tools, videoPath, timeline, expectedSec, issues, skipped, media, settings, signal });
    }

    // ── Checks that need only the script, storage or the network ────────────
    await this._checkAudioFiles({ d, jobId, timeline, issues, skipped });
    await this._checkImages({ d, timeline, issues, skipped, settings });

    issues.push(...analyzers.checkCaptions({ timeline }));

    const [frameW, frameH] = media.width && media.height
      ? [media.width, media.height]
      : String(resolution || '1920x1080').split('x').map(Number);
    // Cues are timed from each scene's `duration`; the render used the narration's length
    // where there is one, so give the exporter the durations the video really has.
    const renderedScenes = scenes.map((s) => ({ ...s, duration: renderedSeconds(s) }));
    issues.push(...analyzers.checkSubtitleCues({
      cues: buildCues(renderedScenes),
      totalSec: media.durationSec || expectedSec,
      maxChars: settings.subtitleMaxChars,
      maxCueSec: settings.subtitleMaxCueSec,
      maxCharsPerSec: settings.subtitleMaxCharsPerSec,
    }));
    issues.push(...analyzers.checkCaptionBox({
      timeline,
      frameWidth: frameW || 1920,
      frameHeight: frameH || 1080,
      fontSize: settings.captionFontSize,
      maxWidthPct: 0.8, // CaptionRenderer's default maxWidth
      maxVisibleWords: 6, // CaptionRenderer's default maxVisibleWords
      glyphWidthRatio: 0.55,
      lineHeightRatio: 1.3,
      maxLines: settings.captionMaxLines,
      maxHeightPct: 0.25,
    }));

    const report = buildReport({ issues, skipped, media, durationMs: Date.now() - startedAt, mode: settings.mode });
    LoggerService.info('[QC] Output quality check finished', {
      jobId, status: report.status, errors: report.summary.errors, warnings: report.summary.warnings, durationMs: report.durationMs,
    });
    return report;
  }

  /** Probe, decode, and run every check that reads the actual file. */
  static async _checkMedia({ d, tools, videoPath, timeline, expectedSec, issues, skipped, media, settings, signal }) {
    let probed;
    try {
      probed = await d.probe(tools, videoPath, { signal });
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      const detail = firstLines(String(err.stderr?.toString?.('utf8') || err.message).split(/\r?\n/).filter(Boolean), 2, videoPath);
      issues.push(issue('video-decodable', ERROR, `The video file cannot be read: ${detail || 'unrecognised format'}`));
      for (const id of ['audio-stream', 'duration', 'audio-silence', 'video-black-frames']) skipped[id] = 'the video file could not be read';
      return;
    }

    Object.assign(media, {
      durationSec: probed.durationSec != null ? Math.round(probed.durationSec * 10) / 10 : null,
      width: probed.video?.width, height: probed.video?.height, fps: probed.video?.fps ? Math.round(probed.video.fps * 100) / 100 : null,
      videoCodec: probed.video?.codec, audioCodec: probed.audio?.codec, tools: tools.source,
    });

    const anyNarration = timeline.some((t) => t.narrated);

    if (!probed.video) {
      issues.push(issue('video-decodable', ERROR, 'The file has no video stream'));
      skipped['video-black-frames'] = 'the file has no video stream';
    }
    if (!probed.audio) {
      if (anyNarration) issues.push(issue('audio-stream', ERROR, 'The video has no audio track, but the script has narration'));
      skipped['audio-silence'] = anyNarration ? 'the file has no audio track' : 'the script has no narration';
    } else if (!anyNarration) {
      skipped['audio-silence'] = 'the script has no narration, so silence is expected';
    }

    issues.push(...analyzers.checkDuration({
      actualSec: probed.durationSec,
      expectedSec,
      videoSec: probed.video?.durationSec,
      audioSec: probed.audio?.durationSec,
      toleranceSec: settings.durationToleranceSec,
      tolerancePct: settings.durationTolerancePct,
    }));

    const timeoutMs = settings.timeoutMs || undefined;
    const wantAudio = probed.audio && anyNarration;
    const wantFrames = Boolean(probed.video);

    // Decode failures are reported once under video-decodable; the two reads are independent.
    const [audio, frames] = await Promise.all([
      wantAudio ? this._guard(() => d.decodeAudio(tools, videoPath, { signal, timeoutMs }), 'audio', issues, videoPath) : null,
      wantFrames ? this._guard(() => d.decodeFrames(tools, videoPath, { fps: settings.sampleFps, signal, timeoutMs }), 'picture', issues, videoPath) : null,
    ]);

    if (audio) {
      if (audio.errors.length > 0) {
        issues.push(issue('video-decodable', ERROR, `The audio has decoding errors: ${firstLines(audio.errors, 2, videoPath)}`));
      }
      issues.push(...analyzers.checkAudioSilence({
        windows: analyzers.measureWindows(audio.pcm, audio.sampleRate),
        timeline,
        thresholdDb: settings.silenceDb,
        silentSceneError: settings.silentSceneError,
        silentSceneWarn: settings.silentSceneWarn,
        maxSilentGapSec: settings.maxSilentGapSec,
      }));
    } else if (wantAudio && !skipped['audio-silence']) {
      skipped['audio-silence'] = 'the audio could not be decoded';
    }

    if (frames) {
      if (frames.errors.length > 0) {
        issues.push(issue('video-decodable', ERROR, `The picture has decoding errors: ${firstLines(frames.errors, 2, videoPath)}`));
      }
      issues.push(...analyzers.checkBlackFrames({
        frames: analyzers.measureFrames(frames.gray, frames.frameBytes),
        sampleFps: frames.fps,
        timeline,
        meanMax: settings.blackMeanMax,
        brightMax: settings.blackBrightMax,
        minSec: settings.blackMinSec,
        errorSec: settings.blackErrorSec,
      }));
    } else if (wantFrames && !skipped['video-black-frames']) {
      skipped['video-black-frames'] = 'the picture could not be decoded';
    }
  }

  /** Run a decode, turning an ffmpeg failure into a video-decodable error instead of an exception. */
  static async _guard(fn, what, issues, filePath) {
    try {
      return await fn();
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      const detail = firstLines(String(err.stderr?.toString?.('utf8') || err.message).split(/\r?\n/).filter(Boolean), 2, filePath);
      issues.push(issue('video-decodable', ERROR, `The ${what} could not be decoded: ${detail || 'decoder failed'}`));
      return null;
    }
  }

  /** Every narrated scene's audio file is in storage (they were uploaded as produced). */
  static async _checkAudioFiles({ d, jobId, timeline, issues, skipped }) {
    if (!d.objectExists) {
      skipped['audio-files'] = 'storage is not available to this check';
      return;
    }
    for (const t of timeline.filter((s) => s.narrated)) {
      const file = t.scene.audio.file || `scene${t.sceneNumber}.mp3`;
      try {
        if (!(await d.objectExists(jobId, file))) {
          issues.push(issue('audio-files', ERROR, `Scene ${t.sceneNumber}: the audio file ${file} is missing from storage`, { scene: t.sceneNumber }));
        }
      } catch (err) {
        issues.push(issue('audio-files', WARN, `Scene ${t.sceneNumber}: could not check for its audio file (${err.message.slice(0, 120)})`, { scene: t.sceneNumber }));
      }
    }
  }

  /** Fetch each distinct image once, then judge scenes against the results. */
  static async _checkImages({ d, timeline, issues, skipped, settings }) {
    const urls = [...new Set(timeline.flatMap((t) => analyzers.sceneImageUrls(t.scene)))];
    const probeResults = new Map();

    if (urls.length > 0 && d.probeImage && settings.probeImages) {
      await mapLimit(urls, IMAGE_PROBE_CONCURRENCY, async (url) => {
        try {
          probeResults.set(url, await d.probeImage(url));
        } catch (err) {
          probeResults.set(url, `could not be checked (${err.message.slice(0, 80)})`);
        }
      });
    } else if (urls.length > 0) {
      skipped.images = 'image URLs were not fetched (QC_PROBE_IMAGES=false)';
    }

    issues.push(...analyzers.checkImages({ timeline, probeResults }));
  }
}

module.exports = VideoQualityService;
