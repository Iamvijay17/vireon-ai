import { describe, it, expect } from "vitest";
import { ownerRoute, KIND_TABS } from "./mediaLibrary";
import { mediaKind } from "../../components/media/mediaKind";

describe("ownerRoute", () => {
  it("links a video asset to its project and studio assets to their studio", () => {
    expect(ownerRoute({ ownerType: "video", ownerId: "vid-1" })).toBe("/render?id=vid-1");
    expect(ownerRoute({ ownerType: "audio-studio", ownerId: "aud-1" })).toBe("/audio");
    expect(ownerRoute({ ownerType: "image-studio", ownerId: "img-1" })).toBe("/images");
  });

  it("has no link for orphaned assets or ones whose owner has no page", () => {
    expect(ownerRoute({ ownerType: "video", ownerId: "vid-1", orphaned: true })).toBeNull();
    expect(ownerRoute({ ownerType: "course-video", ownerId: "cv-1" })).toBeNull();
    expect(ownerRoute(null)).toBeNull();
  });
});

describe("KIND_TABS", () => {
  it("only offers categories the asset registry actually has", () => {
    expect(KIND_TABS.map((t) => t.value)).toEqual(["", "image", "render", "audio", "audio-studio"]);
  });
});

describe("mediaKind", () => {
  it("trusts the MIME type first", () => {
    expect(mediaKind({ mimeType: "video/mp4", fileName: "x.bin" })).toBe("video");
    expect(mediaKind({ mimeType: "audio/mpeg" })).toBe("audio");
    expect(mediaKind({ mimeType: "image/png" })).toBe("image");
  });

  it("falls back to the file extension, then the registry category", () => {
    expect(mediaKind({ fileName: "scene1.MP3" })).toBe("audio");
    expect(mediaKind({ fileName: "thumb.webp" })).toBe("image");
    expect(mediaKind({ fileName: "blob", category: "render" })).toBe("video");
    expect(mediaKind({ fileName: "blob", category: "audio-studio" })).toBe("audio");
  });

  it("says other when nothing identifies the file", () => {
    expect(mediaKind({ fileName: "notes.txt" })).toBe("other");
    expect(mediaKind()).toBe("other");
  });
});
