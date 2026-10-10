const { PublishError, fromNetworkError } = require('../publishing/errors');
const { fromMetaResponse } = require('./errors');

/**
 * The one place the social API clients touch the network. Stateless: no
 * retries, no token caching, no persistence (callers own policy). Every failure
 * leaves here as a classified PublishError whose message never contains a
 * token, a request body or a URL.
 */
class GraphHttp {
  /**
   * @param {object} opts
   * @param {typeof fetch} opts.fetchImpl injectable so the whole stack is tested against a fake platform
   * @param {() => number} opts.timeoutMs
   * @param {'facebook'|'instagram'|'threads'} opts.platform used for wording + error classification
   */
  constructor({ fetchImpl = globalThis.fetch, timeoutMs, platform = 'facebook' } = {}) {
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.platform = platform;
    this.label = platform === 'threads' ? 'Threads' : 'Meta';
  }

  async request(url, init = {}, { timeoutMs = this.timeoutMs() } = {}) {
    try {
      return await this.fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      if (err instanceof PublishError) throw err;
      const network = fromNetworkError(err);
      throw new PublishError('NETWORK', network ? `${network.message.replace(/Google/g, this.label)}` : `Could not reach ${this.label}`, { cause: err });
    }
  }

  async readJson(res) {
    const text = await res.text().catch(() => '');
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  /** Request, parse JSON, throw a classified PublishError on a non-2xx or on an error envelope. */
  async json(url, init, { context = 'request', platform = this.platform, timeoutMs } = {}) {
    const res = await this.request(url, init, timeoutMs ? { timeoutMs } : undefined);
    const body = await this.readJson(res);
    if (!res.ok || body?.error) {
      throw fromMetaResponse(res.status, body, { platform, context });
    }
    return body;
  }
}

/** Build a URL with query parameters (undefined/null values are skipped). */
function withQuery(base, params = {}) {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function formBody(params = {}) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') body.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  return body;
}

module.exports = { GraphHttp, withQuery, formBody };
