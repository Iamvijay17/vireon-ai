import { describe, it, expect } from "vitest";
import { validateStep, validateAll, stepOfField, buildSummary, workflowLabel, STEPS } from "./summary";
import { aspectOf, resolutionsForAspect, RESOLUTIONS, buildInitialValues } from "./constants";

const valid = {
  topic: "How transformers changed translation",
  type: "educational",
  duration: 5,
  language: "english",
  voice: "custom:Aiden",
  hostVoice: "",
  guestVoice: "",
  resolution: "1920x1080",
  quality: "standard",
  captionAnimation: "fadeInUp",
  fontPairing: "default",
  fastGeneration: false,
  autoApprove: false,
  fastAudio: false,
  voiceStyle: "",
};

describe("validateStep", () => {
  it("requires a topic of real length, a type and a duration on the brief", () => {
    expect(validateStep("brief", valid)).toEqual({});
    expect(validateStep("brief", { ...valid, topic: "  ab " }).topic).toMatch(/at least 3/);
    expect(validateStep("brief", { ...valid, topic: "x".repeat(501) }).topic).toMatch(/under 500/);
    expect(validateStep("brief", { ...valid, type: undefined }).type).toBeTruthy();
    expect(validateStep("brief", { ...valid, duration: undefined }).duration).toBeTruthy();
  });

  it("only accepts a Shorts duration from the Shorts scale", () => {
    expect(validateStep("brief", { ...valid, type: "youtube_shorts", duration: 2 })).toEqual({});
    expect(validateStep("brief", { ...valid, type: "youtube_shorts", duration: 10 }).duration).toBeTruthy();
  });

  it("needs both voices for a podcast, and neither for other types", () => {
    expect(validateStep("voice", valid)).toEqual({});
    const podcast = validateStep("voice", { ...valid, type: "podcast" });
    expect(Object.keys(podcast).sort()).toEqual(["guestVoice", "hostVoice"]);
    expect(validateStep("voice", { ...valid, type: "podcast", hostVoice: "a", guestVoice: "b" })).toEqual({});
  });

  it("keeps YouTube Shorts on a 9:16 resolution", () => {
    expect(validateStep("output", { ...valid, type: "youtube_shorts", resolution: "1080x1920" })).toEqual({});
    expect(validateStep("output", { ...valid, type: "youtube_shorts", resolution: "1920x1080" }).resolution).toBeTruthy();
  });
});

describe("validateAll and stepOfField", () => {
  it("collects every step's errors and points each back at its step", () => {
    const errors = validateAll({ ...valid, topic: "", type: "podcast" });
    expect(Object.keys(errors)).toEqual(expect.arrayContaining(["topic", "hostVoice", "guestVoice"]));
    expect(stepOfField("topic")).toBe(0);
    expect(stepOfField("hostVoice")).toBe(1);
    expect(stepOfField("resolution")).toBe(2);
    expect(STEPS[stepOfField("resolution")].key).toBe("output");
  });
});

describe("aspect ratios", () => {
  it("derives the ratio from a resolution the way the server does", () => {
    expect(aspectOf("1920x1080")).toBe("16:9");
    expect(aspectOf("1080x1920")).toBe("9:16");
    expect(aspectOf("1080x1080")).toBe("1:1");
    expect(aspectOf("1080x1350")).toBe("4:5");
    expect(aspectOf("3840x2160")).toBe("16:9");
  });

  it("groups every offered resolution under exactly one ratio", () => {
    const grouped = ["16:9", "9:16", "1:1", "4:5"].flatMap(resolutionsForAspect);
    expect(grouped.map((r) => r.value).sort()).toEqual(RESOLUTIONS.map((r) => r.value).sort());
  });

  it("offers a square size, which the server accepts", () => {
    expect(resolutionsForAspect("1:1").map((r) => r.value)).toEqual(["1080x1080"]);
  });
});

describe("buildSummary", () => {
  const voiceOptions = [{ value: "custom:Aiden", label: "Aiden" }];

  it("names the voice, not its id, and describes the workflow", () => {
    const groups = buildSummary({ ...valid, fastGeneration: true }, voiceOptions);
    const rows = Object.fromEntries(groups.flatMap((g) => g.rows).map((r) => [r.label, r.value]));
    expect(rows.Voice).toBe("Aiden");
    expect(rows.Workflow).toBe("Automatic after you approve the script");
    expect(rows.Format).toContain("16:9");
  });

  it("lists host and guest for a podcast instead of a single voice", () => {
    const groups = buildSummary({ ...valid, type: "podcast", hostVoice: "custom:Aiden", guestVoice: "x", hostName: "Alex" }, voiceOptions);
    const labels = groups.flatMap((g) => g.rows).map((r) => r.label);
    expect(labels).toContain("Host");
    expect(labels).not.toContain("Voice");
  });
});

describe("workflowLabel", () => {
  it("covers manual, review-first and fully automatic", () => {
    expect(workflowLabel({ fastGeneration: false })).toMatch(/Manual/);
    expect(workflowLabel({ fastGeneration: true, autoApprove: false })).toMatch(/approve/);
    expect(workflowLabel({ fastGeneration: true, autoApprove: true })).toBe("Fully automatic");
  });
});

describe("buildInitialValues", () => {
  it("starts with the default font pairing and no preselected video-type bias beyond settings", () => {
    const values = buildInitialValues();
    expect(values.fontPairing).toBe("default");
    expect(values.fastGeneration).toBe(false);
  });
});
