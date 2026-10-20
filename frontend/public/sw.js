/*
 * Vireon offline shim. Its one job: when loading a page of this app fails
 * (dev server stopped, frontend container down, Tailscale answering 502),
 * show /offline.html instead of the browser's "This site can't be reached".
 *
 * It deliberately caches NOTHING but that one page and never touches scripts,
 * styles, API calls, media or websockets - a caching service worker is how
 * stale builds get stuck, and the app already has its own update banner.
 *
 * Only works after the app has been opened once on this origin (a worker
 * can't exist before its first visit) and only on https or localhost.
 * Bump VERSION when offline.html changes so every browser refetches it.
 */
const VERSION = "v4";
const CACHE = `vireon-offline-${VERSION}`;
const OFFLINE_URL = "/offline.html";

// Paths that are never an app page: an OAuth redirect or API URL opened in the
// tab must reach the server untouched.
const PASS_THROUGH = /^\/(api|media|socket\.io|voice-samples|health|ready|api-docs)(\/|\.|$)/;
// Gateway failures: the proxy in front is up but the app behind it is not.
const GATEWAY_DOWN = new Set([502, 503, 504]);

const FALLBACK_HTML =
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  "<title>Vireon AI - offline</title>" +
  '<body style="font:16px system-ui;background:#0a0a0e;color:#ececf1;display:grid;place-items:center;height:100vh;margin:0;text-align:center">' +
  "<div><h1>Can’t reach Vireon</h1><p>The server isn’t responding.</p>" +
  '<button onclick="location.reload()" style="padding:8px 16px">Retry</button></div>';

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // `reload` skips the HTTP cache so a fresh deploy never precaches an old copy.
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("vireon-offline-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function offlineResponse() {
  let body = FALLBACK_HTML;
  try {
    const cached = await caches.match(OFFLINE_URL);
    if (cached) body = await cached.text();
  } catch {
    /* cache unavailable: use the inline fallback */
  }
  // 503, not 200: offline.html polls the real URL and treats any 2xx as "server is back".
  return new Response(body, {
    status: 503,
    statusText: "Service Unavailable",
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "5" },
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.mode !== "navigate" || request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || PASS_THROUGH.test(url.pathname) || url.pathname === OFFLINE_URL) return;

  event.respondWith(
    fetch(request).then(
      (response) => (GATEWAY_DOWN.has(response.status) ? offlineResponse() : response),
      () => offlineResponse(),
    ),
  );
});
