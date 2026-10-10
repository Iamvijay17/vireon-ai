const { SOCIAL_PLATFORM } = require('../../../constants');
const FacebookProvider = require('./FacebookProvider');
const InstagramProvider = require('./InstagramProvider');
const ThreadsProvider = require('./ThreadsProvider');

const PROVIDERS = Object.freeze({
  [SOCIAL_PLATFORM.FACEBOOK]: FacebookProvider,
  [SOCIAL_PLATFORM.INSTAGRAM]: InstagramProvider,
  [SOCIAL_PLATFORM.THREADS]: ThreadsProvider,
});

function providerFor(platform) {
  const provider = PROVIDERS[platform];
  if (!provider) throw new Error(`No provider for platform: ${platform}`);
  return provider;
}

module.exports = { providerFor, PROVIDERS };
