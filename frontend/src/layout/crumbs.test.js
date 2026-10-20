import { describe, it, expect } from "vitest";
import { buildCrumbs } from "./crumbs";
import { NAV_ITEMS, isNavItemActive } from "./navConfig";

describe("buildCrumbs", () => {
  it("is just the page name on the overview", () => {
    expect(buildCrumbs("/")).toEqual([{ title: "Overview" }]);
  });

  it("labels top-level pages with their navigation names", () => {
    expect(buildCrumbs("/quality")).toEqual([{ title: "Quality Control" }]);
    expect(buildCrumbs("/audio")).toEqual([{ title: "Voice Studio" }]);
  });

  it("builds a project trail for the progress and editor views", () => {
    expect(buildCrumbs("/render", "?id=vid-abc12345", "Quantum computing")).toEqual([
      { title: "My Projects", to: "/projects" },
      { title: "Quantum computing" },
      { title: "Progress" },
    ]);
    expect(buildCrumbs("/studio", "?id=vid-abc12345", "Quantum computing")).toEqual([
      { title: "My Projects", to: "/projects" },
      { title: "Quantum computing", to: "/render?id=vid-abc12345" },
      { title: "Editor" },
    ]);
  });

  it("falls back to a generic project name while the title loads", () => {
    expect(buildCrumbs("/render", "?id=vid-abc12345")[1].title).toBe("Project");
  });

  it("uses the registered record name for an entity id and hides structural segments", () => {
    const crumbs = buildCrumbs("/courses/cou-abcd1234/videos/vid-abcd1234", "", "Intro");
    expect(crumbs.map((c) => c.title)).toEqual(["Courses", "Details", "Intro"]);
  });

  it("treats /render without an id as the render queue", () => {
    expect(buildCrumbs("/render")).toEqual([{ title: "Render Queue" }]);
  });
});

describe("isNavItemActive", () => {
  const item = (key) => NAV_ITEMS.find((i) => i.key === key);

  it("highlights only Overview on the root path", () => {
    expect(isNavItemActive(item("overview"), "/")).toBe(true);
    expect(isNavItemActive(item("overview"), "/jobs")).toBe(false);
  });

  it("separates the render queue from a single project's progress page", () => {
    expect(isNavItemActive(item("render"), "/render", "")).toBe(true);
    expect(isNavItemActive(item("projects"), "/render", "")).toBe(false);
    expect(isNavItemActive(item("render"), "/render", "?id=vid-1")).toBe(false);
    expect(isNavItemActive(item("projects"), "/render", "?id=vid-1")).toBe(true);
  });

  it("keeps My Projects highlighted in the editor and Media Library on its old path", () => {
    expect(isNavItemActive(item("projects"), "/studio", "?id=vid-1")).toBe(true);
    expect(isNavItemActive(item("media"), "/assets")).toBe(true);
  });

  it("matches nested paths under a section", () => {
    expect(isNavItemActive(item("promotion"), "/promotion/posts")).toBe(true);
    expect(isNavItemActive(item("courses"), "/courses/cou-abcd1234")).toBe(true);
  });
});
