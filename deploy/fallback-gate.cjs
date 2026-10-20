#!/usr/bin/env node
/*
 * Vireon fallback gate: a tiny always-on reverse proxy that sits between
 * Tailscale Serve and the frontend container, so that when the container (or
 * Docker) is down people get Vireon's own "offline" page instead of Tailscale's
 * bare "502 Bad Gateway".
 *
 *   phone / laptop -> Tailscale Serve :443 -> THIS GATE 127.0.0.1:8081 -> nginx 127.0.0.1:8080
 *
 * It forwards everything untouched (HTTP, range requests for video, WebSocket
 * upgrades for socket.io) and only steps in when it cannot reach nginx at all.
 * Then browsers navigating to a page get frontend/public/offline.html (HTTP 503;
 * that page polls the URL it replaced and reloads itself when the app is back)
 * and API/fetch callers get a small JSON 503.
 *
 * Zero dependencies - plain Node, so it keeps running when the repo's
 * node_modules or Docker are not available. Settings (all optional, env):
 *   GATE_HOST (127.0.0.1)  GATE_PORT (8081)
 *   GATE_UPSTREAM_HOST (127.0.0.1)  GATE_UPSTREAM_PORT (8080)
 *   GATE_PAGE  path of the offline page (default frontend/public/offline.html)
 * Switch Tailscale over (and back) as described in DEPLOYMENT.md.
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const LISTEN_HOST = process.env.GATE_HOST || '127.0.0.1';
const LISTEN_PORT = Number(process.env.GATE_PORT || 8081);
const UPSTREAM_HOST = process.env.GATE_UPSTREAM_HOST || '127.0.0.1';
const UPSTREAM_PORT = Number(process.env.GATE_UPSTREAM_PORT || 8080);
const PAGE_PATH = process.env.GATE_PAGE || path.join(__dirname, '..', 'frontend', 'public', 'offline.html');

const FALLBACK_PAGE =
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Vireon AI - offline</title>' +
  '<body style="font:16px system-ui;background:#0a0a0e;color:#ececf1;display:grid;place-items:center;height:100vh;margin:0;text-align:center">' +
  '<div><h1>Can’t reach Vireon</h1><p>The server isn’t responding. Retrying…</p></div>' +
  '<script>setTimeout(function(){location.reload()},5000)</script>';

const DOWN_JSON = JSON.stringify({
  error: 'Service unavailable',
  message: 'The Vireon server is not responding. It may be restarting - try again in a moment.',
});

const log = (message) => console.log(`${new Date().toISOString()} [gate] ${message}`);

// Log only transitions, not every failed request while it is down.
let upstreamUp = null;
const noteUpstream = (up, detail) => {
  if (upstreamUp === up) return;
  upstreamUp = up;
  log(up ? `upstream ${UPSTREAM_HOST}:${UPSTREAM_PORT} is answering` : `upstream ${UPSTREAM_HOST}:${UPSTREAM_PORT} is NOT answering (${detail})`);
};

const loadPage = () => {
  try {
    return fs.readFileSync(PAGE_PATH, 'utf8');
  } catch {
    return FALLBACK_PAGE;
  }
};

const wantsHtml = (req) => (req.method === 'GET' || req.method === 'HEAD') && /text\/html/i.test(req.headers.accept || '');

function sendDown(req, res) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const html = wantsHtml(req);
  const body = html ? loadPage() : DOWN_JSON;
  res.writeHead(503, {
    'Content-Type': html ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Retry-After': '5',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

const server = http.createServer((req, res) => {
  // Lets a monitor tell "gate alive" from "app alive" (the app is /health via nginx).
  if (req.url === '/__gate/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    res.end('ok');
    return;
  }

  // agent:false = one connection per request. Loopback makes that cheap, and it
  // means a restarted nginx can never leave us holding a dead pooled socket.
  const proxyReq = http.request({
    host: UPSTREAM_HOST,
    port: UPSTREAM_PORT,
    method: req.method,
    path: req.url,
    headers: req.headers,
    agent: false,
  });

  proxyReq.on('response', (proxyRes) => {
    noteUpstream(true);
    res.writeHead(proxyRes.statusCode, proxyRes.statusMessage, proxyRes.headers);
    proxyRes.pipe(res);
    proxyRes.on('error', () => res.destroy());
  });
  proxyReq.on('error', (error) => {
    noteUpstream(false, error.code || error.message);
    sendDown(req, res);
  });

  // Browser closed the tab / stopped a video: stop pulling bytes from nginx.
  res.on('close', () => {
    if (!res.writableFinished) proxyReq.destroy();
  });
  req.on('error', () => proxyReq.destroy());
  req.pipe(proxyReq);
});

// WebSocket (socket.io) and any other protocol upgrade: relay the handshake, then the raw bytes.
server.on('upgrade', (req, socket, head) => {
  socket.on('error', () => socket.destroy());
  const proxyReq = http.request({
    host: UPSTREAM_HOST,
    port: UPSTREAM_PORT,
    method: req.method,
    path: req.url,
    headers: req.headers,
    agent: false,
  });

  const rawHead = (proxyRes) => {
    let out = `HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`;
    for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) out += `${proxyRes.rawHeaders[i]}: ${proxyRes.rawHeaders[i + 1]}\r\n`;
    return `${out}\r\n`;
  };

  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    noteUpstream(true);
    proxySocket.on('error', () => socket.destroy());
    socket.on('close', () => proxySocket.destroy());
    proxySocket.on('close', () => socket.destroy());
    socket.write(rawHead(proxyRes));
    if (proxyHead && proxyHead.length) socket.write(proxyHead);
    if (head && head.length) proxySocket.write(head);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });
  // Upstream answered the upgrade with a plain response (e.g. refused): pass it on and close.
  proxyReq.on('response', (proxyRes) => {
    socket.write(rawHead(proxyRes));
    proxyRes.pipe(socket);
  });
  proxyReq.on('error', (error) => {
    noteUpstream(false, error.code || error.message);
    socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nRetry-After: 5\r\nContent-Length: 0\r\n\r\n');
  });
  proxyReq.end();
});

server.on('clientError', (_error, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});

// A gate that dies is worse than no gate: log and keep serving.
process.on('uncaughtException', (error) => log(`uncaught: ${error.stack || error}`));
process.on('unhandledRejection', (error) => log(`unhandled rejection: ${error}`));

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  log(`listening on http://${LISTEN_HOST}:${LISTEN_PORT} -> http://${UPSTREAM_HOST}:${UPSTREAM_PORT}`);
});
