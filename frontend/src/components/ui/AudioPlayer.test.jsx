// Explicit React import: the test transform here does not apply the
// automatic JSX runtime the app build uses.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { AudioPlayer } from "./AudioPlayer";

// The component under test uses the build's automatic JSX runtime, which this
// test transform lacks; its JSX only runs at render time, so a global is enough.
globalThis.React = React;

let observers = [];
class FakeResizeObserver {
  constructor(cb) {
    this.cb = cb;
    observers.push(this);
  }
  observe() {}
  disconnect() {}
}

const barsIn = (container) => container.querySelectorAll('[role="slider"] > span').length;
const resizeTo = (width) => act(() => observers.forEach((o) => o.cb([{ contentRect: { width } }])));

describe("AudioPlayer waveform", () => {
  beforeEach(() => {
    observers = [];
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("fits more bars into a wider track and fewer into a narrow one", () => {
    const { container } = render(<AudioPlayer src="/a.mp3" />);
    resizeTo(300);
    const narrow = barsIn(container);
    resizeTo(900);
    const wide = barsIn(container);
    expect(wide).toBeGreaterThan(narrow);
    expect(narrow).toBeGreaterThanOrEqual(8);
  });

  it("renders nothing without a source", () => {
    const { container } = render(<AudioPlayer src="" />);
    expect(container.firstChild).toBeNull();
  });

  it("still renders a sensible waveform where ResizeObserver is unavailable", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("ResizeObserver", undefined);
    const { container } = render(<AudioPlayer src="/a.mp3" />);
    expect(barsIn(container)).toBe(46);
  });
});
