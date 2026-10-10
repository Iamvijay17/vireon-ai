const { PublishError } = require('../../publishing/errors');
const { storageRangeStream } = require('../MetaApi');
const { composeText } = require('../contentRules');
const mediaGateway = require('../mediaGateway');

/**
 * Instagram professional accounts through the Instagram API with Facebook
 * Login: create a media container, wait for it to finish processing, publish it.
 *
 * Media delivery:
 *   image    always a public URL (resumable upload exists for video only)
 *   reel     the public URL when SOCIAL_PUBLIC_MEDIA_BASE_URL is set (the documented, universal path);
 *            otherwise a resumable upload straight from storage - Meta documents that only for apps
 *            using Facebook Login for Business, so it is attempted and any refusal is reported
 *            as is (see docs/social-promotion.md).
 *
 * A container can be published exactly once, which is what makes a retry after an
 * unconfirmed publish safe: the container's own status tells us whether it went out.
 */
module.exports = {
  platform: 'instagram',

  countsTowardDailyLimit() {
    return true;
  },

  text(post) {
    return composeText('instagram', post.content, { includeLink: false });
  },

  async start(ctx) {
    const { post, account, token, api, storage, settings, hooks } = ctx;
    const igUserId = account.externalId;
    const media = post.media;
    let containerId = post.remote.containerId;
    let uploadUrl = '';

    if (!containerId) {
      const caption = this.text(post);
      if (post.format === 'image') {
        const created = await api.createIgContainer(igUserId, token, {
          imageUrl: mediaGateway.publicMediaUrl(media, { settings }), caption, isAiGenerated: ctx.aiLabel,
        });
        containerId = created.id;
      } else if (mediaGateway.isConfigured(settings)) {
        const created = await api.createIgContainer(igUserId, token, {
          mediaType: 'REELS', videoUrl: mediaGateway.publicMediaUrl(media, { settings }), caption, isAiGenerated: ctx.aiLabel,
        });
        containerId = created.id;
      } else {
        const created = await api.createIgContainer(igUserId, token, { mediaType: 'REELS', resumable: true, caption, isAiGenerated: ctx.aiLabel });
        containerId = created.id;
        uploadUrl = created.uploadUrl;
        if (!uploadUrl) throw new PublishError('MEDIA_INVALID', 'Instagram did not return an upload URL for a resumable upload');
      }
      // Persist before uploading a byte: a restart then resumes THIS container.
      await hooks.saveRemote({ containerId, state: uploadUrl ? 'upload_started' : 'container_created' });
    } else if (post.format === 'reel' && !mediaGateway.isConfigured(settings)) {
      uploadUrl = `https://rupload.facebook.com/ig-api-upload/${settings.meta.graphVersion}/${containerId}`;
    }

    if (uploadUrl) {
      const status = await api.getIgContainer(containerId, token);
      if (status.uploadStatus !== 'complete') {
        const offset = Math.min(status.bytesTransferred, media.size);
        await hooks.progress(offset, media.size);
        await api.ruploadBytes(uploadUrl, token, {
          offset, fileSize: media.size, platform: 'instagram',
          makeBody: (from) => storageRangeStream({ storage, bucket: media.bucket, key: media.key, offset: from, size: media.size, chunkBytes: settings.uploadChunkBytes, shouldAbort: hooks.lost, onProgress: (done) => hooks.progress(done, media.size) }),
        });
        await hooks.progress(media.size, media.size);
        await hooks.saveRemote({ state: 'uploaded' });
      }
    }
  },

  async poll(ctx) {
    const { post, token, api } = ctx;
    const c = await api.getIgContainer(post.remote.containerId, token);
    switch (c.statusCode) {
      case 'FINISHED': return { state: 'ready' };
      case 'PUBLISHED': return { state: 'published' };
      case 'EXPIRED': return { state: 'expired', detail: 'The media container expired before it was published' };
      case 'ERROR': return { state: 'failed', detail: c.status || 'Instagram could not process the media' };
      default: return { state: 'processing' };
    }
  },

  async quota(ctx) {
    const { account, token, api } = ctx;
    const { used, total } = await api.getIgPublishingLimit(account.externalId, token);
    return { used, total };
  },

  async publish(ctx) {
    const { post, account, token, api } = ctx;
    const { id } = await api.publishIgContainer(account.externalId, token, post.remote.containerId);
    const permalink = await this.permalink(ctx, id);
    return { postId: id, permalink };
  },

  async permalink(ctx, postId) {
    try {
      return (await ctx.api.getIgMedia(postId, ctx.token)).permalink;
    } catch {
      return '';
    }
  },

  async reconcile(ctx) {
    const { post, account, token, api } = ctx;
    if (!post.remote.containerId) return { found: false, certain: true };
    const c = await api.getIgContainer(post.remote.containerId, token);
    if (c.statusCode !== 'PUBLISHED') return { found: false, certain: true };
    // It did go out; recover the media id from the account's latest media.
    const attemptedAt = new Date(post.remote.publishAttemptedAt).getTime();
    const recent = await api.listIgRecentMedia(account.externalId, token, 10);
    const hit = recent.find((m) => new Date(m.timestamp).getTime() >= attemptedAt - 5 * 60_000 && (m.caption || '').trim() === this.text(post).trim())
      || recent.find((m) => new Date(m.timestamp).getTime() >= attemptedAt - 60_000);
    return hit ? { found: true, postId: hit.id, permalink: hit.permalink || '' } : { found: false, certain: false };
  },

  async insights(ctx) {
    const { post, token, api } = ctx;
    const id = post.remote.postId;
    const metrics = post.format === 'image'
      ? ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions']
      : ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions', 'ig_reels_avg_watch_time'];
    const out = {};
    for (const m of metrics) {
      const key = m === 'saved' ? 'saves' : m === 'total_interactions' ? 'interactions' : m === 'ig_reels_avg_watch_time' ? 'avgWatchTimeMs' : m;
      out[key] = await api.getInsightMetric(id, token, m, { platform: 'instagram' });
    }
    return out;
  },
};
