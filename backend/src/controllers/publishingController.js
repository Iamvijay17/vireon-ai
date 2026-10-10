const { z } = require('zod');
const config = require('../config');
const LoggerService = require('../services/common/LoggerService');
const { getRuntime } = require('../services/publishing');
const { getStorageProvider } = require('../services/storage/providers');
const { validate } = require('../validators');
const { idPatternFor } = require('../utils/id');
const { NotFoundError } = require('../utils/errors');
const { sanitizeFilename } = require('../utils/filename');
const { RETURN_PATHS } = require('../services/publishing/youtube/YouTubeAuthService');
const { saveProfile } = require('../services/publishing/udemy/courseData');
const { PUBLISH_PLATFORM, PUBLISH_STATUS } = require('../constants');

const idOf = (prefix, label = 'id') => z.object({ [label]: z.string().regex(idPatternFor(prefix), 'Invalid id') });
const accountParam = validate(idOf('pac'));
const jobParam = validate(idOf('pub'));
const courseParam = validate(idOf('cou', 'courseId'));

const connectSchema = z.object({ returnTo: z.string().refine((p) => RETURN_PATHS.has(p), 'Unsupported return path').optional() });
const submitSchema = z.object({ confirm: z.literal(true, { errorMap: () => ({ message: 'Publishing needs explicit confirmation (confirm: true)' }) }) });
const str = (v) => (typeof v === 'string' ? v : '');

const owner = (req) => req.publishingOwner;

/**
 * HTTP layer for publishing. Thin on purpose: validate the request, call the
 * service with the owner, shape the response. The rules live in
 * services/publishing/PublishingService.
 */
class PublishingController {
  static async capabilities(req, res) {
    res.json(await getRuntime().service.getCapabilities());
  }

  // ── accounts / OAuth ──

  static async listAccounts(req, res) {
    res.json({ accounts: await getRuntime().auth.listAccounts(owner(req)) });
  }

  /** Step 1: returns the Google consent URL; the SPA navigates the browser there. */
  static async startYouTubeConnect(req, res) {
    const { returnTo } = validate(connectSchema)(req.body || {});
    const { auth } = getRuntime();
    const { authUrl, expiresAt } = await auth.startConnect(owner(req), { returnTo });
    res.json({ authUrl, expiresAt });
  }

  /**
   * Step 2: Google redirects the browser here. We validate state, exchange the
   * code server-side (the client secret never leaves the backend) and bounce
   * the browser to a FIXED frontend address - nothing from the request decides
   * where it lands, so this cannot be used as an open redirect.
   */
  static async googleCallback(req, res) {
    const { auth } = getRuntime();
    const outcome = await auth.completeConnect({ state: str(req.query.state), code: str(req.query.code), error: str(req.query.error) });

    const target = new URL(`${config.publishing.frontendUrl}${outcome.returnTo}`);
    target.searchParams.set('connect', outcome.result);
    // The authorization code is in this request's URL: keep it out of caches and Referer headers.
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    res.redirect(303, target.toString());
  }

  static async disconnectAccount(req, res) {
    const { id } = accountParam({ id: req.params.id });
    const result = await getRuntime().auth.disconnect(owner(req), id);
    res.json({ disconnected: true, ...result });
  }

  // ── lessons / jobs ──

  static async listLessons(req, res) {
    const { courseId } = courseParam({ courseId: req.params.courseId });
    res.json(await getRuntime().service.listLessons(owner(req), courseId));
  }

  static async createJob(req, res) {
    const { job, existing } = await getRuntime().service.createDraft(owner(req), req.body);
    res.status(existing ? 200 : 201).json({ job: getRuntime().service.decorate(job), existing });
  }

  static async listJobs(req, res) {
    res.json(await getRuntime().service.list(owner(req), req.query));
  }

  static async history(req, res) {
    res.json(await getRuntime().service.list(owner(req), { ...req.query, finished: 'true' }));
  }

  static async getJob(req, res) {
    const { id } = jobParam({ id: req.params.id });
    res.json({ job: await getRuntime().service.get(owner(req), id) });
  }

  static async updateJob(req, res) {
    const { id } = jobParam({ id: req.params.id });
    const { service } = getRuntime();
    const job = await service.updateMetadata(owner(req), id, req.body?.metadata ?? req.body);
    res.json({ job: service.decorate(job) });
  }

  static async submitJob(req, res) {
    const { id } = jobParam({ id: req.params.id });
    validate(submitSchema)(req.body || {});
    const { service } = getRuntime();
    const { job, enqueued } = await service.submit(owner(req), id, { confirm: true });
    res.status(202).json({ job: service.decorate(job), enqueued });
  }

  static async retryJob(req, res) {
    const { id } = jobParam({ id: req.params.id });
    const { service } = getRuntime();
    const { job, enqueued } = await service.retry(owner(req), id);
    res.status(202).json({ job: service.decorate(job), enqueued });
  }

  static async cancelJob(req, res) {
    const { id } = jobParam({ id: req.params.id });
    const { service } = getRuntime();
    res.json({ job: service.decorate(await service.cancel(owner(req), id)) });
  }

  static async deleteJob(req, res) {
    const { id } = jobParam({ id: req.params.id });
    res.json(await getRuntime().service.discard(owner(req), id));
  }

  // ── Udemy ──

  static async udemyOverview(req, res) {
    const { courseId } = courseParam({ courseId: req.params.courseId });
    res.json(await getRuntime().service.getUdemyOverview(owner(req), courseId));
  }

  static async saveUdemyProfile(req, res) {
    const { courseId } = courseParam({ courseId: req.params.courseId });
    const profile = await saveProfile(owner(req), courseId, req.body);
    res.json({ profile });
  }

  static async createUdemyExport(req, res) {
    const { courseId } = courseParam({ courseId: req.params.courseId });
    const { job, enqueued } = await getRuntime().service.createExport(owner(req), courseId, req.body);
    res.status(202).json({ job, enqueued });
  }

  /** Stream a finished package. The storage location is never exposed; the job id is the handle. */
  static async downloadExport(req, res, next) {
    const { id } = jobParam({ id: req.params.id });
    const job = await getRuntime().service.getOwnedRaw(owner(req), id);
    if (job.platform !== PUBLISH_PLATFORM.UDEMY_EXPORT || job.status !== PUBLISH_STATUS.COMPLETED || !job.exportResult?.key) {
      throw new NotFoundError('There is no finished package for this job');
    }

    const stream = await getStorageProvider().getObjectStream(job.exportResult.bucket, job.exportResult.key);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', String(job.exportResult.size));
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(job.exportResult.fileName.replace(/\.zip$/i, ''))}.zip"`);
    stream.on('error', (err) => {
      LoggerService.error('Package download stream failed', { jobId: id, error: err.message });
      next(err);
    });
    stream.pipe(res);
  }
}

module.exports = PublishingController;
