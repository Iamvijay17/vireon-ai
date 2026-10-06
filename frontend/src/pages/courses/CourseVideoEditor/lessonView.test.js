import { describe, it, expect } from "vitest";
import { deriveLessonView } from "./lessonView";

const scenes = [{ sceneNumber: 1 }, { sceneNumber: 2 }];

describe("deriveLessonView", () => {
  it("a draft opens on the script step with later steps locked", () => {
    const v = deriveLessonView({ status: "Draft" });
    expect(v).toMatchObject({ scriptState: "active", audioState: "locked", renderState: "locked", autoOpenStep: "script" });
    expect(v.scriptSummary).toBe("Not generated yet");
  });

  it("an unapproved script waits for approval", () => {
    const v = deriveLessonView({ status: "Waiting for Approval", script: { scenes } });
    expect(v.scriptSummary).toBe("2 scenes • Awaiting approval");
    expect(v.audioSummary).toBe("Waiting on script approval");
  });

  it("approval unlocks audio and moves the open step along", () => {
    const v = deriveLessonView({ status: "Approved", approved: true, script: { scenes } });
    expect(v).toMatchObject({ scriptState: "done", audioState: "active", autoOpenStep: "audio" });
  });

  it("finished audio unlocks render", () => {
    const v = deriveLessonView({ status: "Audio Generated", approved: true, script: { scenes }, audioUrl: "a.mp3", audioDuration: 61.6 });
    expect(v).toMatchObject({ audioState: "done", renderState: "active", autoOpenStep: "render" });
    expect(v.audioSummary).toBe("62s narration • Generated");
  });

  it("marks the step that failed", () => {
    const v = deriveLessonView({ status: "Failed", approved: true, audioUrl: "a.mp3", error: { step: "Rendering" } });
    expect(v.isFailed).toBe(true);
    expect(v.renderState).toBe("error");
    expect(v.audioState).toBe("done");
  });

  it("knows which statuses are processing", () => {
    expect(deriveLessonView({ status: "Generating Audio" }).isProcessing).toBe(true);
    expect(deriveLessonView({ status: "Uploading" })).toMatchObject({ isProcessing: true, isUploading: true });
    expect(deriveLessonView({ status: "Completed" }).isProcessing).toBe(false);
  });
});
