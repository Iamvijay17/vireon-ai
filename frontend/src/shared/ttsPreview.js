// Pure helpers behind the Voice Studio controls, kept out of the components
// so the request shape and the pronunciation syntax are unit-testable.

/** Neutral starting point - everything "Auto" so the server's Voice Director decides. */
export const DEFAULT_DIRECTION = Object.freeze({
  style: "",
  emotion: "",
  speed: 1,
  pitch: 0,
  pronunciations: "",
});

/**
 * Parses the pronunciation box: one "word = how to say it" per line.
 * Blank lines and lines without "=" are ignored; later lines win.
 */
export const parsePronunciations = (text) => {
  const out = {};
  for (const line of String(text || "").split("\n")) {
    const at = line.indexOf("=");
    if (at < 1) continue;
    const word = line.slice(0, at).trim();
    const spoken = line.slice(at + 1).trim();
    if (word && spoken) out[word] = spoken;
  }
  return out;
};

/** True when the user has changed anything from the automatic defaults. */
export const isDirectionCustomised = (direction) =>
  Boolean(direction.style) ||
  Boolean(direction.emotion) ||
  Number(direction.speed) !== 1 ||
  Number(direction.pitch) !== 0 ||
  Object.keys(parsePronunciations(direction.pronunciations)).length > 0;

/**
 * Body for POST /api/tts/preview. Only fields the user actually set are sent,
 * so everything else stays under the server's control. Text is cut to the
 * server's preview limit (at a word boundary) rather than being rejected.
 */
export const buildPreviewRequest = ({ text, voice, direction = DEFAULT_DIRECTION, fastMode = false, maxChars = 600 }) => {
  const trimmed = String(text || "").trim();
  let body = trimmed;
  if (trimmed.length > maxChars) {
    const cut = trimmed.lastIndexOf(" ", maxChars);
    body = trimmed.slice(0, cut > maxChars * 0.5 ? cut : maxChars).trim();
  }

  const request = { text: body, voice, fastMode };
  if (direction.style) request.style = direction.style;
  if (direction.emotion) request.emotion = direction.emotion;
  if (Number(direction.speed) !== 1) request.speed = Number(direction.speed);
  if (Number(direction.pitch) !== 0) request.pitch = Number(direction.pitch);
  const pronunciations = parsePronunciations(direction.pronunciations);
  if (Object.keys(pronunciations).length > 0) request.pronunciations = pronunciations;
  return request;
};

/** Human label for the X-Tts-Cache header value. */
export const describeCache = (cache) =>
  ({ hit: "from cache", miss: "freshly generated", mixed: "partly cached" })[cache] || null;
