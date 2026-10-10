import { describe, it, expect } from "vitest";
import {
  statusMeta, isActiveStatus, isFinishedStatus, formatBytes, formatSeconds, connectResultMessage,
  parseTags, metadataToForm, formToMetadata, validateMetadataForm, mergeLive, toLocalInput, fromLocalInput, tagsLength,
} from "./format";

const form = (over = {}) => ({ ...metadataToForm({ title: "Intro", description: "d", tags: ["a"], categoryId: "27", privacyStatus: "private", madeForKids: false }), ...over });
const opts = { privacyOptions: ["private", "unlisted", "public"], schedulingAvailable: true, now: Date.parse("2026-10-10T12:00:00Z") };

describe("status helpers", () => {
  it("labels every lifecycle state and knows which are in flight", () => {
    expect(statusMeta("UPLOADING")).toMatchObject({ label: "Uploading", active: true });
    expect(statusMeta("COMPLETED").variant).toBe("success");
    expect(statusMeta("FAILED").variant).toBe("danger");
    expect(statusMeta("RETRYING").variant).toBe("warning");
    expect(statusMeta("WHAT")).toMatchObject({ label: "WHAT", active: false });
    expect(isActiveStatus("QUEUED")).toBe(true);
    expect(isActiveStatus("DRAFT")).toBe(false);
    expect(isFinishedStatus("CANCELLED")).toBe(true);
    expect(isFinishedStatus("PROCESSING")).toBe(false);
  });
});

describe("formatting", () => {
  it("formats sizes and durations", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 ** 3)).toBe("5.0 GB");
    expect(formatSeconds(75)).toBe("1:15");
    expect(formatSeconds(3900)).toBe("1h 5m");
    expect(formatSeconds(0)).toBe("");
  });

  it("explains each OAuth outcome and never leaves an unknown one blank", () => {
    expect(connectResultMessage("connected").type).toBe("success");
    expect(connectResultMessage("denied").type).toBe("warning");
    expect(connectResultMessage("state").message).toMatch(/10 minutes/);
    expect(connectResultMessage("something-new").type).toBe("error");
  });
});

describe("metadata form", () => {
  it("round-trips tags and defaults", () => {
    expect(parseTags(" js, JS ,node  js\nreact,")).toEqual(["js", "node js", "react"]);
    const f = metadataToForm({ title: "T", tags: ["a", "b"] });
    expect(f).toMatchObject({ title: "T", tags: "a, b", categoryId: "27", privacyStatus: "private", containsSyntheticMedia: true, madeForKids: false });
    expect(formToMetadata(f)).toMatchObject({ title: "T", tags: ["a", "b"], publishAt: null, privacyStatus: "private" });
  });

  it("converts local datetime values faithfully", () => {
    const iso = "2026-10-12T09:30:00.000Z";
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
    expect(toLocalInput("")).toBe("");
    expect(fromLocalInput("garbage")).toBeNull();
  });

  it("a scheduled video is sent as private with its publish time", () => {
    const m = formToMetadata(form({ privacyStatus: "public", publishAt: toLocalInput("2026-10-12T09:30:00.000Z") }));
    expect(m.privacyStatus).toBe("private");
    expect(m.publishAt).toBe("2026-10-12T09:30:00.000Z");
  });
});

describe("client-side validation (mirrors the backend limits)", () => {
  it("accepts a good form", () => {
    expect(validateMetadataForm(form(), opts)).toEqual({});
  });

  it.each([
    [{ title: "" }, "title"],
    [{ title: "x".repeat(101) }, "title"],
    [{ title: "a <b>" }, "title"],
    [{ description: "x > y" }, "description"],
    [{ description: "é".repeat(2600) }, "description"],
    [{ tags: Array.from({ length: 40 }, (_, i) => `keyword-number-${i}-padding`).join(",") }, "tags"],
    [{ language: "english" }, "language"],
  ])("flags %j", (over, field) => {
    expect(Object.keys(validateMetadataForm(form(over), opts))).toContain(field);
  });

  it("counts tag length like YouTube (quotes for spaces, commas between)", () => {
    expect(tagsLength(["a", "b"])).toBe(3);
    expect(tagsLength(["two words"])).toBe(11);
  });

  it("blocks visibility the unverified project cannot use, and scheduling without verification", () => {
    const locked = { ...opts, privacyOptions: ["private"], schedulingAvailable: false };
    expect(validateMetadataForm(form({ privacyStatus: "public" }), locked).privacyStatus).toMatch(/not available/);
    expect(validateMetadataForm(form({ publishAt: toLocalInput("2026-10-12T09:30:00.000Z") }), locked).publishAt).toMatch(/verified/);
  });

  it("requires a schedule at least five minutes ahead", () => {
    expect(validateMetadataForm(form({ publishAt: toLocalInput("2026-10-10T12:02:00.000Z") }), opts).publishAt).toMatch(/5 minutes/);
    expect(validateMetadataForm(form({ publishAt: toLocalInput("2026-10-11T12:00:00.000Z") }), opts)).toEqual({});
  });
});

describe("mergeLive", () => {
  const row = { _id: "pub-1", status: "UPLOADING", progress: { percent: 10 }, updatedAt: "2026-10-10T10:00:00Z", remote: { videoId: "" }, error: null };

  it("applies a newer socket summary", () => {
    const out = mergeLive(row, { status: "UPLOADING", progress: { percent: 55 }, updatedAt: "2026-10-10T10:00:05Z", remote: { videoId: "V" } });
    expect(out.progress.percent).toBe(55);
    expect(out.remote.videoId).toBe("V");
  });

  it("ignores a stale summary and passes through when there is none", () => {
    expect(mergeLive(row, { status: "QUEUED", progress: { percent: 0 }, updatedAt: "2026-10-10T09:00:00Z" })).toBe(row);
    expect(mergeLive(row, undefined)).toBe(row);
  });

  it("clears an old error when the job moves on", () => {
    const failed = { ...row, status: "FAILED", error: { code: "NETWORK" } };
    expect(mergeLive(failed, { status: "QUEUED", progress: { percent: 0 }, updatedAt: "2026-10-10T10:05:00Z", error: null }).error).toBeNull();
  });
});
