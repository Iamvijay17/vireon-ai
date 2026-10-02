// The root package-lock.json is generated on Windows, so it omits the Linux
// native binaries of optional platform packages (npm bug #4828: rolldown,
// lightningcss, @tailwindcss/oxide, ...). `npm ci` on Linux then succeeds but
// `vite build` dies with "Cannot find native binding".
//
// This adds ONLY those missing linux-x64-gnu packages, at the exact version
// the lockfile resolves for their parent, by downloading each tarball and
// unpacking it into node_modules. It deliberately does NOT run
// `npm install`: that re-resolves the whole tree, which ignores the lockfile
// and silently upgrades `^` dependencies (it once bumped
// @remotion/google-fonts to 4.0.532 next to a pinned remotion 4.0.489 and
// broke the Studio preview with "fetchFontData is not a function").
//
// After unpacking, every installed package is compared with the lockfile and
// the script exits non-zero on any drift.
// Run after `npm ci`, from the repo root. No-op on non-Linux.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));

function installMissingNatives() {
  const want = new Map();
  for (const pkg of Object.values(lock.packages || {})) {
    for (const [dep, range] of Object.entries(pkg.optionalDependencies || {})) {
      if (!/linux-x64-gnu$/.test(dep) && !/^@esbuild\/linux-x64$/.test(dep)) continue;
      // native packages are versioned in lockstep with their parent
      if (!want.has(dep)) want.set(dep, /^\d/.test(range) ? range : pkg.version);
    }
  }
  const missing = [...want].filter(([name]) => !fs.existsSync(path.join('node_modules', name, 'package.json')));
  if (!missing.length) return console.log('linux natives: nothing missing');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'natives-'));
  for (const [name, version] of missing) {
    const spec = `${name}@${version}`;
    console.log('linux natives: adding', spec);
    const out = execFileSync('npm', ['pack', spec, '--silent', '--pack-destination', tmp], { encoding: 'utf8' });
    const tarball = path.join(tmp, out.trim().split('\n').pop());
    const dest = path.join('node_modules', name);
    fs.mkdirSync(dest, { recursive: true });
    execFileSync('tar', ['-xzf', tarball, '-C', dest, '--strip-components=1']);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

function assertMatchesLockfile() {
  const drift = [];
  for (const [key, meta] of Object.entries(lock.packages || {})) {
    if (!key.startsWith('node_modules/') || !meta.version || meta.link) continue;
    const file = path.join(key, 'package.json');
    if (!fs.existsSync(file)) continue; // optional / other-platform packages
    const installed = JSON.parse(fs.readFileSync(file, 'utf8')).version;
    if (installed !== meta.version) drift.push(`${key}: lockfile ${meta.version}, installed ${installed}`);
  }
  if (drift.length) {
    console.error(`linux natives: ${drift.length} package(s) differ from the lockfile:\n  ` + drift.slice(0, 20).join('\n  '));
    process.exit(1);
  }
  console.log('linux natives: installed packages match package-lock.json');
}

if (process.platform === 'linux' && process.arch === 'x64') {
  installMissingNatives();
  assertMatchesLockfile();
}
