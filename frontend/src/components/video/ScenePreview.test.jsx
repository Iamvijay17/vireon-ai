// Explicit React import: the test transform here does not apply the
// automatic JSX runtime the app build uses.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

// Capture every props object the Remotion Player is rendered with, so the
// test can assert on identity (a new inputProps object = a full composition
// re-render in the real Player).
const playerProps = vi.hoisted(() => []);

vi.mock("@remotion/player", () => ({
  Player: React.forwardRef(function MockPlayer(props, ref) {
    playerProps.push(props);
    React.useImperativeHandle(ref, () => ({
      seekTo: () => {},
      pause: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    return null;
  }),
}));
vi.mock("vireon-remotion-templates/src/VideoComposition", () => ({ VideoComposition: () => null }));
vi.mock("vireon-remotion-templates/src/calculateVideoMetadata", () => ({
  FPS: 30,
  calculateTotalDurationInFrames: (scenes) => scenes.length * 240,
}));
vi.mock("../../services/api", () => ({
  resolveMediaUrl: (u) => u,
  resolveSceneAudioUrl: (id, file) => (file ? `/media/${id}/${file}` : null),
}));

import { ScenePreview } from "./ScenePreview";

// The component under test uses the build's automatic JSX runtime, which this
// test transform lacks; its JSX only runs at render time, so a global is enough.
globalThis.React = React;

const scenesOf = (text) => [
  { sceneNumber: 1, duration: 8, text, audio: { file: "scene1.mp3" } },
  { sceneNumber: 2, duration: 8, text: "second" },
];
const lastProps = () => playerProps[playerProps.length - 1];

describe("ScenePreview render stability", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    playerProps.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it("keeps the same inputProps object when the parent re-renders without scene changes", () => {
    const scenes = scenesOf("hello");
    const { rerender } = render(<ScenePreview scenes={scenes} videoId="v1" focusIndex={0} />);
    const first = lastProps().inputProps;

    rerender(<ScenePreview scenes={scenes} videoId="v1" focusIndex={1} />);
    rerender(<ScenePreview scenes={scenes} videoId="v1" focusIndex={0} hideChips />);

    expect(playerProps.length).toBeGreaterThan(1); // the Player did render again...
    expect(lastProps().inputProps).toBe(first); // ...but with the identical inputProps object
  });

  it("does not re-render the composition on every keystroke; settles after the pause", () => {
    const { rerender } = render(<ScenePreview scenes={scenesOf("a")} videoId="v1" />);
    const first = lastProps().inputProps;

    // 5 keystrokes 50 ms apart: new scenes array each time, same scene count
    for (const t of ["ab", "abc", "abcd", "abcde", "abcdef"]) {
      rerender(<ScenePreview scenes={scenesOf(t)} videoId="v1" />);
      act(() => vi.advanceTimersByTime(50));
    }
    expect(lastProps().inputProps).toBe(first); // still the pre-typing composition

    act(() => vi.advanceTimersByTime(250));
    expect(lastProps().inputProps).not.toBe(first);
    expect(lastProps().inputProps.assets.scenes[0].text).toBe("abcdef");
  });

  it("applies adding a scene immediately (structure changes are not delayed)", () => {
    const { rerender } = render(<ScenePreview scenes={scenesOf("a")} videoId="v1" />);
    expect(lastProps().inputProps.assets.scenes).toHaveLength(2);

    rerender(<ScenePreview scenes={[...scenesOf("a"), { sceneNumber: 3, duration: 8, text: "third" }]} videoId="v1" />);
    expect(lastProps().inputProps.assets.scenes).toHaveLength(3); // no timer advance needed
    expect(lastProps().durationInFrames).toBe(3 * 240);
  });

  it("seeds the generative style with the real job id so the preview matches the render", () => {
    render(<ScenePreview scenes={scenesOf("a")} videoId="job-ABC12345" />);
    expect(lastProps().inputProps.jobId).toBe("job-ABC12345");
  });

  it("falls back to a fixed seed when no id is available", () => {
    render(<ScenePreview scenes={scenesOf("a")} />);
    expect(lastProps().inputProps.jobId).toBe("preview");
  });
});
