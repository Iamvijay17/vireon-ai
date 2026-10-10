const { composeText } = require('../contentRules');
const mediaGateway = require('../mediaGateway');

/**
 * Threads through the official Threads API: create a container, wait for it to
 * finish, publish it.
 *
 * Text posts need no media. Image and video posts are fetched by Threads from a
 * public URL, so they need SOCIAL_PUBLIC_MEDIA_BASE_URL (validation refuses them
 * up front when it is missing). For a text post a destination link goes in
 * `link_attachment` (a link preview); for media posts it is appended to the text.
 *
 * As with Instagram, a container publishes once, so the container's status is what
 * settles "did that publish go through?" after an interrupted call.
 */
module.exports = {
  platform: 'threads',

  countsTowardDailyLimit() {
    return true;
  },

  text(post) {
    return composeText('threads', post.content, { includeLink: post.format !== 'text' });
  },

  async start(ctx) {
    const { post, account, token, api, settings, hooks } = ctx;
    if (post.remote.containerId) return;

    const text = this.text(post);
    let created;
    if (post.format === 'text') {
      created = await api.createContainer(account.externalId, token, { mediaType: 'TEXT', text, linkAttachment: post.content.linkUrl || undefined });
    } else if (post.format === 'image') {
      created = await api.createContainer(account.externalId, token, { mediaType: 'IMAGE', text, imageUrl: mediaGateway.publicMediaUrl(post.media, { settings }) });
    } else {
      created = await api.createContainer(account.externalId, token, { mediaType: 'VIDEO', text, videoUrl: mediaGateway.publicMediaUrl(post.media, { settings }) });
    }
    await hooks.saveRemote({ containerId: created.id, state: 'container_created' });
  },

  async poll(ctx) {
    const { post, token, api } = ctx;
    const c = await api.getContainer(post.remote.containerId, token);
    switch (c.status) {
      case 'FINISHED': return { state: 'ready' };
      case 'PUBLISHED': return { state: 'published' };
      case 'EXPIRED': return { state: 'expired', detail: 'The media container expired before it was published' };
      case 'ERROR': return { state: 'failed', detail: c.errorMessage || 'Threads could not process the media' };
      default: return { state: 'processing' };
    }
  },

  async quota(ctx) {
    const { account, token, api } = ctx;
    return api.getPublishingLimit(account.externalId, token);
  },

  async publish(ctx) {
    const { post, account, token, api } = ctx;
    const { id } = await api.publishContainer(account.externalId, token, post.remote.containerId);
    return { postId: id, permalink: await this.permalink(ctx, id) };
  },

  async permalink(ctx, postId) {
    try {
      return (await ctx.api.getMedia(postId, ctx.token)).permalink;
    } catch {
      return '';
    }
  },

  async reconcile(ctx) {
    const { post, account, token, api } = ctx;
    if (!post.remote.containerId) return { found: false, certain: true };
    const c = await api.getContainer(post.remote.containerId, token);
    if (c.status !== 'PUBLISHED') return { found: false, certain: true };
    const attemptedAt = new Date(post.remote.publishAttemptedAt).getTime();
    const recent = await api.listRecentThreads(account.externalId, token, { since: new Date(attemptedAt - 5 * 60_000), limit: 10 });
    const hit = recent.find((m) => (m.text || '').trim() === this.text(post).trim()) || recent.find((m) => new Date(m.timestamp).getTime() >= attemptedAt - 60_000);
    return hit ? { found: true, postId: hit.id, permalink: hit.permalink || '' } : { found: false, certain: false };
  },

  async insights(ctx) {
    const { post, token, api } = ctx;
    const out = {};
    for (const m of ['views', 'likes', 'replies', 'reposts', 'quotes', 'shares']) {
      const key = m === 'replies' ? 'comments' : m;
      out[key] = await api.getInsightMetric(post.remote.postId, token, m);
    }
    return out;
  },
};
