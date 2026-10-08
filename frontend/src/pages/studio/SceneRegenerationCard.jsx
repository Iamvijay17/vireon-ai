import { useEffect, useState } from "react";
import { Image as ImageIcon, Mic, RotateCw, Sparkles, History, LayoutTemplate } from "lucide-react";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";
import {
  getVideoSceneOptions,
  getVideoSceneVersions,
  regenerateVideoScenePart,
  revertVideoScene,
} from "../../services/api";
import { SectionLabel } from "./shared";
import { describePlan, versionLabel } from "./regeneration";

const humanizeLayout = (id) => id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

/**
 * Scene-level regeneration for the selected scene: redo its picture, its voice or
 * the whole scene, change its layout, apply a look ("more cinematic"), or go back to
 * an earlier version. Each action rebuilds only what depends on it - the server
 * works that out from a dependency graph and answers with the plan, which is what the
 * toast reports. Other scenes are never regenerated.
 *
 * Acts on what is saved on the server, so it is switched off while there are
 * unsaved edits (they would be left behind when the page moves on to the render).
 */
export const SceneRegenerationCard = ({ jobId, scene, jobStatus, hasChanges, onQueued }) => {
  const sceneNumber = scene?.sceneNumber;
  const [busy, setBusy] = useState(null);
  const [layout, setLayout] = useState("");
  const [preset, setPreset] = useState("");
  const [version, setVersion] = useState("");

  // What was loaded is stored with the key it was loaded for, so a scene or status change
  // reads as "loading" until the new answer lands (and a late answer for the old key is
  // ignored) without resetting state inside the effect. A job that just finished a
  // regeneration has new options and a new version, hence the status in the key.
  const key = jobId && sceneNumber ? `${jobId}:${sceneNumber}:${jobStatus}` : null;
  const [store, setStore] = useState({ key: null, options: null, versions: [], error: false });

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await getVideoSceneOptions(jobId, sceneNumber);
        let versions = [];
        if (data.versionCount > 1) {
          const history = await getVideoSceneVersions(jobId, sceneNumber);
          versions = history.data.versions || [];
        }
        if (!cancelled) setStore({ key, options: data, versions, error: false });
      } catch {
        if (!cancelled) setStore({ key, options: null, versions: [], error: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, jobId, sceneNumber]);

  const loaded = store.key === key ? store : null;
  const options = loaded?.options || null;
  const versions = loaded?.versions || [];

  const run = async (key, action, { confirm } = {}) => {
    if (confirm && !(await confirmDialog(confirm))) return;
    setBusy(key);
    try {
      const { data } = await action();
      if (data.noop) {
        toast.info(data.message || "Nothing to change.");
        return;
      }
      toast.success(`Scene ${sceneNumber}: ${describePlan(data.plan)}`);
      onQueued?.();
    } catch (err) {
      toast.error(err.friendlyMessage || err.response?.data?.message || "That change could not be made");
    } finally {
      setBusy(null);
    }
  };

  const regenerate = (key, body, confirm) => run(key, () => regenerateVideoScenePart(jobId, sceneNumber, body), { confirm });

  if (loaded?.error) return null;
  if (!options) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-tertiary">
        <Spinner size="sm" /> Loading scene actions...
      </div>
    );
  }

  const { allowed } = options;
  const anyAllowed = Object.values(allowed).some(Boolean);
  const locked = hasChanges;
  const off = (key) => locked || !allowed[key] || (busy !== null && busy !== key);

  const layoutOptions = options.layouts.map((id) => ({
    value: id,
    label: id === options.currentLayout ? `${humanizeLayout(id)} (current)` : humanizeLayout(id),
  }));
  const presetOptions = options.presets.map((p) => ({ value: p.id, label: p.label, description: p.description }));
  const versionOptions = versions
    .filter((v) => v.version !== options.activeVersion)
    .map((v) => ({ value: String(v.version), label: versionLabel(v, options.activeVersion) }));

  return (
    <div className="border-t border-border-light pt-4" data-testid="scene-regeneration">
      <SectionLabel icon={RotateCw}>Regenerate scene {sceneNumber}</SectionLabel>

      {!anyAllowed && options.reason && <p className="mb-2 text-xs text-text-tertiary">{options.reason}</p>}
      {locked && anyAllowed && (
        <p className="mb-2 text-xs text-warning-600">Save your changes first - these actions work from what is saved.</p>
      )}

      <div className="grid grid-cols-3 gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          icon={<ImageIcon className="size-3.5" />}
          loading={busy === "image"}
          disabled={off("image")}
          onClick={() => regenerate("image", { target: "image" })}
          title="Draw a different picture from this scene's prompt"
        >
          Image
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<Mic className="size-3.5" />}
          loading={busy === "voice"}
          disabled={off("voice")}
          onClick={() => regenerate("voice", { target: "voice" })}
          title="Record this scene's narration again"
        >
          Voice
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<RotateCw className="size-3.5" />}
          loading={busy === "scene"}
          disabled={off("scene")}
          onClick={() => regenerate("scene", { target: "scene" }, {
            title: `Regenerate scene ${sceneNumber}?`,
            content: "A fresh voice and picture for this scene. Its script and layout are kept; other scenes are not touched.",
            confirmText: "Regenerate",
          })}
          title="A fresh voice and picture for this scene"
        >
          Scene
        </Button>
      </div>

      {options.layouts.length > 0 && (
        <div className="mt-3 flex items-center gap-1.5">
          <LayoutTemplate className="size-3.5 shrink-0 text-text-tertiary" />
          <Select className="min-w-0 flex-1" value={layout} onChange={setLayout} options={layoutOptions} placeholder="Change layout" disabled={off("layout")} />
          <Button
            size="sm"
            variant="primary"
            loading={busy === "layout"}
            disabled={off("layout") || !layout || layout === options.currentLayout}
            onClick={() => regenerate("layout", { target: "layout", layout })}
          >
            Apply
          </Button>
        </div>
      )}

      {options.presets.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5">
          <Sparkles className="size-3.5 shrink-0 text-text-tertiary" />
          <Select className="min-w-0 flex-1" value={preset} onChange={setPreset} options={presetOptions} placeholder="Change the look" disabled={off("style")} />
          <Button
            size="sm"
            variant="primary"
            loading={busy === "style"}
            disabled={off("style") || !preset}
            onClick={() => regenerate("style", { target: "style", preset })}
          >
            Apply
          </Button>
        </div>
      )}

      {versionOptions.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5">
          <History className="size-3.5 shrink-0 text-text-tertiary" />
          <Select className="min-w-0 flex-1" value={version} onChange={setVersion} options={versionOptions} placeholder="Revert to version" disabled={off("revert")} />
          <Button
            size="sm"
            variant="secondary"
            loading={busy === "revert"}
            disabled={off("revert") || !version}
            onClick={() => run("revert", () => revertVideoScene(jobId, sceneNumber, Number(version)), {
              confirm: {
                title: `Revert scene ${sceneNumber} to v${version}?`,
                content: "The scene returns to how it was in that version and the video is rendered again. Nothing is lost: the version you leave stays in the list.",
                confirmText: "Revert",
              },
            })}
          >
            Revert
          </Button>
        </div>
      )}

      <p className="mt-2 text-xs text-text-tertiary">Only what depends on the change is rebuilt. Other scenes are reused.</p>
    </div>
  );
};
