import { describe, it, expect } from "vitest";
import { previewState, previewPollInterval } from "./previewState";

const scenes = [{ sceneNumber: 1 }, { sceneNumber: 2 }];

describe("previewState", () => {
  it("waits while no script exists yet", () => {
    expect(previewState(null).kind).toBe("waiting");
    expect(previewState({ status: "SCRIPT_GENERATION", script: {} }).kind).toBe("waiting");
  });

  it("offers a draft as soon as the script has scenes, whatever the job status", () => {
    const s = previewState({ status: "AWAITING_APPROVAL", script: { scenes } });
    expect(s.kind).toBe("draft");
    expect(s.scenes).toBe(scenes);
    expect(s.finalReady).toBe(false);
  });

  it("only calls the final render ready when the job completed with a video file", () => {
    expect(previewState({ status: "COMPLETED", script: { scenes }, videoUrl: "http://x/v.mp4" }).finalReady).toBe(true);
    expect(previewState({ status: "COMPLETED", script: { scenes } }).finalReady).toBe(false);
    expect(previewState({ status: "RENDERING", script: { scenes }, videoUrl: "http://x/v.mp4" }).finalReady).toBe(false);
  });

  it("reports a job that died before it had a script", () => {
    expect(previewState({ status: "FAILED", script: {} }).kind).toBe("failed");
    expect(previewState({ status: "CANCELLED" }).kind).toBe("failed");
  });
});

describe("previewPollInterval", () => {
  it("polls while the script is on its way", () => {
    expect(previewPollInterval(undefined)).toBe(4000);
    expect(previewPollInterval({ status: "QUEUED" })).toBe(4000);
    expect(previewPollInterval({ status: "SCRIPT_GENERATION" })).toBe(4000);
  });
  it("stops once scenes exist or the job is over", () => {
    expect(previewPollInterval({ status: "QUEUED", script: { scenes } })).toBe(false);
    expect(previewPollInterval({ status: "FAILED" })).toBe(false);
    expect(previewPollInterval({ status: "AWAITING_APPROVAL" })).toBe(false);
  });
});
