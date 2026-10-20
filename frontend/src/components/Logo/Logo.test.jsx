// Explicit React import: the test transform here does not apply the automatic JSX runtime.
import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Logo, LogoMark } from "./index";
import { TONES, WORDMARK, lockupLayout } from "./geometry";

describe("Logo", () => {
  it("is decorative by default and named when given a title", () => {
    const { container, rerender } = render(<LogoMark />);
    const svg = container.querySelector("svg");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("role")).toBeNull();

    rerender(<LogoMark title="Vireon AI" />);
    const named = container.querySelector("svg");
    expect(named.getAttribute("role")).toBe("img");
    expect(named.getAttribute("aria-label")).toBe("Vireon AI");
  });

  it("renders a square mark at the requested size", () => {
    const { container } = render(<LogoMark size={48} />);
    const svg = container.querySelector("svg");
    expect(svg.getAttribute("width")).toBe("48");
    expect(svg.getAttribute("height")).toBe("48");
    expect(svg.querySelectorAll("path")).toHaveLength(3);
  });

  it("sizes the lockup from its height, keeping the lockup's aspect ratio", () => {
    const { container } = render(<Logo variant="compact" height={30} />);
    const svg = container.querySelector("svg");
    const [, , w, h] = lockupLayout("compact").viewBox;
    expect(Number(svg.getAttribute("height"))).toBe(30);
    expect(Number(svg.getAttribute("width"))).toBeCloseTo((30 * w) / h, 5);
    expect(svg.querySelectorAll("path")).toHaveLength(3 + WORDMARK.pieces.length);
  });

  it("uses currentColor for the mono tone", () => {
    const { container } = render(<Logo tone="mono" />);
    for (const p of container.querySelectorAll("path")) {
      expect([p.getAttribute("fill"), p.getAttribute("stroke")]).toContain("currentColor");
    }
    expect(TONES.mono.left).toBe("currentColor");
  });
});

globalThis.React = React;
