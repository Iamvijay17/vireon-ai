const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const config = require('../../config');
const LoggerService = require('../common/LoggerService');
const { getStorageProvider } = require('../storage/providers');
const MetricsService = require('../common/MetricsService');
const { abortableDelay, makeAbortError } = require('../../utils/abortableDelay');
const { ALL_VARIANT_IDS, getStyleVariant } = require('../../../hf-templates/styleVariants');
const VideoJob = require('../../models/VideoJob');

const execFileAsync = promisify(execFile);

/**
 * Rendering via the HyperFrames CLI
 * instead of Remotion's. Same 4-method call contract both pipelines depend
 * on (`prepareAssets`, `validateAssets`, `isRenderCurrent`, `renderVideo`) -
 * `prepareAssets`/`validateAssets` are copied over near-verbatim since they
 * were already renderer-agnostic scene-data prep, not Remotion API calls.
 *
 * Templates are no longer hand-authored/ported from the old Remotion
 * designs - they're HyperFrames registry blocks (see
 * backend/hf-templates/registry/) wired up with our own per-scene data via
 * `data-variable-values`. TEMPLATE_REGISTRY below covers 'title' and two
 * 'content' variants (a list and a stat card) - registry search turned up no
 * suitable blocks yet for 'image'/'contentwithimage'/'podcast' (see gap
 * reports filed via `hyperframes feedback --search-miss`), so those
 * categories still fall back to the title template via resolveSceneTemplate.
 */

const FPS = 30;

/** Locate an ffmpeg/ffprobe bin directory not yet on this process's PATH (e.g. just installed via winget mid-session, before a shell restart). */
let extraPathDirs = null;
async function resolveExtraPathDirs() {
  if (extraPathDirs !== null) return extraPathDirs;
  extraPathDirs = [];
  try {
    await execFileAsync('where', ['ffmpeg'], { windowsHide: true });
  } catch {
    const wingetBase = path.join(
      process.env.LOCALAPPDATA || '',
      'Microsoft', 'WinGet', 'Packages'
    );
    try {
      const entries = await fs.readdir(wingetBase);
      const ffmpegPkg = entries.find((e) => e.toLowerCase().startsWith('gyan.ffmpeg'));
      if (ffmpegPkg) {
        const pkgDir = path.join(wingetBase, ffmpegPkg);
        const inner = await fs.readdir(pkgDir);
        const buildDir = inner.find((e) => e.toLowerCase().startsWith('ffmpeg-'));
        if (buildDir) extraPathDirs.push(path.join(pkgDir, buildDir, 'bin'));
      }
    } catch {
      // best-effort only - if this fails, spawned commands just use the inherited PATH.
    }
  }
  return extraPathDirs;
}

async function spawnEnv() {
  const dirs = await resolveExtraPathDirs();
  if (dirs.length === 0) return process.env;
  return { ...process.env, PATH: `${dirs.join(path.delimiter)}${path.delimiter}${process.env.PATH}` };
}

/**
 * Every scene-foreground template HyperFrames knows how to render, keyed by
 * `templateId` (the same id Studio's TemplatePickerModal writes onto
 * `scene.templateId` - see resolveSceneTemplate below, which resolves that
 * explicit pick first and only falls back to a sceneType default when unset).
 * IDs deliberately follow the legacy Remotion `NNN-<sceneType>` numbering
 * scheme (`016-content`, `017-content`) rather than each block's own
 * `compositionId` - the frontend's `sceneTypeOf()` (useSceneEditor.js)
 * derives a scene's category by stripping that numeric prefix, and reuses it
 * to decide whether switching templates needs an elements-remap round trip.
 * A non-numbered id would always look like a "different" category and force
 * an unnecessary (and unhandled) remap on every switch between these.
 */
const TEMPLATE_REGISTRY = {
  'titlecard-calm': {
    compositionId: 'titlecard-calm',
    label: 'Calm Title Card',
    category: 'title',
    file: path.resolve(__dirname, '../../../hf-templates/registry/titlecard-calm.html'),
    // The stock data-duration/data-composition-duration value baked into
    // that source file - see _buildComposition's per-instance copy step.
    stockDuration: 4,
    /**
     * Maps our scene.elements shape onto the block's declared variables.
     * `variant` (a style bundle from styleVariants.js, resolved once per job
     * - see resolveStyleVariant) supplies the accent/font overrides that
     * break the single hardcoded look every video used to render.
     */
    toVariables: (scene, variant) => ({
      headline: scene.title || scene.elements?.title || '',
      kicker: scene.subtitle || scene.elements?.subtitle || '',
      // Our copy of this block (backend/hf-templates/registry/titlecard-calm.html)
      // was patched to accept this and re-scale its intro/hold/outro timing
      // to the real scene length - see that file's comment for why: its
      // stock 4s duration otherwise fades the card to invisible for most of
      // a longer, narration-driven scene slot.
      duration: scene.duration || 8,
      accentColor: variant?.accentColor,
      fontFamily: variant?.fontFamily,
      fontMono: variant?.fontMono,
      googleFontsHref: variant?.googleFontsHref,
    }),
  },
  // Registry: "Specs Checklist" (npx hyperframes catalog --query "headline
  // with a short bulleted list") - a left-aligned label/value row list.
  // Content-editable via the same `elements.items: [{heading?, text?}]`
  // shape the legacy numbered content templates used (see
  // ITEMS_EDITABLE_TEMPLATE_IDS in frontend/src/pages/studio/constants.jsx
  // and STANDARDIZED_ITEMS_TEMPLATE_IDS in sceneController.js - both list
  // this id too).
  '016-content': {
    compositionId: 'mk-specs-list',
    label: 'Specs Checklist',
    category: 'content',
    file: path.resolve(__dirname, '../../../hf-templates/registry/mk-specs-list.html'),
    stockDuration: 8,
    toVariables: (scene, variant) => ({
      rows: JSON.stringify(
        (scene.elements?.items || [])
          .map((item) => ({
            label: item.heading ?? item.title ?? '',
            value: item.text ?? item.description ?? item.value ?? '',
          }))
          .filter((row) => row.label || row.value)
      ),
      duration: scene.duration || 8,
      accentColor: variant?.accentColor,
      fontFamily: variant?.fontFamily,
    }),
  },
  // Registry: "Count-Up Stat Card" - a single count-up numeral + label +
  // progress track + caption. No `elements.items` UI exists for this one
  // yet (not added to ITEMS_EDITABLE_TEMPLATE_IDS) - value/max/suffix use
  // fixed defaults for now; only label/caption (from title/subtitle) are
  // user-editable via the existing Title/Subtitle fields.
  '017-content': {
    compositionId: 'mk-progress-stat',
    label: 'Count-Up Stat',
    category: 'content',
    file: path.resolve(__dirname, '../../../hf-templates/registry/mk-progress-stat.html'),
    stockDuration: 7,
    toVariables: (scene, variant) => ({
      label: scene.title || scene.elements?.title || 'Goals reached',
      caption: scene.subtitle || scene.elements?.subtitle || '',
      duration: scene.duration || 8,
      accentColor: variant?.accentColor,
      fontFamily: variant?.fontFamily,
    }),
  },
};

/** Default template for a scene that hasn't had a specific one picked yet. */
const SCENE_TYPE_DEFAULT_TEMPLATE = {
  title: 'titlecard-calm',
  content: '016-content',
};

/**
 * Background layer, shared across every scene regardless of category -
 * deliberately NOT a Remotion-derived color/gradient (see prior sessions'
 * hardcoded `#1a1a2e`, ported from the old Remotion theme.js palette). This
 * is HeyGen's own registry block (`npx hyperframes catalog --query
 * "animated gradient background"` -> `mk-background`), forced to its dark
 * variant in our copy (see that file's `scheme` comment) since every title
 * template renders light text.
 */
const BACKGROUND_TEMPLATE = {
  compositionId: 'mk-background',
  file: path.resolve(__dirname, '../../../hf-templates/registry/mk-background.html'),
  stockDuration: 10,
  /** Style-variant palette override - see TEMPLATE_REGISTRY['titlecard-calm'].toVariables. */
  toVariables: (variant) => ({
    stageColor: variant?.stageColor,
    baseColor: variant?.baseColor,
    blob1Color: variant?.blob1Color,
    blob2Color: variant?.blob2Color,
  }),
};

function resolveSceneTemplate(scene) {
  return (
    TEMPLATE_REGISTRY[scene.templateId] ||
    TEMPLATE_REGISTRY[SCENE_TYPE_DEFAULT_TEMPLATE[scene.sceneType]] ||
    TEMPLATE_REGISTRY['titlecard-calm']
  );
}

/**
 * Serializes `variables` for embedding in a double-quoted HTML attribute.
 * JSON.stringify never leaves a literal unescaped `"` in its output, but a
 * variable value can still contain one (inside an already-escaped `\"...\"`)
 * or an `&` - both need HTML entity-escaping on top of JSON's own escaping,
 * or they corrupt the attribute (confirmed: the 'default' style variant's
 * font stack - a literal `'Helvetica Neue'` - broke the single-quoted
 * attribute this used before switching to double quotes + this escape).
 */
function toAttrJson(variables) {
  return JSON.stringify(variables).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * Picks which style-variant bundle (font + palette + accent, see
 * styleVariants.js) a job renders with. An explicit user choice always wins
 * (any fontPairing other than the 'default' placeholder); otherwise rotate
 * across the catalog, excluding whatever the most recent jobs used, so
 * consecutive renders don't keep landing on the same look. `VideoJob` has no
 * per-user field (single-tenant project), so this rotation is global.
 */
function resolveStyleVariant(requestedFontPairing, recentVariantIds) {
  if (requestedFontPairing && requestedFontPairing !== 'default') {
    return requestedFontPairing;
  }
  const recent = new Set(recentVariantIds || []);
  const candidates = ALL_VARIANT_IDS.filter((id) => !recent.has(id));
  const pool = candidates.length > 0 ? candidates : ALL_VARIANT_IDS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * HyperFrames' CLI prints a unified percentage per progress line (unlike
 * Remotion's separate bundling/rendering/stitching phases) - see the
 * "XX%  <phase>" lines observed in `prototypes/hyperframes-*-poc` renders
 * this session. Take the last (highest) percentage seen.
 */
function parseHyperFramesProgressLine(line, state) {
  const match = line.match(/(\d+)%/);
  if (!match) return false;
  const pct = Number(match[1]) / 100;
  if (pct >= state.fraction) {
    state.fraction = pct;
    return true;
  }
  return false;
}

function runHyperFramesCommandStreaming(args, { cwd, timeout, onLine, signal, env }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(makeAbortError());
      return;
    }

    // On Windows, npx resolves to npx.cmd, which Node's spawn() cannot
    // exec directly without a shell (throws EINVAL) - shell:true routes it
    // through cmd.exe instead, same as RemotionService avoided needing by
    // spawning `node <binary.js>` directly rather than a shell-dependent CLI.
    // Caveat: with shell:true, Node does NOT auto-quote array args (that
    // only happens for the non-shell Windows spawn path) - it just joins
    // them with spaces, so any arg containing a space (e.g. this repo's own
    // "Video Generation" directory name) silently splits into two argv
    // entries. Quote every arg that needs it before joining.
    const isWin = process.platform === 'win32';
    const npxBin = isWin ? 'npx.cmd' : 'npx';
    const quoteArg = (arg) => (isWin && /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg);
    const spawnArgs = isWin ? args.map(quoteArg) : args;
    const child = spawn(npxBin, spawnArgs, { cwd, windowsHide: true, signal, env, shell: isWin });

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

class HyperFramesService {
  static getJobDir(jobId) {
    return path.resolve(__dirname, '../../../jobs', jobId);
  }

  /** The full template catalog, for Studio's template picker (GET /api/templates). */
  static listTemplates() {
    return Object.entries(TEMPLATE_REGISTRY).map(([id, tpl]) => ({
      id,
      label: tpl.label || id,
      category: tpl.category || 'content',
    }));
  }

  /**
   * Reads the persisted scene script and builds the assets manifest - this step was
   * already renderer-agnostic scene-data prep, not a Remotion API call.
   */
  static async prepareAssets(jobId, script, jobConfig) {
    const jobDir = this.getJobDir(jobId);
    await fs.mkdir(jobDir, { recursive: true });

    // Auto-rotate the style variant (font + palette + accent) when the
    // caller left fontPairing at the 'default' placeholder - see
    // resolveStyleVariant. An explicit user choice always wins instead.
    let resolvedFontPairing = jobConfig.fontPairing || 'default';
    try {
      const recentJobs = await VideoJob.find({ _id: { $ne: jobId } })
        .sort({ createdAt: -1 })
        .limit(3)
        .select('fontPairing')
        .lean();
      resolvedFontPairing = resolveStyleVariant(
        jobConfig.fontPairing,
        recentJobs.map((j) => j.fontPairing).filter(Boolean)
      );
      if (resolvedFontPairing !== jobConfig.fontPairing) {
        await VideoJob.findByIdAndUpdate(jobId, { fontPairing: resolvedFontPairing });
      }
    } catch (err) {
      LoggerService.warn('Failed to resolve/persist style variant - falling back to default look', { jobId, error: err.message });
      resolvedFontPairing = jobConfig.fontPairing || 'default';
    }

    const assets = {
      title: script.title,
      description: script.description,
      resolution: jobConfig.resolution || '1920x1080',
      aspectRatio: jobConfig.aspectRatio || '16:9',
      quality: jobConfig.quality || 'standard',
      fontPairing: resolvedFontPairing,
      avatar: jobConfig.avatar
        ? { videoUrl: jobConfig.avatar.videoUrl, position: jobConfig.avatar.position }
        : undefined,
      scenes: script.scenes.map((scene, index) => {
        let sceneType = scene.sceneType;
        if (!sceneType) {
          const sceneNum = scene.sceneNumber || (index + 1);
          sceneType = sceneNum === 1 ? 'title' : 'content';
        }
        return {
          sceneNumber: scene.sceneNumber,
          sceneType,
          title: scene.title,
          subtitle: scene.subtitle,
          duration: scene.audio?.duration || scene.duration || 8,
          backgroundColor: scene.backgroundColor,
          transition: scene.transition,
          imagePrompt: scene.imagePrompt,
          cameraMotion: scene.cameraMotion,
          animation: scene.animation,
          imageUrl: scene.imageUrl || '',
          templateId: scene.templateId || '',
          elements: scene.elements || null,
          scene_meta: scene.scene_meta || null,
          audio: {
            file: getStorageProvider().getPublicUrl(jobId, 'audio', `scene${scene.sceneNumber}.mp3`),
            duration: scene.audio?.duration || 0,
          },
          theme: {
            type: jobConfig.type || 'educational',
            textColor: '#ffffff',
            accentColor: '#6c63ff',
            captionAnimation: jobConfig.captionAnimation || 'fadeInUp',
          },
        };
      }),
      output: {
        video: './render/video.mp4',
        thumbnail: './render/thumbnail.png',
      },
    };

    const assetsPath = path.join(jobDir, 'assets.json');
    await fs.writeFile(assetsPath, JSON.stringify(assets, null, 2), 'utf-8');

    LoggerService.render('Assets prepared for HyperFrames', {
      jobId,
      scenes: assets.scenes.length,
      path: assetsPath,
    });

    return assets;
  }

  static async _verifySceneAudioFiles(jobId, scenes) {
    const provider = getStorageProvider();
    const missing = [];
    for (const scene of scenes) {
      if (!(scene.audio?.duration > 0)) continue;
      const exists = await provider.objectExists(jobId, 'audio', `scene${scene.sceneNumber}.mp3`);
      if (!exists) missing.push(scene.sceneNumber);
    }
    if (missing.length > 0) {
      throw new Error(
        `Missing audio file(s) for scene(s) ${missing.join(', ')} - audio generation must complete before rendering`
      );
    }
  }

  /** Cheap structural/asset checks before committing to a render. */
  static async validateAssets(jobId, scenes) {
    const issues = [];
    if (!Array.isArray(scenes) || scenes.length === 0) {
      throw new Error('Pre-render validation failed: script has no scenes');
    }

    const provider = getStorageProvider();
    const seenSceneNumbers = new Set();

    for (const scene of scenes) {
      const sceneNum = scene.sceneNumber;
      const label = `Scene ${sceneNum ?? '?'}`;

      if (sceneNum == null) {
        issues.push(`${label}: missing sceneNumber`);
      } else if (seenSceneNumbers.has(sceneNum)) {
        issues.push(`${label}: duplicate sceneNumber`);
      } else {
        seenSceneNumbers.add(sceneNum);
      }

      if (!scene.templateId && !scene.sceneType) {
        issues.push(`${label}: missing templateId/sceneType`);
      }

      const duration = scene.audio?.duration || scene.duration;
      if (!(duration > 0)) {
        issues.push(`${label}: duration must be greater than 0`);
      }

      const narrationText = scene.audio?.text?.trim();
      if (narrationText) {
        if (!(scene.audio?.duration > 0)) {
          issues.push(`${label}: has narration text but audio duration is 0 - TTS likely produced an empty clip`);
        }
        if (sceneNum != null) {
          const exists = await provider.objectExists(jobId, 'audio', `scene${sceneNum}.mp3`);
          if (!exists) issues.push(`${label}: audio file is missing from storage`);
        }
      }

      if (scene.imagePrompt && !scene.imageUrl) {
        issues.push(`${label}: image prompt set but no image was generated`);
      }
    }

    if (issues.length > 0) {
      throw new Error(`Pre-render validation failed:\n- ${issues.join('\n- ')}`);
    }
  }

  static _fingerprintAssets(assetsFile) {
    return crypto.createHash('sha256').update(JSON.stringify(assetsFile)).digest('hex');
  }

  static async isRenderCurrent(jobId, assetsFile) {
    const jobDir = this.getJobDir(jobId);
    const videoPath = path.join(jobDir, 'render', 'video.mp4');
    const fingerprintPath = path.join(jobDir, '.render-fingerprint');
    try {
      await fs.access(videoPath);
      const stored = await fs.readFile(fingerprintPath, 'utf-8');
      return stored.trim() === this._fingerprintAssets(assetsFile);
    } catch {
      return false;
    }
  }

  /**
   * Builds a per-job HyperFrames composition directory: one host div per
   * scene, each wired to a registry block via `data-composition-src` +
   * `data-variable-values` (see hyperframes-core's sub-compositions.md -
   * the same block file can be reused per-instance with different variable
   * values, which is what every 'title'-category scene does here).
   *
   * `baseDir` defaults to the real job's directory (`getJobDir`) but Studio's
   * live-preview endpoints (see PreviewService) pass a scratch preview
   * directory instead, so the exact same assembly logic builds a throwaway
   * composition from unsaved scene edits without touching real job state.
   */
  static async _buildComposition(jobId, assetsFile, { baseDir } = {}) {
    const jobDir = baseDir || this.getJobDir(jobId);
    const compDir = path.join(jobDir, 'hf-composition');
    const compositionsDir = path.join(compDir, 'compositions');
    await fs.mkdir(compositionsDir, { recursive: true });

    const [width, height] = (assetsFile.resolution || '1920x1080').split('x').map(Number);

    // Registry blocks like titlecard-calm/mk-background declare their own
    // static data-duration/data-composition-duration (e.g. "4", "10" in
    // their source files) - the runtime uses THAT (not our host div's
    // data-duration, and not any JS-computed value) to decide how long the
    // sub-composition stays mounted, so a scene running longer than the
    // block's stock length just goes blank once its declared duration
    // elapses (confirmed by direct render tests this session). Since every
    // scene needs a different real duration but shares one source file,
    // generate a per-scene copy with a unique composition id and the real
    // duration baked into every occurrence of the stock value.
    const writeInstance = async (tpl, sceneNumber, duration) => {
      const instanceId = `${tpl.compositionId}-scene-${sceneNumber}`;
      const raw = await fs.readFile(tpl.file, 'utf-8');
      const instanceHtml = raw
        .split(tpl.compositionId).join(instanceId)
        .split(`data-composition-duration="${tpl.stockDuration}"`).join(`data-composition-duration="${duration}"`)
        .split(`data-duration="${tpl.stockDuration}"`).join(`data-duration="${duration}"`);
      await fs.writeFile(path.join(compositionsDir, `${instanceId}.html`), instanceHtml, 'utf-8');
      return instanceId;
    };

    // Resolved once per job (not per scene) - every scene in a video shares
    // the same look. See resolveStyleVariant/prepareAssets for how
    // assetsFile.fontPairing gets picked.
    const variant = getStyleVariant(assetsFile.fontPairing);

    let cursor = 0;
    const sceneDivs = [];
    const audioClips = [];
    for (const scene of assetsFile.scenes) {
      const tpl = resolveSceneTemplate(scene);
      const duration = scene.duration || 8;
      const variables = tpl.toVariables(scene, variant);

      const bgInstanceId = await writeInstance(BACKGROUND_TEMPLATE, scene.sceneNumber, duration);
      sceneDivs.push(`
      <div
        data-composition-id="${bgInstanceId}"
        data-composition-src="compositions/${bgInstanceId}.html"
        data-variable-values="${toAttrJson(BACKGROUND_TEMPLATE.toVariables(variant))}"
        data-start="${cursor}"
        data-duration="${duration}"
        data-track-index="0"
        data-width="${width}"
        data-height="${height}"
      ></div>`);

      const instanceId = await writeInstance(tpl, scene.sceneNumber, duration);
      sceneDivs.push(`
      <div
        id="scene-${scene.sceneNumber}"
        data-composition-id="${instanceId}"
        data-composition-src="compositions/${instanceId}.html"
        data-variable-values="${toAttrJson(variables)}"
        data-start="${cursor}"
        data-duration="${duration}"
        data-track-index="1"
        data-width="${width}"
        data-height="${height}"
      ></div>`);

      // Narration audio lives outside the scene sub-composition (a sub-comp
      // timeline can never reach host-root elements, but audio needs no
      // per-scene animation, only correct placement) - see
      // hyperframes-core/references/variables-and-media.md. data-start uses
      // the same global `cursor` as the scene div above since both are at
      // host-root level. The mixer only picks up `audio[id][src]`, so a
      // missing id here means a silent render.
      //
      // HyperFrames' own downloader refuses plain-HTTP media ("Only HTTPS
      // URLs are permitted in compositions") - our local MinIO serves
      // audio.file over HTTP, which Remotion's fetch-based renderer never
      // objected to but this one does. Fetch the file ourselves into the
      // composition directory and reference it as a local relative path
      // instead, sidestepping the check entirely (matches how the rest of
      // the composition is already local files, not remote URLs).
      if (scene.audio?.file && scene.audio?.duration > 0) {
        const audioFileName = `scene-${scene.sceneNumber}.mp3`;
        const audioResponse = await fetch(scene.audio.file);
        if (!audioResponse.ok) {
          throw new Error(`Failed to download scene ${scene.sceneNumber} audio from ${scene.audio.file}: ${audioResponse.status}`);
        }
        const audioDir = path.join(compDir, 'audio');
        await fs.mkdir(audioDir, { recursive: true });
        await fs.writeFile(path.join(audioDir, audioFileName), Buffer.from(await audioResponse.arrayBuffer()));

        audioClips.push(`
      <audio
        id="scene-${scene.sceneNumber}-audio"
        src="audio/${audioFileName}"
        data-start="${cursor}"
        data-duration="${scene.audio.duration}"
        data-track-index="10"
      ></audio>`);
      }

      cursor += duration;
    }

    const totalDuration = cursor;
    const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <style>
      html, body { margin: 0; padding: 0; background: #000000; }
      #root { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="video-${jobId}"
      data-start="0"
      data-duration="${totalDuration}"
      data-width="${width}"
      data-height="${height}"
      data-no-timeline
    >${sceneDivs.join('')}${audioClips.join('')}
    </div>
  </body>
</html>
`;

    await fs.writeFile(path.join(compDir, 'index.html'), indexHtml, 'utf-8');
    return { compDir, totalDuration, width, height };
  }

  static async renderVideo(jobId, assets = null, onProgress = null, signal = null) {
    const jobDir = this.getJobDir(jobId);
    const assetsPath = path.join(jobDir, 'assets.json');
    const renderDir = path.join(jobDir, 'render');
    await fs.mkdir(renderDir, { recursive: true });

    const assetsFile = assets || JSON.parse(await fs.readFile(assetsPath, 'utf-8'));

    LoggerService.render('Total video duration calculated', {
      jobId,
      totalDuration: assetsFile.scenes.reduce((sum, s) => sum + (s.duration || 8), 0),
      sceneCount: assetsFile.scenes.length,
    });

    await this._verifySceneAudioFiles(jobId, assetsFile.scenes);

    const { compDir } = await this._buildComposition(jobId, assetsFile);
    const env = await spawnEnv();

    let lastError = null;
    const renderStartedAt = Date.now();

    for (let attempt = 1; attempt <= config.render.maxRetries; attempt++) {
      if (signal?.aborted) throw makeAbortError();

      try {
        LoggerService.render(`Rendering video via HyperFrames (attempt ${attempt}/${config.render.maxRetries})`, {
          jobId,
          compDir,
        });

        const outputPath = path.join(renderDir, 'video.mp4');
        const args = ['--yes', 'hyperframes@0.8.37', 'render', compDir, '--output', outputPath, '--fps', String(FPS)];

        const progressState = { fraction: 0 };
        const { stdout } = await runHyperFramesCommandStreaming(args, {
          cwd: compDir,
          timeout: config.render.timeout,
          signal,
          env,
          onLine: (line) => {
            if (parseHyperFramesProgressLine(line, progressState) && onProgress) {
              try {
                onProgress(progressState.fraction);
              } catch (progressErr) {
                LoggerService.warn('onProgress callback failed', { jobId, error: progressErr.message });
              }
            }
          },
        });

        LoggerService.render('HyperFrames stdout', { stdout: stdout.toString().slice(-1500) });

        const stats = await fs.stat(outputPath);
        LoggerService.render('Video rendered successfully', {
          jobId,
          size: `${(stats.size / (1024 * 1024)).toFixed(2)} MB`,
          path: outputPath,
        });

        await fs.writeFile(
          path.join(jobDir, '.render-fingerprint'),
          this._fingerprintAssets(assetsFile),
          'utf-8'
        );

        try {
          await this._captureThumbnail({ renderDir, assetsFile, env });
        } catch (thumbErr) {
          LoggerService.warn('Thumbnail capture failed - continuing without one', { jobId, error: thumbErr.message });
        }

        MetricsService.recordDuration('render.duration', Date.now() - renderStartedAt);

        return {
          video: 'render/video.mp4',
          thumbnail: 'render/thumbnail.png',
          path: renderDir,
        };
      } catch (err) {
        if (err.name === 'AbortError') throw err;

        lastError = err;
        const isLastAttempt = attempt === config.render.maxRetries;
        LoggerService.warn(`HyperFrames attempt ${attempt} failed${isLastAttempt ? ' (final)' : ''}`, {
          message: err.message,
          stdout: err.stdout?.toString().slice(-500),
          stderr: err.stderr?.toString().slice(-500),
          code: err.code,
        });

        if (!isLastAttempt) {
          const delay = Math.min(5000 * Math.pow(2, attempt - 1), 30000);
          await abortableDelay(delay, signal);
        }
      }
    }

    throw new Error(`HyperFrames rendering failed after ${config.render.maxRetries} attempts: ${lastError?.message}`);
  }

  /** No `still`-equivalent CLI command in HyperFrames - extract a mid-video frame via ffmpeg instead. */
  static async _captureThumbnail({ renderDir, assetsFile, env }) {
    const videoPath = path.join(renderDir, 'video.mp4');
    const thumbnailPath = path.join(renderDir, 'thumbnail.png');
    const totalDuration = assetsFile.scenes.reduce((sum, s) => sum + (s.duration || 8), 0);
    const midpoint = Math.max(0.1, totalDuration / 2);

    await execFileAsync('ffmpeg', [
      '-y', '-ss', String(midpoint), '-i', videoPath, '-vframes', '1', '-update', '1', thumbnailPath,
    ], { windowsHide: true, env });
  }
}

module.exports = HyperFramesService;
