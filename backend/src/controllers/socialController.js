const { z } = require('zod');
const config = require('../config');
const { getRuntime } = require('../services/social');
const SocialWebhooks = require('../services/social/SocialWebhooks');
const { RETURN_PATHS } = require('../services/social/constants');
const { PROVIDERS } = require('../services/social/SocialAuthService');
const { validate } = require('../validators');
const { idPatternFor } = require('../utils/id');
const { ValidationError } = require('../utils/errors');

const idOf = (prefix, label = 'id') => z.object({ [label]: z.string().regex(idPatternFor(prefix), 'Invalid id') });
const accountParam = validate(idOf('pac'));
const campaignParam = validate(idOf('cam'));
const postParam = validate(idOf('spo'));
const providerParam = validate(z.object({ provider: z.enum(Object.values(PROVIDERS)) }));

const connectSchema = z.object({ returnTo: z.string().refine((p) => RETURN_PATHS.has(p), 'Unsupported return path').optional() });
const retrySchema = z.object({ confirmNotPosted: z.boolean().optional() });
const refreshSchema = z.object({
  postId: z.string().regex(idPatternFor('spo')).optional(),
  platform: z.enum(['facebook', 'instagram', 'threads']).optional(),
  limit: z.number().int().min(1).max(25).optional(),
});
const str = (v) => (typeof v === 'string' ? v : '');
const owner = (req) => req.publishingOwner;

/**
 * HTTP layer for the Promotion Studio. Thin on purpose: validate the request,
 * call the service with the owner, shape the response. The rules live in
 * services/social/SocialService and SocialAuthService.
 */
class SocialController {
  static capabilities(req, res) {
    res.json(getRuntime().service.getCapabilities());
  }

  static async overview(req, res) {
    res.json(await getRuntime().service.overview(owner(req)));
  }

  // ── accounts / OAuth ──

  static async listAccounts(req, res) {
    res.json({ accounts: await getRuntime().auth.listAccounts(owner(req)) });
  }

  /** Step 1: returns the platform's consent URL; the SPA navigates the browser there. */
  static async startConnect(req, res) {
    const { provider } = providerParam({ provider: req.params.provider });
    const { returnTo } = validate(connectSchema)(req.body || {});
    const { authUrl, expiresAt } = await getRuntime().auth.startConnect(owner(req), provider, { returnTo });
    res.json({ authUrl, expiresAt });
  }

  /**
   * Step 2: the platform redirects the browser here. State is validated, the code is exchanged server-side
   * (the app secret never leaves the backend) and the browser is bounced to a FIXED frontend address - nothing
   * from the request decides where it lands, so this cannot be used as an open redirect.
   */
  static async oauthCallback(req, res) {
    const { provider } = providerParam({ provider: req.params.provider });
    const outcome = await getRuntime().auth.completeConnect(provider, {
      state: str(req.query.state), code: str(req.query.code), error: str(req.query.error),
    });
    const target = new URL(`${config.publishing.frontendUrl}${outcome.returnTo}`);
    target.searchParams.set('connect', outcome.result);
    target.searchParams.set('provider', provider);
    if (outcome.count) target.searchParams.set('count', String(Math.min(99, outcome.count)));
    // The authorization code is in this request's URL: keep it out of caches and Referer headers.
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    res.redirect(303, target.toString());
  }

  static async validateAccount(req, res) {
    const { id } = accountParam({ id: req.params.id });
    res.json(await getRuntime().auth.validate(owner(req), id));
  }

  static async disconnectAccount(req, res) {
    const { id } = accountParam({ id: req.params.id });
    const result = await getRuntime().auth.disconnect(owner(req), id);
    res.json({ disconnected: true, ...result });
  }

  // ── library / campaigns ──

  static async library(req, res) {
    res.json(await getRuntime().service.library());
  }

  static async createCampaign(req, res) {
    res.status(201).json({ campaign: await getRuntime().service.createCampaign(owner(req), req.body) });
  }

  static async listCampaigns(req, res) {
    res.json(await getRuntime().service.listCampaigns(owner(req), req.query));
  }

  static async getCampaign(req, res) {
    const { id } = campaignParam({ id: req.params.id });
    res.json(await getRuntime().service.getCampaign(owner(req), id));
  }

  static async updateCampaign(req, res) {
    const { id } = campaignParam({ id: req.params.id });
    res.json({ campaign: await getRuntime().service.updateCampaign(owner(req), id, req.body) });
  }

  static async deleteCampaign(req, res) {
    const { id } = campaignParam({ id: req.params.id });
    res.json(await getRuntime().service.deleteCampaign(owner(req), id));
  }

  /** Raw-body upload (PUT, Content-Type image/* or video/*): streamed, size-capped, type-checked by content. */
  static async uploadMedia(req, res) {
    const { id } = campaignParam({ id: req.params.id });
    const type = String(req.get('content-type') || '').toLowerCase();
    if (!/^(image\/(jpeg|png)|video\/(mp4|quicktime)|application\/octet-stream)/.test(type)) {
      throw new ValidationError('Send the file as the request body with Content-Type image/jpeg, image/png, video/mp4 or video/quicktime');
    }
    const length = Number(req.get('content-length')) || null;
    const campaign = await getRuntime().service.attachUpload(owner(req), id, {
      stream: req, fileName: str(req.get('x-file-name')) || 'upload', declaredLength: length,
    });
    res.json({ campaign });
  }

  static async generateCopy(req, res) {
    const { id } = campaignParam({ id: req.params.id });
    res.json(await getRuntime().service.generateCopy(owner(req), id, req.body));
  }

  static async validateCampaign(req, res) {
    const { id } = campaignParam({ id: req.params.id });
    res.json(await getRuntime().service.validate(owner(req), id, req.body));
  }

  static async publishCampaign(req, res) {
    const { id } = campaignParam({ id: req.params.id });
    const result = await getRuntime().service.publish(owner(req), id, req.body);
    // 201 when at least one destination was created; 422 when none was (each result says why).
    res.status(result.created > 0 ? 201 : 422).json(result);
  }

  // ── posts ──

  static async listPosts(req, res) {
    res.json(await getRuntime().service.listPosts(owner(req), req.query));
  }

  static async getPost(req, res) {
    const { id } = postParam({ id: req.params.id });
    res.json({ post: await getRuntime().service.getPost(owner(req), id) });
  }

  static async editPost(req, res) {
    const { id } = postParam({ id: req.params.id });
    res.json({ post: await getRuntime().service.editPost(owner(req), id, req.body) });
  }

  static async cancelPost(req, res) {
    const { id } = postParam({ id: req.params.id });
    res.json({ post: await getRuntime().service.cancelPost(owner(req), id) });
  }

  static async retryPost(req, res) {
    const { id } = postParam({ id: req.params.id });
    const body = validate(retrySchema)(req.body || {});
    const { post, enqueued } = await getRuntime().service.retryPost(owner(req), id, body);
    res.status(202).json({ post, enqueued });
  }

  static async deletePost(req, res) {
    const { id } = postParam({ id: req.params.id });
    res.json(await getRuntime().service.deletePost(owner(req), id));
  }

  static async calendar(req, res) {
    res.json(await getRuntime().service.calendar(owner(req), req.query));
  }

  // ── analytics ──

  static async analytics(req, res) {
    res.json(await getRuntime().service.analytics(owner(req), req.query));
  }

  static async refreshAnalytics(req, res) {
    const body = validate(refreshSchema)(req.body || {});
    res.json(await getRuntime().service.refreshInsights(owner(req), body));
  }

  // ── platform callbacks (public; authenticated by signature) ──

  /** Meta / Threads "deauthorize" and "data deletion" callbacks. Always answers quickly; an invalid signature gets a 400. */
  static async deauthorizeWebhook(req, res) {
    const { provider } = providerParam({ provider: req.params.provider });
    const { ok } = await new SocialWebhooks().deauthorize(provider, str(req.body?.signed_request));
    return ok ? res.json({ success: true }) : res.status(400).json({ error: 'Invalid signed request' });
  }

  static async dataDeletionWebhook(req, res) {
    const { provider } = providerParam({ provider: req.params.provider });
    const result = await new SocialWebhooks().dataDeletion(provider, str(req.body?.signed_request));
    if (!result) return res.status(400).json({ error: 'Invalid signed request' });
    // Meta shows the user this URL + code as proof of deletion.
    return res.json({ url: `${config.publishing.frontendUrl}/promotion?deletion=${encodeURIComponent(result.code)}`, confirmation_code: result.code });
  }
}

module.exports = SocialController;
