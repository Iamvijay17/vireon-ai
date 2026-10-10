const { PublishError } = require('../../publishing/errors');
const { storageRangeStream } = require('../MetaApi');
const { composeText } = require('../contentRules');

const FB_HOST = 'https://www.facebook.com';
const absolute = (url) => (url && url.startsWith('/') ? `${FB_HOST}${url}` : url || '');

// Meta spells this field both ways across docs/versions.
const bytesOf = (phase) => Number(phase?.bytes_transferred ?? phase?.bytes_transfered) || 0;

const PHASE_ERROR = (phase) => phase && String(phase.status || '').toLowerCase() === 'error';

/**
 * Facebook Page posts through the Graph API.
 *   text   POST /{page}/feed
 *   image  POST /{page}/photos (bytes uploaded directly - no public URL needed)
 *   reel   video_reels: start -> rupload bytes -> wait until ready -> finish
 *   video  /{page}/videos chunked upload (start -> transfer chunks -> finish)
 * Facebook receives the bytes itself, so none of this needs SOCIAL_PUBLIC_MEDIA_BASE_URL.
 *
 * Each step persists what it learned through ctx.hooks.saveRemote BEFORE the next network
 * call, so a restart resumes instead of repeating.
 */
module.exports = {
  platform: 'facebook',

  /** Reels have a published rolling 30/24h API limit; plain posts and videos have no stated one. */
  countsTowardDailyLimit(post) {
    return post.format === 'reel';
  },

  text(post) {
    return composeText('facebook', post.content, { includeLink: post.format !== 'text' });
  },

  async start(ctx) {
    const { post, account, token, api, storage, settings, hooks } = ctx;
    const pageId = account.externalId;
    if (post.format === 'text' || post.format === 'image') return;
    const media = post.media;

    if (post.format === 'reel') {
      let videoId = post.remote.videoId;
      let uploadUrl = post.remote.containerId;
      if (!videoId) {
        const started = await api.startReel(pageId, token);
        videoId = started.videoId;
        uploadUrl = started.uploadUrl;
        await hooks.saveRemote({ videoId, containerId: uploadUrl, state: 'upload_started' });
      }
      // Resume from whatever Meta already has (a restart mid-upload, or a retry).
      const status = await api.getVideoStatus(videoId, token);
      if (PHASE_ERROR(status.uploading)) throw new PublishError('MEDIA_INVALID', 'Facebook rejected the uploaded video');
      if (String(status.uploading?.status || '').toLowerCase() !== 'complete') {
        const offset = Math.min(bytesOf(status.uploading), media.size);
        await hooks.progress(offset, media.size);
        await api.ruploadBytes(uploadUrl, token, {
          offset, fileSize: media.size,
          makeBody: (from) => storageRangeStream({ storage, bucket: media.bucket, key: media.key, offset: from, size: media.size, chunkBytes: settings.uploadChunkBytes, shouldAbort: hooks.lost, onProgress: (done) => hooks.progress(done, media.size) }),
        });
        await hooks.progress(media.size, media.size);
        await hooks.saveRemote({ state: 'uploaded' });
      }
      return;
    }

    // Regular video: chunked upload. An unfinished session cannot be resumed across a restart (the offset
    // is only known to the live session), but an unfinished upload is never published, so starting over is safe.
    const session = await api.startPageVideo(pageId, token, { fileSize: media.size });
    await hooks.saveRemote({ videoId: session.videoId, containerId: session.sessionId, state: 'upload_started' });
    let { startOffset, endOffset } = session;
    while (startOffset < endOffset) {
      await hooks.checkCancelled();
      const chunk = await storage.getObjectRange(media.bucket, media.key, startOffset, endOffset - startOffset);
      ({ startOffset, endOffset } = await api.transferPageVideoChunk(pageId, token, { sessionId: session.sessionId, startOffset, chunk }));
      await hooks.progress(Math.min(startOffset, media.size), media.size);
    }
    await api.finishPageVideo(pageId, token, { sessionId: session.sessionId, title: post.content.caption.split('\n')[0].slice(0, 100), description: this.text(post) });
    await hooks.saveRemote({ state: 'uploaded' });
  },

  /** @returns {{state: 'ready'|'processing'|'failed'|'expired', detail?: string}} */
  async poll(ctx) {
    const { post, token, api } = ctx;
    if (post.format === 'text' || post.format === 'image') return { state: 'ready' };
    const status = await api.getVideoStatus(post.remote.videoId, token);
    if (PHASE_ERROR(status.uploading) || PHASE_ERROR(status.processing) || status.videoStatus === 'error') {
      return { state: 'failed', detail: 'Facebook could not process the video' };
    }
    const processed = ['complete', 'ready'].includes(String(status.processing?.status || '').toLowerCase()) || status.videoStatus === 'ready';
    return { state: processed ? 'ready' : 'processing' };
  },

  /**
   * Send the publish. The caller has already persisted `publishAttemptedAt`.
   * @returns {{postId: string, permalink?: string, pending?: boolean}}
   */
  async publish(ctx) {
    const { post, account, token, api, storage } = ctx;
    const pageId = account.externalId;
    const text = this.text(post);

    if (post.format === 'text') {
      const { id } = await api.publishPageText(pageId, token, { message: text, link: post.content.linkUrl || undefined });
      return { postId: id };
    }
    if (post.format === 'image') {
      const bytes = await storage.getObjectRange(post.media.bucket, post.media.key, 0, post.media.size);
      const { id, postId } = await api.publishPagePhoto(pageId, token, { caption: text, bytes, fileName: post.media.fileName || 'image.jpg', contentType: post.media.contentType || 'image/jpeg' });
      return { postId: postId || id };
    }
    if (post.format === 'reel') {
      await api.finishReel(pageId, token, { videoId: post.remote.videoId, description: text, title: post.content.caption.split('\n')[0].slice(0, 100) });
      // finish only STARTS publishing; the post is live when the publishing phase reports complete.
      return { postId: post.remote.videoId, pending: true };
    }
    // Regular video went live when the upload session was finished.
    return { postId: post.remote.videoId, pending: true };
  },

  /** For publishes that finish asynchronously (reels / videos): is it live yet? */
  async confirm(ctx) {
    const { post, token, api } = ctx;
    const status = await api.getVideoStatus(post.remote.videoId, token);
    const publishing = String(status.publishing?.status || '').toLowerCase();
    if (PHASE_ERROR(status.publishing) || status.videoStatus === 'error') return { state: 'failed', detail: 'Facebook could not publish the video' };
    const live = publishing === 'complete' || (post.format === 'video' && status.videoStatus === 'ready' && status.published !== false);
    return live ? { state: 'live', permalink: absolute(status.permalink) } : { state: 'processing' };
  },

  async permalink(ctx, postId) {
    const { token, api } = ctx;
    try {
      const status = await api.getVideoStatus(postId, token);
      return absolute(status.permalink);
    } catch {
      return '';
    }
  },

  /**
   * After an unconfirmed publish: did it go through? `certain` means "not found AND safe to send again".
   * Reels/videos are checked by their video id; feed posts/photos have no idempotency, so they are searched
   * for in the Page's recent posts.
   */
  async reconcile(ctx) {
    const { post, account, token, api } = ctx;
    if (post.format === 'reel' || post.format === 'video') {
      if (!post.remote.videoId) return { found: false, certain: true };
      const c = await this.confirm(ctx);
      return c.state === 'live' ? { found: true, postId: post.remote.videoId, permalink: c.permalink } : { found: false, certain: true };
    }
    const attemptedAt = new Date(post.remote.publishAttemptedAt).getTime();
    const recent = await api.listPagePosts(account.externalId, token, 10);
    const want = this.text(post).trim();
    const hit = recent.find((p) => new Date(p.created_time).getTime() >= attemptedAt - 60_000 && (p.message || '').trim() === want);
    if (hit) return { found: true, postId: hit.id, permalink: absolute(hit.permalink_url) };
    // Listing can lag a little: only call it "certainly not posted" once the attempt is a couple of minutes old.
    return { found: false, certain: ctx.now() - attemptedAt >= 2 * 60_000 };
  },

  /** Metrics: public engagement counters (always available) + view metrics when Meta serves them. */
  async insights(ctx) {
    const { post, token, api } = ctx;
    const id = post.remote.postId;
    const out = {};
    const eng = await api.getPostEngagement(id, token).catch((err) => ({ error: err }));
    if (eng.error) {
      for (const k of ['reactions', 'comments', 'shares']) out[k] = { available: false, value: null, reason: eng.error.message };
    } else {
      out.reactions = eng.reactions === null ? { available: false, value: null, reason: 'Not returned by Facebook' } : { available: true, value: eng.reactions };
      out.comments = eng.comments === null ? { available: false, value: null, reason: 'Not returned by Facebook' } : { available: true, value: eng.comments };
      out.shares = { available: true, value: eng.shares };
    }
    out.views = await api.getInsightMetric(id, token, 'post_media_view', { platform: 'facebook' });
    out.reach = await api.getInsightMetric(id, token, 'post_total_media_view_unique', { platform: 'facebook' });
    return out;
  },
};
