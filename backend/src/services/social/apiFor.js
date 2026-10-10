const { SOCIAL_PLATFORM } = require('../../constants');

/**
 * Which platform client talks for an account: Threads has its own API, an Instagram account connected with
 * Instagram Login (`meta.login === 'instagram'`) uses graph.instagram.com, everything else (Facebook Pages and
 * Instagram accounts reached through a Page) goes through the Meta Graph API.
 */
function apiForAccount(apis, account) {
  if (account.platform === SOCIAL_PLATFORM.THREADS) return apis.threads;
  if (account.platform === SOCIAL_PLATFORM.INSTAGRAM && account.meta?.login === 'instagram') return apis.instagram;
  return apis.meta;
}

module.exports = { apiForAccount };
