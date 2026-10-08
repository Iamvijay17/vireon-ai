// Explicit React import: the test transform here does not apply the automatic JSX runtime
// the app build uses.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const api = vi.hoisted(() => ({
  getVideoSceneOptions: vi.fn(),
  getVideoSceneVersions: vi.fn(),
  regenerateVideoScenePart: vi.fn(),
  revertVideoScene: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
const confirm = vi.hoisted(() => vi.fn());

vi.mock("../../services/api", () => api);
vi.mock("../../components/ui/toastBus", () => ({ toast }));
vi.mock("../../components/ui/confirmBus", () => ({ confirmDialog: confirm }));

import { SceneRegenerationCard } from "./SceneRegenerationCard";

globalThis.React = React;

const options = (over = {}) => ({
  sceneId: "sce-00000001",
  sceneNumber: 3,
  status: "COMPLETED",
  allowed: { image: true, voice: true, script: true, layout: true, style: true, scene: true, revert: true },
  reason: null,
  layouts: ["stack-list", "grid"],
  currentLayout: "stack-list",
  presets: [{ id: "cinematic", label: "More cinematic", description: "x" }],
  voice: "female-1",
  activeVersion: 2,
  versionCount: 2,
  ...over,
});

const plan = { changed: ["audio"], regenerate: ["captions", "scene-composition", "render"], reusable: ["script", "image"], produce: ["audio", "captions"], stages: ["audio"] };

const mount = (props = {}) =>
  render(<SceneRegenerationCard jobId="job-aaaaaaaa" scene={{ sceneNumber: 3 }} jobStatus="COMPLETED" hasChanges={false} onQueued={vi.fn()} {...props} />);

const ready = async () => screen.findByTestId("scene-regeneration");

beforeEach(() => {
  vi.clearAllMocks();
  api.getVideoSceneOptions.mockResolvedValue({ data: options() });
  api.getVideoSceneVersions.mockResolvedValue({ data: { versions: [{ version: 2, changeType: "voice" }, { version: 1, changeType: "initial" }] } });
  api.regenerateVideoScenePart.mockResolvedValue({ data: { queued: true, plan } });
  api.revertVideoScene.mockResolvedValue({ data: { queued: true, plan } });
  confirm.mockResolvedValue(true);
});

describe("SceneRegenerationCard", () => {
  it("loads the scene's options and shows the actions", async () => {
    mount();
    await ready();
    expect(api.getVideoSceneOptions).toHaveBeenCalledWith("job-aaaaaaaa", 3);
    expect(screen.getByRole("button", { name: /Image/ }).disabled).toBe(false);
    expect(screen.getByRole("button", { name: /Voice/ }).disabled).toBe(false);
    expect(screen.getByRole("button", { name: /Scene/ }).disabled).toBe(false);
  });

  it("regenerates just the voice, reports what is rebuilt and what is reused, and hands over to the render page", async () => {
    const onQueued = vi.fn();
    mount({ onQueued });
    await ready();

    fireEvent.click(screen.getByRole("button", { name: /Voice/ }));

    await waitFor(() => expect(api.regenerateVideoScenePart).toHaveBeenCalledWith("job-aaaaaaaa", 3, { target: "voice" }));
    await waitFor(() => expect(onQueued).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/Scene 3: Rebuilding voice, caption timing, scene composition and final render\. Reusing script and image\./));
  });

  it("regenerates the picture", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /Image/ }));
    await waitFor(() => expect(api.regenerateVideoScenePart).toHaveBeenCalledWith("job-aaaaaaaa", 3, { target: "image" }));
  });

  it("asks before regenerating the whole scene, and does nothing if declined", async () => {
    confirm.mockResolvedValueOnce(false);
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /Scene/ }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(api.regenerateVideoScenePart).not.toHaveBeenCalled();

    confirm.mockResolvedValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: /Scene/ }));
    await waitFor(() => expect(api.regenerateVideoScenePart).toHaveBeenCalledWith("job-aaaaaaaa", 3, { target: "scene" }));
  });

  it("is switched off while there are unsaved edits, and says why", async () => {
    mount({ hasChanges: true });
    await ready();
    expect(screen.getByText(/Save your changes first/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Voice/ }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: /Image/ }).disabled).toBe(true);
  });

  it("switches off actions the server does not allow for this scene (no picture to redraw)", async () => {
    api.getVideoSceneOptions.mockResolvedValue({ data: options({ allowed: { image: false, voice: true, script: true, layout: true, style: true, scene: true, revert: true } }) });
    mount();
    await ready();
    expect(screen.getByRole("button", { name: /Image/ }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: /Voice/ }).disabled).toBe(false);
  });

  it("explains why nothing is on offer while the video is still being made", async () => {
    api.getVideoSceneOptions.mockResolvedValue({
      data: options({ allowed: { image: false, voice: false, script: false, layout: false, style: false, scene: false, revert: false }, reason: "The video is rendering - scenes can be regenerated once it has finished." }),
    });
    mount({ jobStatus: "RENDERING" });
    await ready();
    expect(screen.getByText(/can be regenerated once it has finished/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Voice/ }).disabled).toBe(true);
  });

  it("shows a server message as a toast when the change is refused, without leaving the page", async () => {
    api.regenerateVideoScenePart.mockRejectedValue({ friendlyMessage: "That layout cannot show this scene's content." });
    const onQueued = vi.fn();
    mount({ onQueued });
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /Voice/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("That layout cannot show this scene's content."));
    expect(onQueued).not.toHaveBeenCalled();
  });

  it("tells the user when nothing changed instead of queueing a render", async () => {
    api.regenerateVideoScenePart.mockResolvedValue({ data: { queued: false, noop: true, message: "The scene already uses that layout." } });
    const onQueued = vi.fn();
    mount({ onQueued });
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /Voice/ }));
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith("The scene already uses that layout."));
    expect(onQueued).not.toHaveBeenCalled();
  });

  it("offers to revert only to versions other than the current one", async () => {
    mount();
    await ready();
    await waitFor(() => expect(api.getVideoSceneVersions).toHaveBeenCalledWith("job-aaaaaaaa", 3));
    expect(await screen.findByText("Revert to version")).toBeTruthy();
  });

  it("does not offer layouts or looks for a scene that cannot take them", async () => {
    api.getVideoSceneOptions.mockResolvedValue({ data: options({ layouts: [], presets: [], versionCount: 1 }) });
    mount();
    await ready();
    expect(screen.queryByText("Change layout")).toBeNull();
    expect(screen.queryByText("Change the look")).toBeNull();
    expect(screen.queryByText("Revert to version")).toBeNull();
  });

  it("renders nothing if the options cannot be loaded", async () => {
    api.getVideoSceneOptions.mockRejectedValue(new Error("down"));
    const { container } = mount();
    await waitFor(() => expect(container.querySelector("[data-testid='scene-regeneration']")).toBeNull());
    await waitFor(() => expect(screen.queryByText(/Loading scene actions/)).toBeNull());
  });
});
