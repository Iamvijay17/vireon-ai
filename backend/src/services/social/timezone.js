/**
 * Timezone helpers for scheduling. Everything is STORED in UTC; an IANA zone
 * name (e.g. "Asia/Kolkata") is kept only to show the time the way the user
 * chose it. Conversion goes through Intl, so DST rules come from the platform's
 * tz database rather than a hard-coded offset.
 */

function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function partsInZone(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const out = {};
  for (const { type, value } of dtf.formatToParts(date)) out[type] = Number(value);
  return out;
}

/** Offset (ms) of the zone from UTC at the given instant: positive east of UTC. */
function zoneOffsetMs(date, timeZone) {
  const p = partsInZone(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Wall-clock time in a zone -> the UTC instant. "2026-11-01T01:30" in a zone with a repeated hour
 * resolves to the first occurrence; a time skipped by a DST jump resolves forward by the gap.
 * @returns {Date|null} null for a malformed value or unknown zone
 */
function zonedToUtc(localDateTime, timeZone) {
  const m = LOCAL_RE.exec(String(localDateTime || '').trim());
  if (!m || !isValidTimeZone(timeZone)) return null;
  const [, y, mo, d, h, mi, s] = m;
  const naive = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s || 0));
  // Guard against dates that overflowed (e.g. 2026-02-31).
  const check = new Date(naive);
  if (check.getUTCMonth() !== Number(mo) - 1 || check.getUTCDate() !== Number(d)) return null;

  // First guess with the offset at the naive instant, then correct once with the offset at the guess.
  let guess = naive - zoneOffsetMs(new Date(naive), timeZone);
  const corrected = naive - zoneOffsetMs(new Date(guess), timeZone);
  if (corrected !== guess) guess = corrected;
  return new Date(guess);
}

/** UTC instant -> "YYYY-MM-DDTHH:mm" wall-clock in the zone (for pre-filling an edit form). */
function utcToZoned(date, timeZone) {
  const p = partsInZone(date, timeZone);
  const pad = (n) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

module.exports = { isValidTimeZone, zonedToUtc, utcToZoned, zoneOffsetMs };
