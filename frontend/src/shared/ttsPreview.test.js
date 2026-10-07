import { describe, it, expect } from "vitest";
import { DEFAULT_DIRECTION, parsePronunciations, isDirectionCustomised, buildPreviewRequest, describeCache } from "./ttsPreview";

describe("parsePronunciations", () => {
  it("reads one 'word = spoken' per line and ignores junk", () => {
    expect(parsePronunciations("Vireon = Veer ee on\n\nbad line\n= nothing\nQwen=Chwen\nx =")).toEqual({
      Vireon: "Veer ee on",
      Qwen: "Chwen",
    });
  });

  it("keeps '=' inside the spoken part and lets later lines win", () => {
    expect(parsePronunciations("a = b = c\na = d")).toEqual({ a: "d" });
    expect(parsePronunciations("a = b = c")).toEqual({ a: "b = c" });
  });

  it("handles empty input", () => {
    expect(parsePronunciations("")).toEqual({});
    expect(parsePronunciations(undefined)).toEqual({});
  });
});

describe("buildPreviewRequest", () => {
  it("sends only what the user changed", () => {
    expect(buildPreviewRequest({ text: " Hello. ", voice: "custom:Ryan" })).toEqual({ text: "Hello.", voice: "custom:Ryan", fastMode: false });
    const req = buildPreviewRequest({
      text: "Hello.",
      voice: "custom:Ryan",
      direction: { ...DEFAULT_DIRECTION, style: "calm", speed: 1.1, pitch: -1, pronunciations: "Vireon = Veer ee on" },
      fastMode: true,
    });
    expect(req).toEqual({ text: "Hello.", voice: "custom:Ryan", fastMode: true, style: "calm", speed: 1.1, pitch: -1, pronunciations: { Vireon: "Veer ee on" } });
  });

  it("trims long text at a word boundary instead of letting the server reject it", () => {
    const text = "word ".repeat(300);
    const req = buildPreviewRequest({ text, voice: "v", maxChars: 100 });
    expect(req.text.length).toBeLessThanOrEqual(100);
    expect(req.text.endsWith("word")).toBe(true);
  });

  it("coerces slider strings to numbers", () => {
    expect(buildPreviewRequest({ text: "x", voice: "v", direction: { ...DEFAULT_DIRECTION, speed: "1.05" } }).speed).toBe(1.05);
  });
});

describe("isDirectionCustomised / describeCache", () => {
  it("is false for the defaults and true after any change", () => {
    expect(isDirectionCustomised(DEFAULT_DIRECTION)).toBe(false);
    expect(isDirectionCustomised({ ...DEFAULT_DIRECTION, emotion: "warm" })).toBe(true);
    expect(isDirectionCustomised({ ...DEFAULT_DIRECTION, pronunciations: "a = b" })).toBe(true);
    expect(isDirectionCustomised({ ...DEFAULT_DIRECTION, pronunciations: "just words" })).toBe(false);
  });

  it("labels the cache header", () => {
    expect(describeCache("hit")).toBe("from cache");
    expect(describeCache("nope")).toBeNull();
  });
});
