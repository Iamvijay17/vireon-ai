const { SOCIAL_PLATFORM } = require('../../constants');

/**
 * Everything platform-specific that is a fixed fact rather than configuration.
 * Each value notes where it comes from, so a future change in Meta's rules is
 * a one-line edit here and an obvious one to review:
 *
 *   [docs]  stated in Meta's official developer documentation (checked 2026-10)
 *   [help]  Meta's public help-center / widely documented product limit
 *
 * Nothing here is a secret.
 */

// Scopes requested by the Facebook Login flow that connects Pages + their linked Instagram accounts.
//  pages_show_list / pages_read_engagement / pages_manage_posts  [docs] Page publishing + reels
//  instagram_basic / instagram_content_publish                   [docs] Instagram API with Facebook Login
//  instagram_manage_insights / read_insights                     [docs] Instagram + Page insights
// Without App Review these only work for people with a role on the Meta app (development mode).
const META_SCOPES = Object.freeze([
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'read_insights',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_insights',
]);

// What publishing to each platform can not work without; a connect that comes back missing one is refused.
const META_REQUIRED_SCOPES = Object.freeze(['pages_show_list', 'pages_manage_posts']);
const META_INSTAGRAM_REQUIRED_SCOPES = Object.freeze(['instagram_basic', 'instagram_content_publish']);

// [docs] threads_basic is required for every call; threads_content_publish to post; threads_manage_insights for insights.
const THREADS_SCOPES = Object.freeze(['threads_basic', 'threads_content_publish', 'threads_manage_insights']);
const THREADS_REQUIRED_SCOPES = Object.freeze(['threads_basic', 'threads_content_publish']);

const ENDPOINTS = Object.freeze({
  // Facebook Login dialog is versioned: https://www.facebook.com/<version>/dialog/oauth [docs]
  metaDialog: (version) => `https://www.facebook.com/${version}/dialog/oauth`,
  metaGraph: (version) => `https://graph.facebook.com/${version}`,
  // Resumable video uploads for Reels / Instagram [docs]
  metaRupload: 'https://rupload.facebook.com',
  // [docs] authorize on threads.com, API on graph.threads.net, token exchange on graph.threads.com
  threadsAuthorize: 'https://threads.com/oauth/authorize',
  threadsToken: 'https://graph.threads.com/oauth/access_token',
  threadsGraph: 'https://graph.threads.net/v1.0',
  threadsGraphRoot: 'https://graph.threads.net',
});

// Per-platform content rules (see contentRules.js for how they are applied).
const LIMITS = Object.freeze({
  [SOCIAL_PLATFORM.THREADS]: {
    maxText: 500, // [docs] 500 characters, emoji counted in UTF-8 bytes by Meta (we count code points - the safe direction is warned about)
    maxLinks: 5, // [docs] up to 5 unique links per post
    maxVideoSec: 300, // [docs]
    maxVideoBytes: 1024 ** 3, // [docs] 1 GB
    maxVideoWidth: 1920, // [docs]
    maxImageBytes: 8 * 1024 * 1024, // [docs] 8 MB
    imageTypes: ['image/jpeg', 'image/png'], // [docs]
    minAspect: 0.1, // [docs] aspect ratio between 0.01:1 and 10:1 (we use the tighter 10:1 image bound)
    maxAspect: 10,
  },
  [SOCIAL_PLATFORM.INSTAGRAM]: {
    maxCaption: 2200, // [help]
    maxHashtags: 30, // [help]
    imageTypes: ['image/jpeg'], // [docs] JPEG is the only supported image format
    reelMinSec: 3, // [help]
    reelMaxSec: 900, // [help] 15 minutes
    maxVideoBytes: 1024 ** 3,
    maxImageBytes: 8 * 1024 * 1024, // [help]
    recommendedAspect: [9, 16], // [docs/help] Reels are 9:16; others are cropped
  },
  [SOCIAL_PLATFORM.FACEBOOK]: {
    maxMessage: 63206, // [help] Page post text ceiling; we recommend far less (see contentRules)
    reelMinSec: 3, // [docs]
    reelMaxSec: 90, // [docs] 3-90 seconds
    reelAspect: [9, 16], // [docs]
    reelMinWidth: 540, // [docs] 540x960 minimum
    reelMinHeight: 960,
    maxVideoBytes: 1024 ** 3,
    maxImageBytes: 8 * 1024 * 1024,
    imageTypes: ['image/jpeg', 'image/png'],
  },
});

// Publishing quotas, rolling 24h [docs]. Config.social.dailyLimits can lower them, never raise past reality.
const PLATFORM_DAILY_LIMITS = Object.freeze({
  [SOCIAL_PLATFORM.INSTAGRAM]: 100, // content_publishing_limit; carousels count once
  [SOCIAL_PLATFORM.THREADS]: 250,
  [SOCIAL_PLATFORM.FACEBOOK]: 30, // Reels API-published posts
});

const PLATFORM_LABEL = Object.freeze({
  [SOCIAL_PLATFORM.FACEBOOK]: 'Facebook',
  [SOCIAL_PLATFORM.INSTAGRAM]: 'Instagram',
  [SOCIAL_PLATFORM.THREADS]: 'Threads',
});

// Where the SPA may be sent after an OAuth callback. An allow-list so neither the stored state nor
// the callback can be steered to another origin or an unexpected route.
const RETURN_PATHS = new Set(['/promotion', '/promotion/accounts', '/promotion/create', '/promotion/posts']);

module.exports = {
  META_SCOPES,
  META_REQUIRED_SCOPES,
  META_INSTAGRAM_REQUIRED_SCOPES,
  THREADS_SCOPES,
  THREADS_REQUIRED_SCOPES,
  ENDPOINTS,
  LIMITS,
  PLATFORM_DAILY_LIMITS,
  PLATFORM_LABEL,
  RETURN_PATHS,
};
