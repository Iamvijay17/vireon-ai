import { describe, it, expect } from "vitest";
import { deriveJobView } from "./jobView";

const script = { scenes: [{ sceneNumber: 1 }] };
const view = (over) => deriveJobView({ status: "QUEUED", fastGeneration: true, ...over });

describe("deriveJobView", () => {
  it("a queued job can only be stopped", () => {
    const v = view({ status: "QUEUED" });
    expect(v).toMatchObject({ isActive: true, canStop: true, canRegenerateStuck: false, canEditDetails: true });
    expect(v.scriptStageReason).toBe("The script hasn't been generated yet");
  });

  it("a busy job can't be edited and says why", () => {
    const v = view({ status: "GENERATING_AUDIO", script });
    expect(v.canEditDetails).toBe(false);
    expect(v.editDisabledReason).toMatch(/generating audio/);
    expect(v.canRegenerateStuck).toBe(true);
    expect(v.showGenericStudio).toBe(true);
  });

  it("asks for script review at the approval gate", () => {
    const v = view({ status: "AWAITING_APPROVAL", script });
    expect(v.showReviewScript).toBe(true);
    expect(v.approvalStageReason).toBeUndefined();
    expect(v.showGenericStudio).toBe(false);
  });

  it("manual mode offers each next step itself", () => {
    expect(view({ status: "SCRIPT_COMPLETED", fastGeneration: false, script }).showGenerateAudio).toBe(true);

    const audioDone = view({ status: "AUDIO_COMPLETED", fastGeneration: false, script });
    expect(audioDone.showGenerateRender).toBe(true);
    expect(audioDone.renderStageReason).toBeUndefined();
    expect(audioDone.audioStageReason).toMatch(/already generated/);
  });

  it("fast mode explains that later stages run on their own", () => {
    const v = view({ status: "AWAITING_APPROVAL", script });
    expect(v.audioStageReason).toMatch(/Fast Generation is on/);
    expect(v.renderStageReason).toMatch(/Fast Generation is on/);
  });

  it("a finished job can re-render and regenerate its script", () => {
    const v = view({ status: "COMPLETED", script });
    expect(v).toMatchObject({ isComplete: true, isActive: false, canStop: false, canReRenderComplete: true, canRegenerateScript: true });
  });

  it("a stopped job points at Restart instead of script regeneration", () => {
    const v = view({ status: "CANCELLED", script });
    expect(v.canRestartCancelled).toBe(true);
    expect(v.canRegenerateScript).toBe(false);
    expect(v.scriptStageReason).toBe("Job was stopped - use Restart Job instead");
  });
});
