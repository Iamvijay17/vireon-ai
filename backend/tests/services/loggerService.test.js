/**
 * The logger is the one source of log timestamps and per-job context for
 * every Vireon process - these pin the contract other modules rely on.
 */
const LoggerService = require('../../src/services/common/LoggerService');

describe('LoggerService.isoTimestamp', () => {
  const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}([+-]\d{2}:\d{2}|Z)$/;

  it('is ISO-8601 with milliseconds and a UTC offset', () => {
    expect(LoggerService.isoTimestamp()).toMatch(ISO_WITH_OFFSET);
  });

  it('keeps milliseconds and round-trips to the same instant', () => {
    const date = new Date('2026-10-08T05:14:08.123Z');
    const stamp = LoggerService.isoTimestamp(date);
    expect(stamp).toMatch(ISO_WITH_OFFSET);
    expect(stamp).toContain('.123');
    expect(new Date(stamp).getTime()).toBe(date.getTime());
  });
});
