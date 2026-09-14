import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { cn } from "../ui/cn";
import { SceneThumbnail } from "./SceneThumbnail";
import { useTemplateCatalog } from "./templateCatalog";

/**
 * Full gallery of templates, each rendered as a live preview of the current
 * scene's own content (title/subtitle/background) so a user can compare how
 * their scene actually looks before picking one. The catalog comes from
 * `GET /api/templates` (see HyperFramesService.listTemplates) rather than an
 * npm import - it's small today (registry search only turned up real
 * full-screen-scene matches for 3 templates; see HyperFramesService.js's
 * TEMPLATE_REGISTRY doc comment for the categories still missing candidates)
 * but grows without another frontend change.
 *
 * Every thumbnail here reads the SAME shared per-job preview build
 * (ScenePreview.jsx is the only thing that calls buildStudioPreview) at this
 * scene's real `startSeconds` position, so every cell currently shows the
 * scene's actual current appearance rather than a per-candidate "what if I
 * picked this one" preview - differentiating the image per candidate would
 * mean rebuilding the shared composition per hover, which races against
 * ScenePreview's own build (see SceneThumbnail.jsx's single-writer note).
 * Picking by name still works; making the image itself differ per candidate
 * is future work once that's worth the added complexity.
 */
export function TemplatePickerModal({ open, onClose, scene, value, onSelect, videoId, startSeconds = 0 }) {
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(value);
  const { templates } = useTemplateCatalog();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => t.id.toLowerCase().includes(q) || t.label.toLowerCase().includes(q));
  }, [query, templates]);

  const handleConfirm = () => {
    if (pending) onSelect?.(pending);
    onClose?.();
  };

  return (
    <Modal open={open} onClose={onClose} title="Choose a Template" description="Preview each template with this scene's content, then select one." width="xl">
      <div className="flex flex-col gap-3">
        <Input
          icon={<Search className="size-4" />}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search templates..."
        />

        <div className="grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
          {filtered.map((t) => {
            const isSelected = pending === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setPending(t.id)}
                onDoubleClick={() => {
                  setPending(t.id);
                  onSelect?.(t.id);
                  onClose?.();
                }}
                className={cn(
                  "group relative cursor-pointer overflow-hidden rounded-xl border text-left transition-colors",
                  isSelected ? "border-accent ring-2 ring-accent/30" : "border-border-light hover:border-border"
                )}
              >
                <div className="aspect-video w-full overflow-hidden bg-black">
                  <SceneThumbnail videoId={videoId} startSeconds={startSeconds} duration={scene?.duration} />
                </div>
                <div className="flex items-center justify-between gap-1.5 bg-surface px-2 py-1.5">
                  <span className="truncate text-[11px] font-medium text-text-primary">{t.label}</span>
                  {isSelected && <Check className="size-3.5 shrink-0 text-accent" />}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full py-8 text-center text-sm text-text-tertiary">No templates match "{query}"</div>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2 border-t border-border-light pt-4">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={handleConfirm} disabled={!pending}>
          Select Template
        </Button>
      </div>
    </Modal>
  );
}

export default TemplatePickerModal;
