import { describe, it, expect } from "vitest";
import { videoToProject, courseToProject, filterProjects, countByStatus, sortProjects } from "./projectModel";

const video = (id, status, extra = {}) => ({
  _id: id, topic: `Video ${id}`, status, type: "educational", resolution: "1920x1080",
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", ...extra,
});

describe("videoToProject", () => {
  it("normalises a job and links to its progress page", () => {
    const p = videoToProject(video("vid-1", "RENDERING", { progress: 65 }));
    expect(p).toMatchObject({ kind: "video", title: "Video vid-1", phase: "running", progress: 65, route: "/render?id=vid-1" });
    expect(p.meta).toEqual(["Educational", "1920x1080"]);
  });

  it("only offers the editor once a script exists", () => {
    expect(videoToProject(video("a", "QUEUED")).editRoute).toBeNull();
    expect(videoToProject(video("b", "COMPLETED", { script: { scenes: [{}] } })).editRoute).toBe("/studio?id=b");
  });

  it("knows a vertical video from its resolution", () => {
    expect(videoToProject(video("v", "COMPLETED", { resolution: "1080x1920" })).portrait).toBe(true);
    expect(videoToProject(video("h", "COMPLETED")).portrait).toBe(false);
  });
});

describe("courseToProject", () => {
  it("turns lesson counts into progress, and none into null rather than 0", () => {
    expect(courseToProject({ _id: "c1", title: "C", status: "In Progress", videoCount: 4, completedVideoCount: 1 }).progress).toBe(25);
    expect(courseToProject({ _id: "c2", title: "C", status: "Draft", videoCount: 0 }).progress).toBeNull();
  });
});

describe("filtering", () => {
  const projects = [
    videoToProject(video("1", "RENDERING")),
    videoToProject(video("2", "COMPLETED")),
    videoToProject(video("3", "FAILED")),
    videoToProject(video("4", "AWAITING_APPROVAL")),
    courseToProject({ _id: "c", title: "Linear Algebra", status: "Completed", videoCount: 2, completedVideoCount: 2 }),
  ];

  it("groups running, queued and waiting as in progress", () => {
    expect(filterProjects(projects, { status: "active" }).map((p) => p.id)).toEqual(["1", "4"]);
  });

  it("filters by kind and by title text, case-insensitively", () => {
    expect(filterProjects(projects, { kind: "course" })).toHaveLength(1);
    expect(filterProjects(projects, { search: "linear" })[0].id).toBe("c");
  });

  it("counts each status filter against the current search and kind", () => {
    expect(countByStatus(projects)).toEqual({ all: 5, active: 2, completed: 2, failed: 1 });
    expect(countByStatus(projects, { kind: "video" })).toEqual({ all: 4, active: 2, completed: 1, failed: 1 });
  });
});

describe("sortProjects", () => {
  const a = videoToProject(video("a", "COMPLETED", { topic: "banana", updatedAt: "2026-10-03T00:00:00Z" }));
  const b = videoToProject(video("b", "RENDERING", { topic: "Apple", updatedAt: "2026-10-01T00:00:00Z" }));
  const c = videoToProject(video("c", "FAILED", { topic: "cherry", updatedAt: "2026-10-02T00:00:00Z", createdAt: "2026-09-01T00:00:00Z" }));

  it("sorts by recent update by default", () => {
    expect(sortProjects([a, b, c]).map((p) => p.id)).toEqual(["a", "c", "b"]);
  });

  it("sorts titles without regard to case", () => {
    expect(sortProjects([a, b, c], "title").map((p) => p.id)).toEqual(["b", "a", "c"]);
  });

  it("puts active work first when sorting by status", () => {
    expect(sortProjects([a, b, c], "status").map((p) => p.id)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate its input", () => {
    const input = [a, b, c];
    sortProjects(input, "title");
    expect(input.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
});
