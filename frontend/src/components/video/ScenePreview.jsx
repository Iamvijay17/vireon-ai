import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { RotateCcw } from "lucide-react";
import { VideoComposition } from "vireon-remotion-templates/src/VideoComposition";
import { calculateTotalDurationInFrames, FPS } from "vireon-remotion-templates/src/calculateVideoMetadata";
import { resolveMediaUrl } from "../../services/api";

// Live, in-browser preview of a course video's scenes using the same
// Remotion composition/templates the backend renders with — no server
// render, but scene audio still plays: each scene's narration file is
// resolved to a browser-fetchable URL (same rule the per-scene audio
// list in CourseVideoEditor uses - absolute URL as-is, otherwise served
// from /public/<videoId>/audio/<file>).
const resolveScenesMedia = (scenes, audioBaseUrl) =>
  (scenes || []).map((scene) => {
    const elements = scene.elements || {};
    const audioFile = scene.audio?.file;
    const resolvedAudioFile = audioFile
      ? (/^https?:\/\//i.test(audioFile) ? audioFile : `${audioBaseUrl}/${audioFile}`)
      : undefined;
    return {
      ...scene,
      audio: resolvedAudioFile ? { ...scene.audio, file: resolvedAudioFile } : undefined,
      imageUrl: scene.imageUrl ? resolveMediaUrl(scene.imageUrl) : scene.imageUrl,
      elements: {
        ...elements,
        image: elements.image ? resolveMediaUrl(elements.image) : elements.image,
      },
    };
  });

const getSceneStartFrames = (scenes) => {
  let frame = 0;
  return (scenes || []).map((scene) => {
    const start = frame;
    frame += Math.round((scene.duration || 8) * FPS);
    return start;
  });
};

const clamp01 = (n) => Math.min(1, Math.max(0, n));

// Locates the currently-active scene's rendered frame (`VideoComposition`'s
// Scene component tags its root with `data-scene-frame`/`data-scene-number`
// - see backend/remotion/src/VideoComposition.jsx) and, within it, whichever
// title/subtitle text elements the active template marked with
// `data-style-role="title"|"subtitle"` (see the `mergeStyle(..., overrides.title)`
// retrofit across backend/remotion/src/templates/*). Both are real DOM nodes
// since @remotion/player renders the composition's actual React tree, not a
// canvas - so their live `getBoundingClientRect()` is what "drag the text
// directly" hit-tests and positions against.
const measureTextRoles = (container, sceneNumber) => {
  if (!container) return { frame: null, handles: {} };
  const frameEls = container.querySelectorAll('[data-scene-frame="true"]');
  let frameEl = null;
  frameEls.forEach((el) => {
    if (String(el.getAttribute("data-scene-number")) === String(sceneNumber)) frameEl = el;
  });
  if (!frameEl && frameEls.length) frameEl = frameEls[frameEls.length - 1];
  if (!frameEl) return { frame: null, handles: {} };

  const containerRect = container.getBoundingClientRect();
  const fRect = frameEl.getBoundingClientRect();
  const frame = {
    left: fRect.left - containerRect.left,
    top: fRect.top - containerRect.top,
    width: fRect.width,
    height: fRect.height,
  };

  const handles = {};
  ["title", "subtitle"].forEach((role) => {
    const el = frameEl.querySelector(`[data-style-role="${role}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    handles[role] = {
      left: r.left - containerRect.left,
      top: r.top - containerRect.top,
      width: r.width,
      height: r.height,
    };
  });

  return { frame, handles };
};

// `focusIndex` / `onActiveSceneChange` let a parent editor stay in sync with
// the preview: clicking a scene in an edit form seeks the player there, and
// scrubbing/playing the player updates which scene the editor highlights.
//
// `onTextPositionChange`/`onTextPositionReset`, when provided, turn on
// click-and-drag text positioning directly on the rendered preview: small
// draggable overlays track the title/subtitle's real rendered position each
// tick, and dragging one writes a normalized `{xPct, yPct}` back through the
// caller's handler (Studio wires this to `elements.styleConfig.<role>.position`
// - see `frontend/src/pages/studio/index.jsx`).
export function ScenePreview({
  scenes = [],
  focusIndex,
  onActiveSceneChange,
  hideChips = false,
  videoId,
  onTextPositionChange,
  onTextPositionReset,
}) {
  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const lastFocusRef = useRef(focusIndex);
  const [overlay, setOverlay] = useState({ frame: null, handles: {} });
  const [draggingRole, setDraggingRole] = useState(null);

  const editable = !!onTextPositionChange;

  const audioBaseUrl = videoId ? resolveMediaUrl(`/public/${videoId}/audio`) : null;
  const previewScenes = useMemo(() => resolveScenesMedia(scenes, audioBaseUrl), [scenes, audioBaseUrl]);
  const sceneStarts = useMemo(() => getSceneStartFrames(scenes), [scenes]);
  const durationInFrames = useMemo(() => calculateTotalDurationInFrames(scenes), [scenes]);
  const activeScene = scenes[activeIndex];

  const seekToScene = useCallback(
    (index) => {
      const player = playerRef.current;
      if (!player) return;
      player.pause();
      player.seekTo(sceneStarts[index] || 0);
      setActiveIndex(index);
    },
    [sceneStarts],
  );

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return undefined;

    const onFrameUpdate = (e) => {
      const frame = e.detail.frame;
      let idx = 0;
      for (let i = 0; i < sceneStarts.length; i++) {
        if (frame >= sceneStarts[i]) idx = i;
      }
      setActiveIndex(idx);
      lastFocusRef.current = idx;
      onActiveSceneChange?.(idx);
    };

    player.addEventListener("frameupdate", onFrameUpdate);
    return () => player.removeEventListener("frameupdate", onFrameUpdate);
  }, [sceneStarts, onActiveSceneChange]);

  useEffect(() => {
    if (focusIndex == null || focusIndex === lastFocusRef.current) return;
    lastFocusRef.current = focusIndex;
    seekToScene(focusIndex);
  }, [focusIndex, seekToScene]);

  // Re-measures on an interval rather than every frame - text placement is
  // static per-scene (aside from brief entrance animations), so this only
  // needs to be fresh enough to track edits and window resizes, not every
  // Remotion frame tick.
  useEffect(() => {
    if (!editable) return undefined;
    const tick = () => {
      if (dragRef.current) return; // don't fight an in-progress drag
      setOverlay(measureTextRoles(containerRef.current, activeScene?.sceneNumber));
    };
    tick();
    const id = setInterval(tick, 300);
    window.addEventListener("resize", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("resize", tick);
    };
  }, [editable, activeScene?.sceneNumber, activeScene?.elements?.styleConfig]);

  // Drag is wired imperatively (native `addEventListener` inside an effect)
  // rather than via React `onPointerDown` props: those handlers need to read
  // `containerRef`/`playerRef`/`dragRef` on every pointer event, and doing
  // that from a function reachable from render (even indirectly, e.g. a
  // `useCallback` invoked from a JSX prop) trips React Compiler's ref-safety
  // lint. Effects run after render, so ref reads there are unrestricted.
  useEffect(() => {
    if (!editable) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;

    const findFrameEl = () => {
      const frameEls = container.querySelectorAll('[data-scene-frame="true"]');
      let frameEl = null;
      frameEls.forEach((el) => {
        if (String(el.getAttribute("data-scene-number")) === String(activeScene?.sceneNumber)) frameEl = el;
      });
      if (!frameEl && frameEls.length) frameEl = frameEls[frameEls.length - 1];
      return frameEl;
    };

    const onPointerDown = (e) => {
      if (e.target.closest("[data-drag-ignore]")) return;
      const handle = e.target.closest("[data-drag-role]");
      if (!handle) return;
      const role = handle.getAttribute("data-drag-role");
      const frameEl = findFrameEl();
      if (!frameEl) return;

      e.preventDefault();
      playerRef.current?.pause();
      const fRect = frameEl.getBoundingClientRect();
      dragRef.current = { role, frame: fRect };
      setDraggingRole(role);

      const onPointerMove = (moveEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const xPct = clamp01((moveEvent.clientX - drag.frame.left) / drag.frame.width);
        const yPct = clamp01((moveEvent.clientY - drag.frame.top) / drag.frame.height);
        onTextPositionChange?.(drag.role, { xPct, yPct });
        // Optimistically track the overlay box under the cursor while the
        // template's own re-render (one React tick behind) catches up.
        setOverlay((prev) => ({
          ...prev,
          handles: {
            ...prev.handles,
            [drag.role]: prev.handles[drag.role]
              ? {
                  ...prev.handles[drag.role],
                  left: moveEvent.clientX - drag.frame.left - prev.handles[drag.role].width / 2,
                  top: moveEvent.clientY - drag.frame.top - prev.handles[drag.role].height / 2,
                }
              : prev.handles[drag.role],
          },
        }));
      };

      const onPointerUp = () => {
        dragRef.current = null;
        setDraggingRole(null);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        setOverlay(measureTextRoles(container, activeScene?.sceneNumber));
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    };

    container.addEventListener("pointerdown", onPointerDown);
    return () => container.removeEventListener("pointerdown", onPointerDown);
  }, [editable, activeScene?.sceneNumber, onTextPositionChange]);

  if (previewScenes.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div ref={containerRef} className="relative overflow-hidden rounded-lg border border-border-light bg-black">
        <Player
          ref={playerRef}
          component={VideoComposition}
          inputProps={{ assets: { scenes: previewScenes }, jobId: "preview" }}
          durationInFrames={durationInFrames}
          fps={FPS}
          compositionWidth={1920}
          compositionHeight={1080}
          style={{ width: "100%" }}
          controls
          clickToPlay
          doubleClickToFullscreen
          loop
        />

        {editable &&
          ["title", "subtitle"].map((role) => {
            const rect = overlay.handles[role];
            if (!rect) return null;
            const hasOverride = !!activeScene?.elements?.styleConfig?.[role]?.position;
            return (
              <div
                key={role}
                data-drag-role={role}
                title={`Drag to move the ${role}`}
                className={`absolute flex cursor-grab items-center justify-center rounded-md border-2 border-dashed transition-colors ${
                  draggingRole === role ? "cursor-grabbing border-accent bg-accent/10" : "border-white/40 hover:border-accent hover:bg-white/5"
                }`}
                style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, touchAction: "none" }}
              >
                <span className="pointer-events-none absolute -top-5 left-0 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium capitalize text-white">
                  {role}
                </span>
                {hasOverride && (
                  <button
                    type="button"
                    data-drag-ignore="true"
                    onClick={() => onTextPositionReset?.(role)}
                    title={`Reset ${role} to the template's default position`}
                    className="pointer-events-auto absolute -right-2 -top-2 rounded-full border border-white/40 bg-black/80 p-0.5 text-white hover:bg-black"
                  >
                    <RotateCcw className="size-3" />
                  </button>
                )}
              </div>
            );
          })}
      </div>
      {!hideChips && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {scenes.map((scene, i) => (
            <button
              key={i}
              type="button"
              onClick={() => seekToScene(i)}
              className={`shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                i === activeIndex
                  ? "border-accent bg-accent-subtle text-accent"
                  : "border-border-light text-text-tertiary hover:text-text-primary"
              }`}
            >
              Scene {scene.sceneNumber || i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
