/**
 * YouTube / Google endpoints and limits, per the official docs:
 *  - videos.insert        https://developers.google.com/youtube/v3/docs/videos/insert
 *  - resumable uploads    https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
 *  - OAuth 2.0 (web app)  https://developers.google.com/identity/protocols/oauth2/web-server
 */

const ENDPOINTS = Object.freeze({
  authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  revoke: 'https://oauth2.googleapis.com/revoke',
  channels: 'https://www.googleapis.com/youtube/v3/channels',
  videos: 'https://www.googleapis.com/youtube/v3/videos',
  upload: 'https://www.googleapis.com/upload/youtube/v3/videos',
});

// Least privilege for what the module actually does:
//  - youtube.upload   videos.insert (the upload itself)
//  - youtube.readonly channels.list (show WHICH channel is connected, so a
//                     video is never published to the wrong one) and
//                     videos.list (confirm YouTube finished processing).
// No write access beyond uploading, no access to comments, playlists, etc.
const SCOPES = Object.freeze({
  upload: 'https://www.googleapis.com/auth/youtube.upload',
  readonly: 'https://www.googleapis.com/auth/youtube.readonly',
});
const REQUIRED_SCOPES = Object.freeze([SCOPES.upload, SCOPES.readonly]);

// Assignable video categories (YouTube's category ids are global for these).
const CATEGORIES = Object.freeze([
  { id: '27', title: 'Education' },
  { id: '28', title: 'Science & Technology' },
  { id: '26', title: 'Howto & Style' },
  { id: '22', title: 'People & Blogs' },
  { id: '24', title: 'Entertainment' },
  { id: '25', title: 'News & Politics' },
  { id: '19', title: 'Travel & Events' },
  { id: '20', title: 'Gaming' },
  { id: '10', title: 'Music' },
  { id: '23', title: 'Comedy' },
  { id: '17', title: 'Sports' },
  { id: '15', title: 'Pets & Animals' },
  { id: '2', title: 'Autos & Vehicles' },
  { id: '1', title: 'Film & Animation' },
  { id: '29', title: 'Nonprofits & Activism' },
]);

const LIMITS = Object.freeze({
  titleChars: 100,
  descriptionBytes: 5000,
  tagsChars: 500,
  tagChars: 100,
  chunkMultiple: 256 * 1024,
  // A scheduled publish time must be comfortably in the future.
  minPublishLeadMs: 5 * 60_000,
});

const watchUrl = (videoId) => `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
const studioUrl = (videoId) => `https://studio.youtube.com/video/${encodeURIComponent(videoId)}/edit`;

module.exports = { ENDPOINTS, SCOPES, REQUIRED_SCOPES, CATEGORIES, LIMITS, watchUrl, studioUrl };
