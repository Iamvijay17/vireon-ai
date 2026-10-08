import { describe, it, expect } from "vitest";
import { describeSpeechStages, latestSpeechEvents, peaksFromSamples, formatSeconds } from "./speechStages";

const ev = (event, extra = {}) => ({ type: "speechStage", data: { event, ...extra } });

describe("describeSpeechStages", () => {
  it("shows nothing for a job without speech events", () => {
    expect(describeSpeechStages([])).toEqual([]);
    expect(describeSpeechStages([{ type: "jobProgress", data: {} }])).toEqual([]);
    expect(describeSpeechStages(undefined)).toEqual([]);
  });

  it("walks the four friendly steps in order", () => {
    const labels = (events) => describeSpeechStages(events).map((r) => `${r.state}:${r.label}`);

    expect(labels([ev("tts:start")])).toEqual([
      "active:Generating voice...", "pending:Analyzing speech timing...", "pending:Building visual timeline...", "pending:Rendering video...",
    ]);

    expect(labels([ev("tts:start"), ev("tts:complete"), ev("alignment:start")])).toEqual([
      "done:Voice generated", "active:Analyzing speech timing...", "pending:Building visual timeline...", "pending:Rendering video...",
    ]);

    expect(labels([ev("tts:start"), ev("tts:complete"), ev("alignment:start"), ev("alignment:complete")])).toEqual([
      "done:Voice generated", "done:Speech timing analyzed", "active:Building visual timeline...", "pending:Rendering video...",
    ]);

    expect(labels([ev("tts:complete"), ev("alignment:complete"), ev("timeline:complete"), ev("render:start")])).toEqual([
      "done:Voice generated", "done:Speech timing analyzed", "done:Timeline ready", "active:Rendering video...",
    ]);
  });

  it("everything is done after render:complete", () => {
    const all = ["tts:start", "tts:complete", "alignment:start", "alignment:complete", "timeline:complete", "render:start", "render:complete"].map((e) => ev(e));
    expect(describeSpeechStages(all).map((r) => r.state)).toEqual(["done", "done", "done", "done"]);
  });

  it("adds a plain progress hint while analysing, never raw event names", () => {
    const rows = describeSpeechStages([ev("tts:start"), ev("alignment:start"), ev("alignment:progress", { current: 2, total: 5 })]);
    expect(rows[1].detail).toBe("scene 2 of 5");
    expect(JSON.stringify(rows)).not.toMatch(/alignment:|tts:/);
  });

  it("ignores events that arrive out of order or duplicated (replay after a reconnect)", () => {
    const rows = describeSpeechStages([ev("alignment:complete"), ev("tts:start"), ev("tts:start"), ev("tts:complete")]);
    expect(rows.map((r) => r.state)).toEqual(["done", "done", "active", "pending"]);
  });

  it("latestSpeechEvents keeps the newest payload per event", () => {
    const seen = latestSpeechEvents([ev("alignment:progress", { current: 1 }), ev("alignment:progress", { current: 3 })]);
    expect(seen["alignment:progress"].current).toBe(3);
  });
});

describe("peaksFromSamples", () => {
  it("takes the loudest sample of each slice and normalises to 0..1", () => {
    const samples = new Float32Array([0.1, -0.5, 0.2, 0.2, -1, 0.3, 0, 0]);
    const peaks = peaksFromSamples(samples, 4);
    [0.5, 0.2, 1, 0].forEach((expected, i) => expect(peaks[i]).toBeCloseTo(expected, 5));
  });

  it("is empty without samples", () => {
    expect(peaksFromSamples(new Float32Array(0), 10)).toEqual([]);
    expect(peaksFromSamples(null, 10)).toEqual([]);
  });

  it("never divides by zero on silence", () => {
    expect(peaksFromSamples(new Float32Array(100), 5).every((p) => p === 0)).toBe(true);
  });
});

describe("formatSeconds", () => {
  it("formats seconds and tolerates missing values", () => {
    expect(formatSeconds(1.2345)).toBe("1.23s");
    expect(formatSeconds(undefined)).toBe("–");
  });
});
