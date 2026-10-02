import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// api.js decides at import time (PROD flag, page origin), so each case sets up
// the environment first and imports a fresh copy of the module.
const load = async (origin) => {
  vi.resetModules();
  vi.stubEnv("PROD", true);
  vi.stubGlobal("location", new URL(origin));
  return import("./api");
};

describe("resolveMediaUrl in production", () => {
  beforeEach(() => vi.unstubAllEnvs());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const stored = "http://192.168.1.7:9000/vireon-video/job-ABC12345/thumbnail.jpg";

  it("re-homes stored MinIO URLs to /media on an https origin", async () => {
    const { resolveMediaUrl } = await load("https://vireon.example.ts.net/projects");
    expect(resolveMediaUrl(stored)).toBe("https://vireon.example.ts.net/media/vireon-video/job-ABC12345/thumbnail.jpg");
  });

  it("also works when the site is opened on a non-default port (localhost:8080)", async () => {
    const { resolveMediaUrl } = await load("http://localhost:8080/projects");
    expect(resolveMediaUrl(stored)).toBe("http://localhost:8080/media/vireon-video/job-ABC12345/thumbnail.jpg");
  });

  it("re-homes loopback MinIO URLs too (what the server stores for new jobs)", async () => {
    const { resolveMediaUrl } = await load("http://localhost:8080/");
    expect(resolveMediaUrl("http://127.0.0.1:9000/vireon-video/job-X/video.mp4")).toBe(
      "http://localhost:8080/media/vireon-video/job-X/video.mp4"
    );
  });

  it("leaves non-MinIO absolute URLs alone", async () => {
    const { resolveMediaUrl } = await load("http://localhost:8080/");
    expect(resolveMediaUrl("https://cdn.example.com/a.png")).toBe("https://cdn.example.com/a.png");
  });
});
