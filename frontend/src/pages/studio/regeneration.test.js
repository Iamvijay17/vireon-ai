import { describe, it, expect } from "vitest";
import { describePlan, joinList, partLabel, versionLabel } from "./regeneration";

describe("joinList", () => {
  it("lists the way a sentence does", () => {
    expect(joinList([])).toBe("");
    expect(joinList(["a"])).toBe("a");
    expect(joinList(["a", "b"])).toBe("a and b");
    expect(joinList(["a", "b", "c"])).toBe("a, b and c");
  });
});

describe("partLabel", () => {
  it("names the graph's parts in plain language, and passes unknown ones through", () => {
    expect(partLabel("audio")).toBe("voice");
    expect(partLabel("scene-composition")).toBe("scene composition");
    expect(partLabel("render")).toBe("final render");
    expect(partLabel("something-new")).toBe("something-new");
  });
});

describe("describePlan", () => {
  it("image: rebuilds the composition and render, reuses script, voice and caption timing", () => {
    const plan = {
      changed: ["image"],
      regenerate: ["scene-composition", "render"],
      reusable: ["script", "audio", "captions", "layout", "motion", "transition"],
      produce: ["image"],
    };
    expect(describePlan(plan)).toBe(
      "Rebuilding image, scene composition and final render. Reusing script, voice and caption timing.",
    );
  });

  it("layout: no model work, everything generated is reused", () => {
    const plan = {
      changed: ["layout"],
      regenerate: ["scene-composition", "render"],
      reusable: ["script", "audio", "captions", "image", "motion", "transition"],
      produce: [],
    };
    expect(describePlan(plan)).toBe("Rebuilding scene composition and final render. Reusing script, voice, caption timing and image.");
  });

  it("voice: voice and caption timing are redone, script and image kept", () => {
    const plan = {
      changed: ["audio"],
      regenerate: ["captions", "scene-composition", "render"],
      reusable: ["script", "image", "layout", "motion", "transition"],
      produce: ["audio", "captions"],
    };
    expect(describePlan(plan)).toBe("Rebuilding voice, caption timing, scene composition and final render. Reusing script and image.");
  });

  it("does not say it is reusing parts that cost nothing (layout, motion, transition)", () => {
    const plan = { changed: ["image"], regenerate: ["render"], reusable: ["layout", "motion", "transition"], produce: ["image"] };
    expect(describePlan(plan)).not.toMatch(/Reusing/);
  });

  it("copes with an empty or missing plan", () => {
    expect(describePlan(null)).toBe("");
    expect(describePlan({})).toBe("Rebuilding the render.");
  });
});

describe("versionLabel", () => {
  it("marks the current one and names what changed", () => {
    expect(versionLabel({ version: 3, changeType: "voice" }, 3)).toBe("v3 (voice) - current");
    expect(versionLabel({ version: 2, changeType: "layout" }, 3)).toBe("v2 (layout)");
  });

  it("calls the first version the original", () => {
    expect(versionLabel({ version: 1, changeType: "initial" }, 3)).toBe("v1 (original)");
  });
});
