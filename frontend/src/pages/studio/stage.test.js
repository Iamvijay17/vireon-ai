import { describe, it, expect } from "vitest";
import { getStudioStage } from "./stage";

describe("getStudioStage", () => {
  it("offers approval for a script awaiting review, in either mode", () => {
    expect(getStudioStage({ status: "AWAITING_APPROVAL" })).toMatchObject({ isAwaitingApproval: true, canEdit: true, isManual: false });
    expect(getStudioStage({ status: "AWAITING_APPROVAL", fastGeneration: false })).toMatchObject({ isAwaitingApproval: true, isManual: true });
  });

  it("pauses manual jobs for the audio and render triggers", () => {
    expect(getStudioStage({ status: "SCRIPT_COMPLETED", fastGeneration: false })).toMatchObject({
      isAwaitingAudioTrigger: true,
      isAwaitingRenderTrigger: false,
    });
    expect(getStudioStage({ status: "AUDIO_COMPLETED", fastGeneration: false })).toMatchObject({
      isAwaitingAudioTrigger: false,
      isAwaitingRenderTrigger: true,
      canRegenerateAudio: true,
    });
    expect(getStudioStage({ status: "SCRIPT_COMPLETED", fastGeneration: false }).canRegenerateAudio).toBe(false);
  });

  it("never pauses an automatic job between steps", () => {
    const stage = getStudioStage({ status: "SCRIPT_COMPLETED", fastGeneration: true });
    expect(stage.isAwaitingAudioTrigger).toBe(false);
    expect(stage.isAwaitingRenderTrigger).toBe(false);
  });

  it("only allows editing in settled states", () => {
    for (const status of ["COMPLETED", "FAILED", "SCRIPT_COMPLETED", "AUDIO_COMPLETED"]) {
      expect(getStudioStage({ status }).canEdit).toBe(true);
    }
    for (const status of ["QUEUED", "GENERATING_AUDIO", "RENDERING", "UPLOADING"]) {
      expect(getStudioStage({ status }).canEdit).toBe(false);
    }
  });
});
