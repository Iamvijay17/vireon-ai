// Build stamp for this API. CI passes APP_VERSION / APP_COMMIT / APP_BUILD_DATE
// as Docker build args (.github/workflows/deploy.yml -> Dockerfile -> env), the
// same values the frontend is stamped with. Native/dev runs have no stamp, so
// they report "<package.json version>-dev".
const pkg = require('../../package.json');

module.exports = {
  version: process.env.APP_VERSION || `${pkg.version}-dev`,
  commit: (process.env.APP_COMMIT || '').slice(0, 7),
  buildDate: process.env.APP_BUILD_DATE || '',
};
