import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { templateNames } from "vireon-remotion-templates/src/templates/TemplateCategories";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { cn } from "../ui/cn";
import { SceneThumbnail } from "./SceneThumbnail";

const TEMPLATES = Object.entries(templateNames).map(([id, label]) => ({ id, label }));

/**
 * Full gallery of templates, each rendered as a live preview of the current
 * scene's own content (title/subtitle/background) so a user can compare how
 * their scene actually looks before picking one.
 */
export function TemplatePickerModal({ open, onClose, scene, value, onSelect }) {
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TEMPLATES;
    return TEMPLATES.filter((t) => t.id.toLowerCase().includes(q) || t.label.toLowerCase().includes(q));
  }, [query]);

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
                  "group relative overflow-hidden rounded-xl border text-left transition-colors",
                  isSelected ? "border-accent ring-2 ring-accent/30" : "border-border-light hover:border-border"
                )}
              >
                <div className="aspect-video w-full overflow-hidden bg-black">
                  <SceneThumbnail scene={{ ...scene, templateId: t.id }} />
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
