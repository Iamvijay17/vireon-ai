const axios = require('axios');
const { abortableDelay, makeAbortError } = require('../../utils/abortableDelay');
const { firstOutputImage } = require('./workflow');

/**
 * Thin HTTP client for a running ComfyUI server: queue a workflow, wait for
 * it, fetch the image. Knows nothing about Vireon scenes or storage.
 *
 * `http` is injectable so tests can drive it without a server.
 */
class ComfyUIClient {
  constructor({ baseUrl, http = axios, pollIntervalMs = 1000 }) {
    this.baseUrl = String(baseUrl).replace(/\/+$/, '');
    this.http = http;
    this.pollIntervalMs = pollIntervalMs;
  }

  /** Queue an API-format workflow. Returns the prompt id. */
  async queue(workflow, clientId) {
    try {
      const res = await this.http.post(`${this.baseUrl}/prompt`, { prompt: workflow, client_id: clientId }, { timeout: 15000 });
      const id = res.data?.prompt_id;
      if (!id) throw new Error('ComfyUI did not return a prompt_id');
      return id;
    } catch (err) {
      throw new Error(`ComfyUI rejected the workflow: ${this._describe(err)}`);
    }
  }

  /**
   * Poll /history until the prompt finishes. Resolves the history entry;
   * rejects on a ComfyUI-reported error, on timeout, or on abort (which also
   * interrupts the running job so the GPU is freed, not just ignored).
   */
  async waitForResult(promptId, { timeoutMs, signal }) {
    const deadline = Date.now() + timeoutMs;

    while (true) {
      if (signal?.aborted) {
        await this.interrupt().catch(() => {});
        throw makeAbortError();
      }

      const res = await this.http.get(`${this.baseUrl}/history/${promptId}`, { timeout: 15000 });
      const entry = res.data?.[promptId];
      if (entry) {
        const status = entry.status || {};
        if (status.status_str === 'error') {
          const messages = (status.messages || []).filter(([kind]) => kind === 'execution_error');
          const detail = messages[0]?.[1]?.exception_message || 'ComfyUI reported an execution error';
          throw new Error(`ComfyUI failed to generate the image: ${String(detail).trim()}`);
        }
        if (status.completed || firstOutputImage(entry)) return entry;
      }

      if (Date.now() >= deadline) {
        await this.interrupt().catch(() => {});
        throw new Error(`ComfyUI image generation timed out after ${Math.round(timeoutMs / 1000)}s`);
      }
      await abortableDelay(this.pollIntervalMs, signal);
    }
  }

  /** Download an image listed in a history entry. Returns a Buffer. */
  async download({ filename, subfolder = '', type = 'output' }) {
    const res = await this.http.get(`${this.baseUrl}/view`, {
      params: { filename, subfolder, type },
      responseType: 'arraybuffer',
      timeout: 60000,
    });
    return Buffer.from(res.data);
  }

  /** Stop whatever ComfyUI is currently executing. */
  async interrupt() {
    await this.http.post(`${this.baseUrl}/interrupt`, {}, { timeout: 5000 });
  }

  /** Ask ComfyUI to drop its loaded models and cache, returning VRAM to the card. */
  async free() {
    await this.http.post(`${this.baseUrl}/free`, { unload_models: true, free_memory: true }, { timeout: 10000 });
  }

  /** ComfyUI validation errors come back as a 400 with node_errors - surface which node and why. */
  _describe(err) {
    const data = err.response?.data;
    if (data?.node_errors && Object.keys(data.node_errors).length > 0) {
      const parts = Object.entries(data.node_errors).flatMap(([node, e]) =>
        (e.errors || []).map((x) => `node ${node} (${e.class_type}): ${x.message}${x.details ? ` - ${x.details}` : ''}`)
      );
      if (parts.length) return parts.join('; ');
    }
    return data?.error?.message || data?.error || err.message;
  }
}

module.exports = ComfyUIClient;
