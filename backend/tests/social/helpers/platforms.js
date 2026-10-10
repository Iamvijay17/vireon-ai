const { PublishError } = require('../../../src/services/publishing/errors');

/**
 * Stateful fakes of Meta and Threads for the worker tests. They behave like the real
 * services in the ways that matter to correctness: containers progress through statuses,
 * a container can be published once, uploads accumulate, and every call is recorded so a
 * test can assert exactly what was (and was not) sent.
 */

const bytes = (n) => Buffer.alloc(n, 7);

function fakeMeta(over = {}) {
  const s = {
    calls: [],
    igContainers: new Map(), // id -> { status, published }
    igStatusScript: [], // statuses returned by successive polls (then FINISHED)
    igMedia: [], // recent media list
    pagePosts: [],
    posted: [], // everything that actually went live
    video: { uploading: { status: 'in_progress', bytes_transferred: 0 }, processing: { status: 'not_started' }, publishing: { status: 'not_started' }, videoStatus: 'processing' },
    failures: {}, // method -> array of errors thrown in order
    uploaded: 0,
    seq: 0,
  };
  const rec = (name, args) => { s.calls.push([name, args]); };
  const maybeFail = (name) => {
    const f = s.failures[name]?.shift();
    if (f) throw f;
  };
  const api = {
    isConfigured: () => true,
    createIgContainer: jest.fn(async (igUserId, token, p) => {
      rec('createIgContainer', p); maybeFail('createIgContainer');
      s.seq += 1;
      const id = `IGC${s.seq}`;
      s.igContainers.set(id, { status: 'IN_PROGRESS', published: false, params: p });
      return { id, uploadUrl: p.resumable ? `https://rupload.facebook.com/ig-api-upload/v25.0/${id}` : '' };
    }),
    getIgContainer: jest.fn(async (id) => {
      rec('getIgContainer', id); maybeFail('getIgContainer');
      const c = s.igContainers.get(id) || { status: 'IN_PROGRESS', published: false };
      if (c.published) return { statusCode: 'PUBLISHED', status: '', uploadStatus: 'complete', bytesTransferred: s.uploaded, processingStatus: 'complete' };
      const scripted = s.igStatusScript.shift();
      const statusCode = scripted || 'FINISHED';
      return { statusCode, status: statusCode === 'ERROR' ? 'Video codec not supported' : '', uploadStatus: s.uploaded >= (c.params?.size || Infinity) ? 'complete' : (s.uploaded ? 'complete' : 'in_progress'), bytesTransferred: s.uploaded, processingStatus: 'in_progress' };
    }),
    publishIgContainer: jest.fn(async (igUserId, token, containerId) => {
      rec('publishIgContainer', containerId); maybeFail('publishIgContainer');
      const c = s.igContainers.get(containerId);
      if (c?.published) throw new PublishError('CONTENT_REJECTED', 'container already published', { httpStatus: 400 });
      if (c) c.published = true;
      s.seq += 1;
      const id = `IGM${s.seq}`;
      s.posted.push({ platform: 'instagram', id });
      s.igMedia.unshift({ id, permalink: `https://www.instagram.com/reel/${id}/`, timestamp: new Date().toISOString(), caption: c?.params?.caption || '' });
      return { id };
    }),
    getIgMedia: jest.fn(async (id) => ({ id, permalink: `https://www.instagram.com/reel/${id}/`, mediaType: 'VIDEO', productType: 'REELS', timestamp: null, caption: '' })),
    listIgRecentMedia: jest.fn(async () => s.igMedia),
    getIgPublishingLimit: jest.fn(async () => ({ used: 3, total: 100 })),
    ruploadBytes: jest.fn(async (url, token, { offset, fileSize, makeBody }) => {
      rec('ruploadBytes', { url, offset, fileSize });
      maybeFail('ruploadBytes');
      const body = makeBody(offset);
      let got = 0;
      if (body && typeof body[Symbol.asyncIterator] === 'function') for await (const c of body) got += c.length;
      s.uploaded = offset + got;
      Object.assign(s.video, { uploading: { status: 'complete', bytes_transferred: s.uploaded }, processing: { status: 'complete' }, videoStatus: 'ready' });
      return { success: true };
    }),
    // Facebook
    publishPageText: jest.fn(async (pageId, token, p) => {
      rec('publishPageText', p); maybeFail('publishPageText');
      s.seq += 1;
      const id = `${pageId}_${s.seq}`;
      s.posted.push({ platform: 'facebook', id });
      s.pagePosts.unshift({ id, message: p.message, created_time: new Date().toISOString(), permalink_url: `https://www.facebook.com/${id}` });
      return { id };
    }),
    publishPagePhoto: jest.fn(async (pageId, token, p) => {
      rec('publishPagePhoto', { caption: p.caption, bytes: p.bytes?.length }); maybeFail('publishPagePhoto');
      s.seq += 1;
      s.posted.push({ platform: 'facebook', id: `PH${s.seq}` });
      return { id: `PH${s.seq}`, postId: `${pageId}_PH${s.seq}` };
    }),
    startReel: jest.fn(async () => {
      rec('startReel'); maybeFail('startReel');
      return { videoId: 'REEL1', uploadUrl: 'https://rupload.facebook.com/video-upload/v25.0/REEL1' };
    }),
    getVideoStatus: jest.fn(async () => {
      rec('getVideoStatus'); maybeFail('getVideoStatus');
      return { ...s.video, permalink: '/reel/REEL1', published: undefined };
    }),
    finishReel: jest.fn(async () => {
      rec('finishReel'); maybeFail('finishReel');
      s.posted.push({ platform: 'facebook', id: 'REEL1' });
      if (s.reelStaysPublishing) return { success: true };
      s.video.publishing = { status: 'complete' };
      return { success: true };
    }),
    listPagePosts: jest.fn(async () => s.pagePosts),
    getPostEngagement: jest.fn(async () => ({ reactions: 4, comments: 1, shares: 0 })),
    getInsightMetric: jest.fn(async () => ({ available: true, value: 10 })),
    ...over,
  };
  api.state = s;
  return api;
}

function fakeThreads(over = {}) {
  const s = { calls: [], containers: new Map(), statusScript: [], recent: [], posted: [], failures: {}, seq: 0 };
  const maybeFail = (name) => { const f = s.failures[name]?.shift(); if (f) throw f; };
  const api = {
    isConfigured: () => true,
    createContainer: jest.fn(async (userId, token, p) => {
      s.calls.push(['createContainer', p]); maybeFail('createContainer');
      s.seq += 1;
      const id = `THC${s.seq}`;
      s.containers.set(id, { published: false, params: p });
      return { id };
    }),
    getContainer: jest.fn(async (id) => {
      maybeFail('getContainer');
      const c = s.containers.get(id);
      if (c?.published) return { status: 'PUBLISHED', errorMessage: '' };
      const status = s.statusScript.shift() || 'FINISHED';
      return { status, errorMessage: status === 'ERROR' ? 'Unsupported video' : '' };
    }),
    publishContainer: jest.fn(async (userId, token, containerId) => {
      s.calls.push(['publishContainer', containerId]); maybeFail('publishContainer');
      const c = s.containers.get(containerId);
      if (c?.published) throw new PublishError('CONTENT_REJECTED', 'already published', { httpStatus: 400 });
      if (c) c.published = true;
      s.seq += 1;
      const id = `THM${s.seq}`;
      s.posted.push({ platform: 'threads', id });
      s.recent.unshift({ id, permalink: `https://www.threads.com/@x/post/${id}`, timestamp: new Date().toISOString(), text: c?.params?.text || '' });
      return { id };
    }),
    getMedia: jest.fn(async (id) => ({ id, permalink: `https://www.threads.com/@x/post/${id}`, mediaType: 'TEXT_POST', timestamp: null, text: '' })),
    listRecentThreads: jest.fn(async () => s.recent),
    getPublishingLimit: jest.fn(async () => ({ used: 1, total: 250 })),
    getInsightMetric: jest.fn(async () => ({ available: true, value: 5 })),
    ...over,
  };
  api.state = s;
  return api;
}

const storageFake = (objects = {}) => {
  const map = new Map(Object.entries(objects));
  return {
    objects: map,
    statObject: jest.fn(async (bucket, key) => map.get(`${bucket}/${key}`) || null),
    getObjectRange: jest.fn(async (_b, _k, offset, length) => bytes(length)),
    deleteObject: jest.fn(async () => {}),
    putObjectFile: jest.fn(async (bucket, key) => ({ bucket, key, size: 1234 })),
    parsePublicUrl: jest.fn((url) => {
      const [bucket, ...rest] = new URL(url).pathname.replace(/^\//, '').split('/');
      return { bucket, key: rest.join('/') };
    }),
  };
};

module.exports = { fakeMeta, fakeThreads, storageFake, bytes };
