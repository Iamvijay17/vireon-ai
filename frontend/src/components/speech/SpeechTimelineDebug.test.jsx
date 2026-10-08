// Explicit React import: the test transform here does not apply the
// automatic JSX runtime the app build uses.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

globalThis.React = React;

const word = (id, captionIndex, text, start, end, extra = {}) => ({
  wordId: id, segmentId: "s1", index: captionIndex, captionIndex, text, start, end, duration: +(end - start).toFixed(3), confidence: 0.95, emphasis: false, ...extra,
});

const timeline = {
  version: 1, alignmentStatus: "complete", alignmentProvider: "faster-whisper", alignmentVersion: "v1/m1", granularity: "word", duration: 4,
  segments: [{ segmentId: "s1", index: 0, text: "Artificial intelligence is here.", wordCount: 4, start: 0, end: 2.4, duration: 2.4, granularity: "word", alignmentStatus: "complete" },
             { segmentId: "s2", index: 1, text: "Really.", wordCount: 1, start: 3, end: 4, duration: 1, granularity: "segment", alignmentStatus: "failed" }],
  words: [word("w1", 0, "Artificial", 0, 0.6, { emphasis: true }), word("w2", 1, "intelligence", 0.62, 1.3), word("w3", 2, "is", 1.35, 1.5), word("w4", 3, "here.", 1.55, 2.4)],
  phrases: [{ phraseId: "p1", segmentId: "s1", text: "Artificial intelligence", start: 0, end: 1.3, duration: 1.3, firstWordId: "w1", lastWordId: "w2", wordCount: 2, emphasis: true, importance: "high" },
            { phraseId: "p2", segmentId: "s1", text: "is here.", start: 1.35, end: 2.4, duration: 1.05, firstWordId: "w3", lastWordId: "w4", wordCount: 2, emphasis: false, importance: "normal" }],
  pauses: [{ pauseId: "pause-001", start: 2.4, end: 3, duration: 0.6, kind: "segment", afterId: "s1", beforeId: "s2" }],
  stats: { wordCount: 5, alignedWordCount: 4, alignedRatio: 0.8, phraseCount: 2, pauseCount: 1 },
};

const response = {
  alignmentEnabled: true,
  drivenAnimationEnabled: false,
  scenes: [
    { sceneNumber: 1, audioFile: "scene1.mp3", duration: 4, timeline, issues: [] },
    { sceneNumber: 2, audioFile: "scene2.mp3", duration: 2, timeline: null, issues: [] },
  ],
};

const getSpeechTimeline = vi.fn();
vi.mock("../../services/api", () => ({
  getSpeechTimeline: (...args) => getSpeechTimeline(...args),
  resolveSceneAudioUrl: (id, file) => `http://media/${id}/${file}`,
}));

const { SpeechTimelineDebug } = await import("./SpeechTimelineDebug");

beforeEach(() => {
  getSpeechTimeline.mockResolvedValue({ data: response });
  // jsdom has no media playback.
  vi.spyOn(window.HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
  vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  // No audio decoding in jsdom: the waveform lane must then be absent, not faked.
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const seek = (t) => fireEvent.change(screen.getByLabelText("Seek"), { target: { value: String(t) } });
const current = (label) => {
  const row = [...screen.getByLabelText("Current speech").children].find((d) => d.querySelector("dt").textContent === label);
  return row.querySelector("dd").textContent;
};

describe("SpeechTimelineDebug", () => {
  it("loads the job's timeline and shows alignment status, words, phrases, segments and pauses", async () => {
    render(<SpeechTimelineDebug jobId="job-ABCD1234" />);
    await screen.findByLabelText("Words");

    expect(getSpeechTimeline).toHaveBeenCalledWith("job-ABCD1234");
    expect(screen.getByText(/complete · word-level · faster-whisper · v1\/m1 · 4\/5 words/)).toBeTruthy();
    const words = screen.getByLabelText("Words");
    expect(words.textContent).toContain("Artificial");
    expect(words.textContent).toContain("here.");
    expect(screen.getByLabelText("Phrases").textContent).toContain("is here.");
    expect(screen.getByLabelText("Pauses").textContent).toContain("0.60s");
    // A segment that is only timed at segment level says so.
    expect(screen.getByLabelText("Segments").textContent).toContain("segment");
    expect(screen.getByText("alignment on")).toBeTruthy();
    expect(screen.getByText("speech-driven animation off")).toBeTruthy();
  });

  it("reports the word, phrase, segment and pause under the playhead as you seek", async () => {
    render(<SpeechTimelineDebug jobId="job-ABCD1234" />);
    await screen.findByLabelText("Words");

    seek(0.3);
    expect(current("Word")).toContain("Artificial");
    expect(current("Phrase")).toBe("Artificial intelligence");
    expect(current("Segment")).toContain("s1 (word-level)");
    expect(current("Pause")).toBe("—");

    seek(1.4);
    expect(current("Word")).toContain("is");
    expect(current("Phrase")).toBe("is here.");

    seek(2.7);
    expect(current("Word")).toBe("—"); // nobody is speaking
    expect(current("Pause")).toContain("segment · 0.60s");

    seek(3.5);
    expect(current("Segment")).toContain("s2 (segment-level)");
  });

  it("play / pause drives the audio element", async () => {
    render(<SpeechTimelineDebug jobId="job-ABCD1234" />);
    await screen.findByLabelText("Words");
    fireEvent.click(screen.getByLabelText("Play"));
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText("Pause")).toBeTruthy());
  });

  it("draws no waveform when the audio cannot be decoded (never a fake one)", async () => {
    render(<SpeechTimelineDebug jobId="job-ABCD1234" />);
    await screen.findByLabelText("Words");
    expect(screen.queryByLabelText("Waveform")).toBeNull();
  });

  it("says so for a scene without a timeline", async () => {
    getSpeechTimeline.mockResolvedValue({ data: { ...response, scenes: [{ sceneNumber: 1, audioFile: "scene1.mp3", duration: 2, timeline: null, issues: [] }] } });
    render(<SpeechTimelineDebug jobId="job-ABCD1234" />);
    await screen.findByText(/has no speech timeline/);
  });

  it("shows the load error instead of an empty panel", async () => {
    getSpeechTimeline.mockRejectedValue({ friendlyMessage: "Job not found" });
    render(<SpeechTimelineDebug jobId="job-ABCD1234" />);
    await screen.findByText("Job not found");
  });
});
