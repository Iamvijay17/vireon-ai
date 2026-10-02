// The root package-lock.json is generated on Windows, so it omits the Linux
// native binaries of optional platform packages (npm bug #4828: rolldown,
// lightningcss, @tailwindcss/oxide, ...). `npm ci` on Linux then succeeds but
// `vite build` dies with "Cannot find native binding". This installs just
// those missing linux-x64-gnu packages, pinned to the versions the lockfile
// already resolves for their parents - nothing else is upgraded.
// Run after `npm ci`, from the repo root. No-op on non-Linux.
const fs = require('fs');
const { execFileSync } = require('child_process');
if (process.platform !== 'linux' || process.arch !== 'x64') process.exit(0);

const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const want = new Map();
for (const [path, pkg] of Object.entries(lock.packages || {})) {
  for (const [dep, range] of Object.entries(pkg.optionalDependencies || {})) {
    if (!/linux-x64-gnu$/.test(dep) && !/^@esbuild\/linux-x64$/.test(dep)) continue;
    const exact = pkg.version; // native pkgs are versioned in lockstep with their parent
    if (!want.has(dep)) want.set(dep, /^\d/.test(range) ? range : exact);
  }
}
const missing = [...want].filter(([n]) => !fs.existsSync(`node_modules/${n}`));
if (!missing.length) { console.log('linux natives: nothing missing'); process.exit(0); }
const specs = missing.map(([n, v]) => `${n}@${v}`);
console.log('linux natives: installing', specs.join(' '));
execFileSync('npm', ['install', '--no-save', '--no-package-lock', '--no-audit', '--no-fund', '--ignore-scripts', ...specs],
  { stdio: 'inherit', shell: process.platform === 'win32' });
