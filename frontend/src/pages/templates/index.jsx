import { Suspense, lazy, useMemo, useState } from "react";
import { LayoutTemplate } from "lucide-react";
import { PageHeader, EmptyState } from "../../components";
import { Badge } from "../../components/ui/Badge";
import { SearchInput } from "../../components/ui/SearchInput";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import FilterBar from "../../components/FilterBar";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { CATALOG } from "./catalog";
import { SCENE_TYPES, filterCatalog, countBySceneType, sceneTypeLabel } from "./templateCatalog";
import { TemplateThumbnail } from "./TemplateThumbnail";

// The playable preview pulls in the full player; load it only when one is opened.
const TemplatePreviewModal = lazy(() => import("./TemplatePreviewModal"));

const TemplateCard = ({ template, onOpen }) => (
  <button
    type="button"
    onClick={() => onOpen(template)}
    className="hover-lift group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-surface text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
  >
    <div className="aspect-video w-full overflow-hidden">
      <TemplateThumbnail template={template} />
    </div>
    <div className="flex flex-1 flex-col gap-1.5 p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-[13px] font-medium leading-snug text-text-primary">{template.title}</span>
        {!template.available && (
          <Badge variant="danger" className="shrink-0">
            Unavailable
          </Badge>
        )}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-text-tertiary">{template.id}</span>
        <Badge variant="neutral">{sceneTypeLabel(template.sceneType)}</Badge>
      </div>
    </div>
  </button>
);

/**
 * Every scene template the renderer can produce, previewed with sample
 * content. This is a catalogue of what exists - read from the renderer's own
 * registry - not a picker: a template is applied to a scene in a project's
 * editor, so there is no "select" here to pretend otherwise.
 */
const TemplatesPage = () => {
  const [search, setSearch] = useState("");
  const [sceneType, setSceneType] = useState("all");
  const [open, setOpen] = useState(null);
  const debounced = useDebouncedValue(search, 150);

  const visible = useMemo(() => filterCatalog(CATALOG, { search: debounced, sceneType }), [debounced, sceneType]);
  const counts = useMemo(() => countBySceneType(CATALOG, debounced), [debounced]);
  const unavailable = CATALOG.filter((t) => !t.available).length;

  const typeOptions = [{ value: "all", label: "All" }, ...SCENE_TYPES].map((t) => ({ ...t, count: counts[t.value] }));

  return (
    <div>
      <PageHeader
        title="Templates"
        description={`${CATALOG.length} scene layouts the renderer can produce. Open one to play it with sample content and see it in each output shape.`}
        meta={unavailable > 0 && <Badge variant="danger">{unavailable} unavailable</Badge>}
      />

      <FilterBar search={<SearchInput value={search} onChange={setSearch} placeholder="Search templates" />}>
        <SegmentedControl aria-label="Filter by scene type" value={sceneType} onChange={setSceneType} options={typeOptions} />
      </FilterBar>

      {visible.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title="No templates match"
          description={debounced ? `Nothing found for “${debounced}”.` : "No templates in this category."}
          actionLabel="Clear filters"
          onAction={() => {
            setSearch("");
            setSceneType("all");
          }}
        />
      ) : (
        <>
          <p aria-live="polite" className="mb-3 text-xs text-text-tertiary">
            {visible.length} template{visible.length === 1 ? "" : "s"}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visible.map((template) => (
              <TemplateCard key={template.id} template={template} onOpen={setOpen} />
            ))}
          </div>
        </>
      )}

      {open && (
        <Suspense fallback={null}>
          <TemplatePreviewModal template={open} onClose={() => setOpen(null)} />
        </Suspense>
      )}
    </div>
  );
};

export default TemplatesPage;
