import { useMemo, useState } from "react";
import { Player } from "@remotion/player";
import { Check, Copy } from "lucide-react";
import { VideoComposition } from "vireon-remotion-templates/src/VideoComposition";
import { FPS } from "vireon-remotion-templates/src/calculateVideoMetadata";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { sceneTypeLabel } from "./templateCatalog";

// Preview canvases: the same shapes the Create Video page can produce.
const CANVASES = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};
const CANVAS_OPTIONS = Object.keys(CANVASES).map((value) => ({ value, label: value }));

/**
 * Full-size, playable preview of one template with its sample content. The
 * canvas switch renders the same composition at each output shape, so how a
 * template behaves in a vertical or square video is something you can see,
 * not something this page claims.
 */
export function TemplatePreviewModal({ template, onClose }) {
  const [canvas, setCanvas] = useState("16:9");
  const [copied, setCopied] = useState(false);
  const sample = template?.sample;
  const inputProps = useMemo(() => (sample ? { assets: { scenes: [sample] }, jobId: `preview-${template.id}` } : null), [sample, template]);

  if (!template) return null;
  const { width, height } = CANVASES[canvas];

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(template.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked; the id is selectable in the dialog.
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={template.title}
      description={template.description}
      width="2xl"
      footer={
        <>
          <Button variant="secondary" size="sm" icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} onClick={copyId}>
            {copied ? "Copied" : "Copy template ID"}
          </Button>
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral" className="font-mono">
            {template.id}
          </Badge>
          <Badge variant="accent">{sceneTypeLabel(template.sceneType)}</Badge>
          <Badge variant={template.available ? "success" : "danger"}>{template.available ? "Available" : "Not in the renderer"}</Badge>
          <div className="ml-auto">
            <SegmentedControl aria-label="Preview canvas" size="sm" value={canvas} onChange={setCanvas} options={CANVAS_OPTIONS} />
          </div>
        </div>

        {inputProps && template.available ? (
          <div className="mx-auto flex justify-center rounded-lg bg-black p-2">
            <Player
              key={canvas}
              component={VideoComposition}
              inputProps={inputProps}
              compositionWidth={width}
              compositionHeight={height}
              durationInFrames={Math.max(Math.round((sample.duration || 8) * FPS), 1)}
              fps={FPS}
              // Open on the settled frame: at frame 0 most templates have not animated their text in yet.
              initialFrame={Math.min(Math.round(FPS * 1.5), Math.max(Math.round((sample.duration || 8) * FPS) - 1, 0))}
              controls
              loop
              clickToPlay
              style={{ width: "100%", maxWidth: canvas === "9:16" ? 300 : canvas === "4:5" ? 420 : canvas === "1:1" ? 480 : "100%", maxHeight: "62vh" }}
            />
          </div>
        ) : (
          <p className="rounded-lg border border-border bg-surface-hover p-4 text-center text-xs text-text-tertiary">
            {template.available ? "This template ships no sample content, so there is nothing to preview." : "The renderer has no component registered for this template, so it cannot be previewed or used."}
          </p>
        )}

        <p className="text-xs leading-relaxed text-text-tertiary">
          Shown with sample text{template.usesImage ? " and a stand-in picture" : ""}. In a real video the scene supplies its own content. Templates are chosen per scene in a
          project&rsquo;s editor (Studio), or left to the AI director, which picks and varies them for you.
        </p>
      </div>
    </Modal>
  );
}

export default TemplatePreviewModal;
