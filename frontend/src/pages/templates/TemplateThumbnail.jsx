import { useEffect, useMemo, useRef, useState } from "react";
import { Thumbnail } from "@remotion/player";
import { LayoutTemplate } from "lucide-react";
import { VideoComposition } from "vireon-remotion-templates/src/VideoComposition";
import { FPS } from "vireon-remotion-templates/src/calculateVideoMetadata";

/**
 * A still frame of a template rendered with its sample content. Rendering a
 * Remotion composition is not free, and the gallery lists ~50 of them, so a
 * thumbnail only mounts once it scrolls near the viewport (and stays mounted
 * after, so scrolling back is instant).
 */
export function TemplateThumbnail({ template, width = 1920, height = 1080 }) {
  const ref = useRef(null);
  // Without IntersectionObserver there is nothing to wait for: mount straight away.
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const sample = template.sample;
  const inputProps = useMemo(() => (sample ? { assets: { scenes: [sample] }, jobId: `preview-${template.id}` } : null), [sample, template.id]);
  const durationInFrames = Math.max(Math.round((sample?.duration || 8) * FPS), 1);

  return (
    <div ref={ref} className="relative size-full bg-neutral-950" style={{ aspectRatio: `${width} / ${height}` }}>
      {near && inputProps ? (
        <Thumbnail
          component={VideoComposition}
          inputProps={inputProps}
          compositionWidth={width}
          compositionHeight={height}
          durationInFrames={durationInFrames}
          fps={FPS}
          // Past the entrance animation, where the content has settled.
          frameToDisplay={Math.min(Math.round(FPS * 1.5), durationInFrames - 1)}
          style={{ width: "100%", height: "100%" }}
        />
      ) : (
        <div className="flex size-full items-center justify-center text-neutral-700">
          <LayoutTemplate className="size-6" />
        </div>
      )}
    </div>
  );
}

export default TemplateThumbnail;
