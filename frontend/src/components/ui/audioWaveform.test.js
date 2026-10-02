import { describe, it, expect } from "vitest";
import { barCountFor, resampleBars, seededBars, barPool, MIN_BARS, MAX_BARS, BAR_WIDTH, BAR_GAP } from "./audioWaveform";

describe("barCountFor", () => {
  it("fits as many bars as the width allows", () => {
    const w = 500;
    const n = barCountFor(w);
    // n bars + (n-1) gaps must fit; one more must not
    expect(n * BAR_WIDTH + (n - 1) * BAR_GAP).toBeLessThanOrEqual(w);
    expect((n + 1) * BAR_WIDTH + n * BAR_GAP).toBeGreaterThan(w);
  });

  it("uses more bars on a wider track (the old fixed 46 left wide pills mostly empty)", () => {
    expect(barCountFor(900)).toBeGreaterThan(barCountFor(300));
  });

  it("clamps to a sensible range", () => {
    expect(barCountFor(40)).toBe(MIN_BARS);
    expect(barCountFor(5000)).toBe(MAX_BARS);
  });

  it("falls back to a default before the width is known", () => {
    expect(barCountFor(0)).toBe(46);
    expect(barCountFor(undefined)).toBe(46);
    expect(barCountFor(NaN)).toBe(46);
  });
});

describe("waveform shape", () => {
  it("is deterministic per source and differs between sources", () => {
    expect(seededBars("a.mp3", 30)).toEqual(seededBars("a.mp3", 30));
    expect(seededBars("a.mp3", 30)).not.toEqual(seededBars("b.mp3", 30));
  });

  it("keeps every bar visible (height between 0.3 and 1)", () => {
    for (const h of barPool("x.mp3")) {
      expect(h).toBeGreaterThanOrEqual(0.3);
      expect(h).toBeLessThanOrEqual(1);
    }
  });

  it("resamples the same pool to any count, preserving order/shape", () => {
    const pool = barPool("x.mp3");
    const few = resampleBars(pool, 40);
    const many = resampleBars(pool, 120);
    expect(few).toHaveLength(40);
    expect(many).toHaveLength(120);
    expect(few[0]).toBe(pool[0]);
    expect(few[39]).toBe(pool[Math.floor((39 * pool.length) / 40)]);
  });
});
