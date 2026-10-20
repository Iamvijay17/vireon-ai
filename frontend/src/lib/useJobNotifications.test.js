import { describe, it, expect } from "vitest";
import { detectFinished } from "./useJobNotifications";

const job = (id, status, extra = {}) => ({ _id: id, topic: `Topic ${id}`, status, ...extra });

describe("detectFinished", () => {
  it("reports jobs that were open and are now completed or failed", () => {
    const previous = new Map([["a", "running"], ["b", "queued"], ["c", "waiting"]]);
    const result = detectFinished(previous, [
      job("a", "COMPLETED"),
      job("b", "FAILED", { error: { message: "TTS crashed" } }),
      job("c", "AUDIO_COMPLETED"),
    ]);
    expect(result).toEqual([
      { id: "a", topic: "Topic a", phase: "completed", error: undefined },
      { id: "b", topic: "Topic b", phase: "failed", error: "TTS crashed" },
    ]);
  });

  it("stays silent for jobs it has not seen before and for ones already finished", () => {
    const previous = new Map([["done", "completed"]]);
    expect(detectFinished(previous, [job("new", "COMPLETED"), job("done", "COMPLETED")])).toEqual([]);
  });

  it("does not treat a cancelled job as finished", () => {
    expect(detectFinished(new Map([["a", "running"]]), [job("a", "CANCELLED")])).toEqual([]);
  });
});
