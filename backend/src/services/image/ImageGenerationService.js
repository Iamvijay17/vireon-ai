const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const config = require('../../config');
const LoggerService = require('../common/LoggerService');
const MetricsService = require('../common/MetricsService');
const CacheService = require('../common/CacheService');
const { getStorageProvider } = require('../storage/providers');
const ComfyUIClient = require('./ComfyUIClient');
const { fillWorkflow, placeholdersIn, firstOutputImage } = require('./workflow');

/**
 * Generates one scene image through ComfyUI and stores it.
 *
 *   prompt -> (cache hit? reuse) -> workflow -> ComfyUI -> PNG -> MinIO -> URL
 *
 * The caller owns GPU scheduling (`gpu.withGPU('comfyui', ...)`), so a whole
 * batch of images holds the card once instead of reloading the model per image.
 */
// Misconfiguration, not a transient failure - retrying cannot fix it.
const configError = (message) => Object.assign(new Error(message), { permanent: true });

class ImageGenerationService {
  /** Native generation size for a video aspect ratio ("16:9", "9:16", "1:1", "4:5"). */
  static sizeFor(aspectRatio) {
    const [w, h] = String(aspectRatio || '16:9').split(':').map(Number);
    const ratio = w > 0 && h > 0 ? w / h : 16 / 9;
    const key = ratio > 1.2 ? 'landscapeSize' : ratio < 0.85 ? 'portraitSize' : 'squareSize';
    const [width, height] = String(config.imageGen[key]).split('x').map(Number);
    return { width, height };
  }

  /**
   * Seed derived from the prompt, so the same prompt always makes the same image
   * (which is what lets the cache key below mean something across jobs).
   */
  static seedFor(prompt) {
    return crypto.createHash('sha256').update(String(prompt)).digest().readUIntBE(0, 6);
  }

  static async _loadWorkflow() {
    const raw = await fs.readFile(config.imageGen.workflowPath, 'utf8').catch((err) => {
      throw configError(`Image workflow not found at ${config.imageGen.workflowPath}: ${err.message}`);
    });
    try {
      return { template: JSON.parse(raw), raw };
    } catch (err) {
      throw configError(`Image workflow ${config.imageGen.workflowPath} is not valid JSON: ${err.message}`);
    }
  }

  /** Everything that decides what the image looks like - the cache key's inputs. */
  static _params(prompt, aspectRatio) {
    const { width, height } = this.sizeFor(aspectRatio);
    const g = config.imageGen;
    return {
      prompt,
      negative: g.negativePrompt,
      seed: this.seedFor(prompt),
      width,
      height,
      steps: g.steps,
      cfg: g.cfg,
      sampler: g.sampler,
      scheduler: g.scheduler,
      checkpoint: g.checkpoint,
    };
  }

  /**
   * Generate (or fetch from cache) the image for `prompt` and return its public URL.
   * @returns {Promise<{ url, fileName, cacheKey, fromCache, durationMs }>}
   */
  static async generate({ jobId, prompt, aspectRatio, signal }) {
    const { template, raw } = await this._loadWorkflow();
    const params = this._params(prompt, aspectRatio);

    if (placeholdersIn(template).has('checkpoint') && !params.checkpoint) {
      throw configError('COMFYUI_CHECKPOINT is not set - name the checkpoint file ComfyUI should generate with (see backend/workflows/README.md)');
    }

    // The workflow file's own bytes are part of the key: editing it (a different
    // sampler graph, an extra LoRA) must not keep serving the old pictures.
    const cacheKey = CacheService.hashInputs({
      ...params,
      workflow: crypto.createHash('sha256').update(raw).digest('hex'),
    });
    const fileName = `img-${cacheKey.slice(0, 16)}.png`;
    const provider = getStorageProvider();

    const cached = await CacheService.getImage(cacheKey, jobId, fileName);
    if (cached) {
      return { url: provider.getPublicUrl(jobId, 'image', fileName), fileName, cacheKey, fromCache: true, durationMs: 0 };
    }

    const startedAt = Date.now();
    const png = await this._render(template, params, signal);

    const dir = path.resolve(__dirname, '../../../jobs', jobId, 'images');
    await fs.mkdir(dir, { recursive: true });
    const localPath = path.join(dir, fileName);
    await fs.writeFile(localPath, png);

    const url = await provider.uploadFile(jobId, localPath, 'image', { cacheKey });
    await CacheService.putImage(cacheKey, localPath, {
      width: params.width, height: params.height, seed: params.seed, checkpoint: params.checkpoint,
    });

    const durationMs = Date.now() - startedAt;
    MetricsService.recordDuration('image.duration', durationMs);
    LoggerService.info('Scene image generated', { jobId, fileName, durationMs, width: params.width, height: params.height });
    return { url, fileName, cacheKey, fromCache: false, durationMs };
  }

  static async _render(template, params, signal) {
    // Make sure ComfyUI is up before queueing (starts it if it is managed).
    await require('../localAI').comfyUI.ensureRunning();

    const client = new ComfyUIClient({ baseUrl: config.imageGen.apiUrl });
    const promptId = await client.queue(fillWorkflow(template, params), crypto.randomUUID());
    const entry = await client.waitForResult(promptId, { timeoutMs: config.imageGen.timeoutMs, signal });

    const image = firstOutputImage(entry);
    if (!image) throw new Error('ComfyUI finished but returned no image - does the workflow end in a SaveImage node?');
    return client.download(image);
  }
}

module.exports = ImageGenerationService;
