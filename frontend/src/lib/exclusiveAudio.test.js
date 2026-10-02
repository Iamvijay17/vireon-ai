import { describe, it, expect, vi, beforeEach } from "vitest";
import { installExclusiveAudio, EXCLUSIVE_AUDIO_ATTR } from "./exclusiveAudio";

const makeAudio = (exclusive = true) => {
  const el = document.createElement("audio");
  if (exclusive) el.setAttribute(EXCLUSIVE_AUDIO_ATTR, "");
  // jsdom doesn't implement media playback
  let paused = true;
  Object.defineProperty(el, "paused", { get: () => paused });
  el.pause = vi.fn(() => { paused = true; });
  document.body.appendChild(el);
  return { el, setPlaying: () => { paused = false; el.dispatchEvent(new Event("play")); } };
};

describe("exclusiveAudio", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    installExclusiveAudio();
  });

  it("pauses other exclusive audio when one starts", () => {
    const a = makeAudio();
    const b = makeAudio();
    a.setPlaying();
    b.setPlaying();
    expect(a.el.pause).toHaveBeenCalledTimes(1);
    expect(b.el.pause).not.toHaveBeenCalled();
  });

  it("ignores audio without the attribute", () => {
    const a = makeAudio();
    const other = makeAudio(false);
    other.setPlaying();
    a.setPlaying();
    expect(other.el.pause).not.toHaveBeenCalled();
  });
});
