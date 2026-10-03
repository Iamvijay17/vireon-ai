const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const axios = require('axios');
const config = require('../../config');
const LoggerService = require('../common/LoggerService');
const RemotionService = require('../video/RemotionService');
const { checkImageUrl, buildAllowedHosts } = require('../../utils/assetUrlGuard');

const execFileAsync = promisify(execFile);

const QC_MARKER = 'VIREON_QC ';
const IMAGE_PROBE_TIMEOUT_MS = 15000;

/**
 * Layout QC: renders every scene of a video in headless Chromium (Remotion's
 * LayoutQc composition, one frame per scene) and reports what is wrong with how it
 * was laid out - text cut off or running past the frame, text on text, images that
 * did not load, empty scenes. See remotion/src/qc/ for the measuring side.
 *
 * It checks what the renderer actually drew rather than what the layout engine
 * intended, which is the only way to catch text that does not fit: the engine's
 * own fitting is an estimate.
 */
class LayoutQcService {
  /**
   * Every image reference in a scene, as `{ get, set }` accessors so a bad one can
   * be blanked in the QC copy without touching the caller's assets.
   */
  static _imageRefs(scene) {
    const refs = [];
    if (typeof scene.imageUrl === 'string' && scene.imageUrl) refs.push({ field: 'imageUrl', url: scene.imageUrl });
    for (const key of ['image', 'hostImage']) {
      const url = scene.elements?.[key];
      if (typeof url === 'string' && url) refs.push({ field: `elements.${key}`, url });
    }
    return refs;
  }

  /**
   * Whether an image URL is fetchable and actually an image. Done here, not in the
   * browser, because Remotion's <Img> aborts the whole render when an image fails -
   * one dead URL would otherwise cost every other scene's results.
   *
   * `http` is injectable for tests. data: URIs and relative paths are not probed.
   */
  static async probeImage(url, { http = axios, allowedHosts = [], lookup } = {}) {
    if (/^data:/i.test(url)) return null;
    const guard = await checkImageUrl(url, { allowedHosts, ...(lookup ? { lookup } : {}) });
    if (guard) return `is not allowed: ${guard}`;
    if (!/^(https?:)?\/\//i.test(url)) return null; // relative - resolved by the bundle server

    try {
      const res = await http.get(url, {
        responseType: 'stream',
        timeout: IMAGE_PROBE_TIMEOUT_MS,
        maxRedirects: 3,
        validateStatus: () => true,
      });
      res.data?.destroy?.(); // headers are enough - do not download the picture
      if (res.status < 200 || res.status >= 300) return `returned HTTP ${res.status}`;
      const type = String(res.headers?.['content-type'] || '');
      if (type && !/^image\//i.test(type) && !/octet-stream/i.test(type)) return `is not an image (${type})`;
      return null;
    } catch (err) {
      return `could not be fetched (${err.code || err.message})`;
    }
  }

  /**
   * The assets Remotion will measure, plus the image problems found while building
   * them. Bad images are blanked in the copy so the render survives.
   */
  static async buildProps({ jobId, assets, http, lookup }) {
    const allowedHosts = buildAllowedHosts(config);
    const verdicts = new Map();
    const probe = (url) => {
      if (!verdicts.has(url)) verdicts.set(url, this.probeImage(url, { http, allowedHosts, lookup }));
      return verdicts.get(url);
    };

    const imageIssues = [];
    const scenes = [];
    for (const original of assets.scenes || []) {
      const scene = { ...original, elements: original.elements ? { ...original.elements } : original.elements };
      // The same picture is usually referenced twice (imageUrl and elements.image):
      // blank every reference, but report each bad URL once.
      const reported = new Set();
      for (const { field, url } of this._imageRefs(original)) {
        const problem = await probe(url);
        if (!problem) continue;
        if (!reported.has(url)) {
          reported.add(url);
          imageIssues.push({ scene: original.sceneNumber, type: 'image-failed', severity: 'error', message: `the image ${problem}`, detail: { url } });
        }
        if (field === 'imageUrl') scene.imageUrl = '';
        else scene.elements[field.replace('elements.', '')] = '';
      }
      scenes.push(scene);
    }

    return { props: { jobId: String(jobId), assets: { ...assets, scenes } }, imageIssues };
  }

  /**
   * Pull the per-scene reports out of a Remotion render's log. Each scene logs one
   * `VIREON_QC {json}` line (and Remotion echoes browser logs more than once), so
   * results are keyed by scene and the first valid one wins.
   */
  static parseOutput(output) {
    const bySceneNumber = new Map();
    for (const line of String(output || '').split(/\r?\n/)) {
      const at = line.indexOf(QC_MARKER);
      if (at < 0) continue;
      const rest = line.slice(at + QC_MARKER.length);
      const end = rest.lastIndexOf('}');
      if (end < 0) continue;
      try {
        const report = JSON.parse(rest.slice(0, end + 1));
        if (report && Number.isFinite(report.scene) && !bySceneNumber.has(report.scene)) bySceneNumber.set(report.scene, report);
      } catch {
        // a truncated or interleaved log line - the duplicate echo usually has it intact
      }
    }
    return bySceneNumber;
  }

  /** Flatten per-scene reports into one list with totals, and note scenes that never reported. */
  static summarize({ expectedScenes, reports, imageIssues = [] }) {
    const issues = [...imageIssues];

    for (const sceneNumber of expectedScenes) {
      const report = reports.get(sceneNumber);
      if (!report) {
        issues.push({ scene: sceneNumber, type: 'qc-no-result', severity: 'warn', message: 'the layout check produced no result for this scene' });
        continue;
      }
      if (report.error) {
        issues.push({ scene: sceneNumber, type: 'qc-error', severity: 'warn', message: `the layout check could not measure this scene: ${report.error}` });
      }
      for (const issue of report.issues || []) issues.push({ scene: sceneNumber, ...issue });
    }

    const rank = (i) => (i.severity === 'error' ? 0 : 1);
    issues.sort((a, b) => a.scene - b.scene || rank(a) - rank(b));

    return {
      scenesChecked: expectedScenes.length,
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warn').length,
      issues,
    };
  }

  /**
   * Check a video's layout. `assets` is the render-props shape RemotionService
   * .prepareAssets produces. Throws if the Remotion render itself fails.
   */
  static async run({ jobId, assets, signal, http, lookup }) {
    const startedAt = Date.now();
    const sceneNumbers = (assets.scenes || []).map((s) => s.sceneNumber);
    if (sceneNumbers.length === 0) return { scenesChecked: 0, errors: 0, warnings: 0, issues: [], durationMs: 0 };

    const { props, imageIssues } = await this.buildProps({ jobId, assets, http, lookup });

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vireon-qc-'));
    const propsPath = path.join(tmpDir, 'props.json');
    const outPath = path.join(tmpDir, 'qc.mp4');
    await fs.writeFile(propsPath, JSON.stringify(props), 'utf8');

    const [width, height] = String(assets.resolution || '1920x1080').split('x').map(Number);
    const args = [
      RemotionService.getRemotionBinary(),
      'render', 'LayoutQc', outPath,
      `--props=${propsPath}`,
      '--width', String(width || 1920),
      '--height', String(height || 1080),
      // Only the DOM is measured; the frames themselves are thrown away, so render them tiny.
      '--scale', '0.25',
      '--muted',
      '--log=verbose',
    ];

    try {
      let output;
      try {
        const { stdout, stderr } = await execFileAsync(process.execPath, args, {
          cwd: RemotionService.getRemotionProjectRoot(),
          timeout: config.qc.timeoutMs,
          maxBuffer: 200 * 1024 * 1024,
          signal: signal || undefined,
          windowsHide: true,
        });
        output = `${stdout}\n${stderr}`;
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        const tail = `${err.stderr || ''}${err.stdout || ''}`.split(/\r?\n/).filter(Boolean).slice(-5).join(' | ');
        throw new Error(`Layout check render failed: ${err.message}${tail ? ` - ${tail.slice(0, 400)}` : ''}`);
      }

      const summary = this.summarize({
        expectedScenes: sceneNumbers,
        reports: this.parseOutput(output),
        imageIssues,
      });
      const durationMs = Date.now() - startedAt;
      LoggerService.info('Layout check finished', { jobId, scenes: summary.scenesChecked, errors: summary.errors, warnings: summary.warnings, durationMs });
      return { ...summary, durationMs };
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

module.exports = LayoutQcService;
