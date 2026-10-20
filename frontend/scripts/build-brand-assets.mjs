/*
 * Regenerates every static brand asset from src/components/Logo/geometry.js:
 *   public/brand/*.svg       logos, symbols, app icon
 *   public/favicon.svg|.ico  browser tab icons
 *   public/apple-touch-icon.png, icon-192.png, icon-512.png, icon-maskable-512.png
 *
 * No dependencies: PNGs come from a small supersampling polygon rasterizer.
 * Run from frontend/:  node scripts/build-brand-assets.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { BRAND, LEFT_BLADE, MARK_PATHS, MARK_SIZE, RIGHT_BLADE, TONES, WORDMARK, lockupLayout, sparkPolygon } from "../src/components/Logo/geometry.js";

const pub = (p) => fileURLToPath(new URL(`../public/${p}`, import.meta.url));
mkdirSync(pub("brand"), { recursive: true });

// ------------------------------------------------------------------ SVG

const markSvg = (c) =>
  `<path d="${MARK_PATHS.left}" fill="${c.left}"/><path d="${MARK_PATHS.right}" fill="${c.right}"/><path d="${MARK_PATHS.spark}" fill="${c.spark}"/>`;

const wordmarkSvg = (c) =>
  WORDMARK.pieces
    .map((p) => {
      const t = p.transform ? ` transform="${p.transform}"` : "";
      return p.kind === "stroke"
        ? `<path d="${p.d}"${t} fill="none" stroke="${c[p.role]}" stroke-width="${p.width}"/>`
        : `<path d="${p.d}"${t} fill="${c[p.role]}"${p.fillRule ? ` fill-rule="${p.fillRule}"` : ""}/>`;
    })
    .join("");

const svg = (viewBox, body, label, size = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${size} role="img" aria-label="${label}">${body}</svg>\n`;

const monoOf = (color) => Object.fromEntries(Object.keys(TONES.mono).map((k) => [k, color]));

function lockupSvg(name, colors) {
  const { scale, x, y, viewBox } = lockupLayout(name);
  const vb = viewBox.map((n) => +n.toFixed(2)).join(" ");
  const body = `${markSvg(colors)}<g transform="translate(${+x.toFixed(2)} ${+y.toFixed(2)}) scale(${scale})">${wordmarkSvg(colors)}</g>`;
  return svg(vb, body, "Vireon AI");
}

// A tile: rounded square (or full bleed) with the mark scaled about its centre.
function tileSvg(scale, radius, label) {
  const k = 32 * (1 - scale);
  const body =
    `<rect width="64" height="64"${radius ? ` rx="${radius}"` : ""} fill="${BRAND.ink}"/>` +
    `<g transform="translate(${+k.toFixed(2)} ${+k.toFixed(2)}) scale(${scale})">${markSvg(TONES.dark)}</g>`;
  return svg("0 0 64 64", body, label);
}

const files = {
  "brand/vireon-logo.svg": lockupSvg("primary", TONES.dark),
  "brand/vireon-logo-light.svg": lockupSvg("primary", TONES.light),
  "brand/vireon-logo-mono.svg": lockupSvg("primary", monoOf(BRAND.ink)),
  "brand/vireon-logo-mono-white.svg": lockupSvg("primary", monoOf(BRAND.paper)),
  "brand/vireon-logo-sidebar.svg": lockupSvg("compact", TONES.dark),
  "brand/vireon-symbol.svg": svg("0 0 64 64", markSvg(TONES.dark), "Vireon AI"),
  "brand/vireon-symbol-light.svg": svg("0 0 64 64", markSvg(TONES.light), "Vireon AI"),
  "brand/vireon-app-icon.svg": tileSvg(0.72, 14, "Vireon AI"),
  "favicon.svg": tileSvg(0.86, 14, "Vireon AI"),
};
for (const [path, text] of Object.entries(files)) writeFileSync(pub(path), text);

// ------------------------------------------------------------- rasterizer

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function inPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Render the mark on a tile to RGBA. `scale`: mark size inside the tile;
 * `radius`: corner radius as a fraction of the tile (0 = full bleed square).
 */
function rasterTile(size, scale, radius) {
  const ss = size <= 48 ? 8 : 4;
  const px = (MARK_SIZE / size) / ss; // grid units per subsample
  const layers = [
    [LEFT_BLADE, hex(TONES.dark.left)],
    [RIGHT_BLADE, hex(TONES.dark.right)],
    [sparkPolygon(), hex(TONES.dark.spark)],
  ].map(([pts, rgb]) => [pts.map(([x, y]) => [32 + (x - 32) * scale, 32 + (y - 32) * scale]), rgb]);
  const bg = hex(BRAND.ink);
  const r = radius * MARK_SIZE;
  const inTile = (x, y) => {
    if (!r) return true;
    const dx = Math.max(r - x, x - (MARK_SIZE - r), 0);
    const dy = Math.max(r - y, y - (MARK_SIZE - r), 0);
    return dx * dx + dy * dy <= r * r;
  };
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let pxl = 0; pxl < size; pxl++) {
      let a = 0, R = 0, G = 0, B = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = (pxl * ss + sx + 0.5) * px;
          const y = (py * ss + sy + 0.5) * px;
          if (!inTile(x, y)) continue;
          let rgb = bg;
          for (const [poly, c] of layers) if (inPoly(poly, x, y)) rgb = c;
          a++; R += rgb[0]; G += rgb[1]; B += rgb[2];
        }
      }
      const o = (py * size + pxl) * 4;
      if (a) { out[o] = Math.round(R / a); out[o + 1] = Math.round(G / a); out[o + 2] = Math.round(B / a); }
      out[o + 3] = Math.round((a / (ss * ss)) * 255);
    }
  }
  return out;
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function png(size, rgba) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function ico(sizes) {
  const imgs = sizes.map((s) => png(s, rasterTile(s, 0.86, 14 / 64)));
  const head = Buffer.alloc(6 + 16 * imgs.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
  let offset = head.length;
  imgs.forEach((img, i) => {
    const e = 6 + 16 * i;
    head[e] = sizes[i]; head[e + 1] = sizes[i]; head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(img.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += img.length;
  });
  return Buffer.concat([head, ...imgs]);
}

const raster = {
  "apple-touch-icon.png": png(180, rasterTile(180, 0.7, 0)), // iOS applies its own corner mask
  "icon-192.png": png(192, rasterTile(192, 0.72, 14 / 64)),
  "icon-512.png": png(512, rasterTile(512, 0.72, 14 / 64)),
  "icon-maskable-512.png": png(512, rasterTile(512, 0.56, 0)), // mark inside the 80% safe zone
  "favicon.ico": ico([16, 32, 48]),
};
for (const [path, data] of Object.entries(raster)) writeFileSync(pub(path), data);

console.log(`wrote ${Object.keys(files).length} svg + ${Object.keys(raster).length} raster files`);
