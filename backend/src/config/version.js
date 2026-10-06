// Build stamp for this API. CI passes APP_VERSION / APP_COMMIT / APP_BUILD_DATE
// as Docker build args (.github/workflows/deploy.yml -> Dockerfile -> env), the
// same values the frontend is stamped with. Native/dev runs have no stamp, so
// they report "<package.json version>-dev" and read the commit from the git
// checkout they run in (the native prod workers run from the prod clone, so
// this is what tells an up-to-date worker from a stale one).
const fs = require('fs');
const path = require('path');
const pkg = require('../../package.json');

const REPO_ROOT = path.resolve(__dirname, '../../..');

// Reads .git directly rather than shelling out to git, which may not be on the
// PATH of a scheduled task. Returns '' when there is no checkout (Docker image).
function commitFromCheckout(root = REPO_ROOT) {
  try {
    const gitDir = path.join(root, '.git');
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref:')) return head; // detached HEAD (deploy.ps1 checks out a sha)
    const ref = head.slice(4).trim();
    const loose = path.join(gitDir, ref);
    if (fs.existsSync(loose)) return fs.readFileSync(loose, 'utf8').trim();
    const packed = fs.readFileSync(path.join(gitDir, 'packed-refs'), 'utf8');
    const line = packed.split('\n').find((l) => l.endsWith(` ${ref}`));
    return line ? line.split(' ')[0] : '';
  } catch {
    return '';
  }
}

module.exports = {
  version: process.env.APP_VERSION || `${pkg.version}-dev`,
  commit: (process.env.APP_COMMIT || commitFromCheckout()).slice(0, 7),
  buildDate: process.env.APP_BUILD_DATE || '',
  commitFromCheckout,
};
