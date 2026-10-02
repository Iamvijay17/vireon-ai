// Explicit React import: the test transform here does not apply the
// automatic JSX runtime the app build uses.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const thumbProps = vi.hoisted(() => []);

vi.mock("@remotion/player", () => ({
  Thumbnail: (props) => {
    thumbProps.push(props);
    return null;
  },
}));
vi.mock("vireon-remotion-templates/src/VideoComposition", () => ({ VideoComposition: () => null }));
vi.mock("vireon-remotion-templates/src/calculateVideoMetadata", () => ({ FPS: 30 }));
vi.mock("../../services/api", () => ({ resolveMediaUrl: (u) => u }));

import { SceneThumbnail } from "./SceneThumbnail";

// The component under test uses the build's automatic JSX runtime, which this
// test transform lacks; its JSX only runs at render time, so a global is enough.
globalThis.React = React;

const scene = { sceneNumber: 1, duration: 8, templateId: "generative", elements: { title: "Hi" } };
const last = () => thumbProps[thumbProps.length - 1];

describe("SceneThumbnail", () => {
  beforeEach(() => {
    thumbProps.length = 0;
  });

  it("seeds the generative style with the real job id so it matches the render", () => {
    render(<SceneThumbnail scene={scene} jobId="job-ABC12345" />);
    expect(last().inputProps.jobId).toBe("job-ABC12345");
  });

  it("falls back to a fixed seed when no id is given", () => {
    render(<SceneThumbnail scene={scene} />);
    expect(last().inputProps.jobId).toBe("preview");
  });

  it("keeps the same inputProps object across re-renders with the same scene", () => {
    const { rerender } = render(<SceneThumbnail scene={scene} jobId="job-1" />);
    const first = last().inputProps;
    rerender(<SceneThumbnail scene={scene} jobId="job-1" className="x" />);
    expect(thumbProps.length).toBeGreaterThan(1);
    expect(last().inputProps).toBe(first);
  });
});
