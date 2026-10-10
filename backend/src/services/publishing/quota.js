/**
 * YouTube Data API quotas reset at midnight Pacific Time. These helpers find
 * that boundary (DST included, via Intl - no hard-coded UTC offset) so the
 * local daily-upload guard counts the same "day" Google does, and a job that
 * hits the quota can be told exactly when to wake up.
 */

const QUOTA_TZ = 'America/Los_Angeles';

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

/** The instant of the most recent Pacific midnight at or before `now`. */
function quotaDayStart(now = new Date()) {
  const p = partsInZone(now, QUOTA_TZ);
  const guess = new Date(Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0));
  // The wall-clock midnight expressed in UTC, corrected by the offset in force then.
  const offset = zoneOffsetMs(new Date(guess.getTime() - zoneOffsetMs(guess, QUOTA_TZ)), QUOTA_TZ);
  return new Date(guess.getTime() - offset);
}

/** The next Pacific midnight strictly after `now`. */
function nextQuotaReset(now = new Date()) {
  const start = quotaDayStart(now);
  // 25h forward lands inside the next Pacific day whatever the DST shift was.
  return quotaDayStart(new Date(start.getTime() + 25 * 3600_000));
}

module.exports = { quotaDayStart, nextQuotaReset, QUOTA_TZ };
