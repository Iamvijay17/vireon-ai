const dns = require('dns').promises;
const net = require('net');
const withTimeout = require('./withTimeout');

/**
 * Guards the image URLs a scene carries into the Remotion render.
 *
 * `scene.imageUrl` / `elements.image` / `elements.hostImage` can be pasted by
 * hand in the Studio, and the headless Chromium that renders the video
 * fetches them from the render host's own network. Left unchecked, a scene
 * pointing at http://169.254.169.254/... or an internal admin port makes the
 * render machine request it (SSRF), and the response ends up in a frame.
 *
 * Public hostnames stay allowed - pasting a normal https image link is the
 * supported workflow. What is refused: non-http(s) schemes, and any host
 * that is (or resolves to) a loopback / private / link-local / reserved
 * address, unless it is one of the deliberately allowed hosts (MinIO's own
 * public URL, plus IMAGE_URL_ALLOWED_HOSTS).
 *
 * Known limit: the name is resolved here and again by Chromium later, so a
 * DNS-rebinding host could answer differently the second time. Closing that
 * needs the render to fetch through a pinned-IP proxy; this check stops the
 * direct cases.
 */

const LOOKUP_TIMEOUT_MS = 5000;

const ipv4ToInt = (ip) => ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;

// [network, prefix length] - everything here is not a public internet host.
const BLOCKED_V4 = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, incl. cloud metadata 169.254.169.254
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
].map(([net_, bits]) => ({ base: ipv4ToInt(net_), mask: bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0 }));

function isBlockedV4(ip) {
  const n = ipv4ToInt(ip);
  return BLOCKED_V4.some(({ base, mask }) => ((n & mask) >>> 0) === ((base & mask) >>> 0));
}

function isBlockedV6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  // IPv4-mapped (::ffff:a.b.c.d) - judge by the embedded v4 address.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedV4(mapped[1]);
  const first = parseInt(lower.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

function isBlockedAddress(ip) {
  const family = net.isIP(ip);
  if (family === 4) return isBlockedV4(ip);
  if (family === 6) return isBlockedV6(ip);
  return true; // not an IP at all - never treat as safe
}

/**
 * Checks one image reference. Returns null when it is fine, otherwise a short
 * human-readable reason. `lookup` is injectable for tests.
 *
 * - '' / missing: fine (no image).
 * - Relative paths (/x.png): fine - they resolve against the render's own
 *   bundle server and cannot name another host. Protocol-relative (//host/x)
 *   is NOT relative and is checked like an absolute URL.
 */
async function checkImageUrl(raw, { allowedHosts = [], lookup = dns.lookup } = {}) {
  const value = String(raw || '').trim();
  if (!value) return null;

  const isRelative = !/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith('//');
  if (isRelative) return null;

  let url;
  try {
    url = new URL(value.startsWith('//') ? `https:${value}` : value);
  } catch {
    return 'is not a valid URL';
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return `uses the "${url.protocol.replace(':', '')}" scheme - only http(s) image URLs are allowed`;
  }
  if (url.username || url.password) return 'must not contain credentials';

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const allowed = new Set(allowedHosts.map((h) => String(h).trim().toLowerCase()).filter(Boolean));
  if (allowed.has(hostname) || allowed.has(url.host.toLowerCase())) return null;

  if (net.isIP(hostname)) {
    return isBlockedAddress(hostname) ? `points at a private or internal address (${hostname})` : null;
  }

  let addresses;
  try {
    addresses = await withTimeout(lookup(hostname, { all: true }), LOOKUP_TIMEOUT_MS, 'DNS lookup timed out');
  } catch (err) {
    return `host "${hostname}" could not be resolved (${err.code || err.message})`;
  }
  const blocked = addresses.find(({ address }) => isBlockedAddress(address));
  return blocked ? `host "${hostname}" resolves to a private or internal address (${blocked.address})` : null;
}

/** Allowed-host list from MinIO's public URL plus the optional env list. */
function buildAllowedHosts(config) {
  const hosts = [...(config.security?.imageAllowedHosts || [])];
  try {
    const minio = new URL(config.minio.publicUrl);
    hosts.push(minio.hostname, minio.host);
  } catch {
    // validate.js already rejects a malformed MINIO_PUBLIC_URL at boot
  }
  return hosts;
}

module.exports = { checkImageUrl, buildAllowedHosts, isBlockedAddress };
