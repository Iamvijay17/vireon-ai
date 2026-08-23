import { LayoutTemplate, ListChecks, ArrowUp, ArrowDown, X, Plus } from "lucide-react";
import { templateNames } from "vireon-remotion-templates/src/templates/TemplateCategories";
import { TemplatePickerModal } from "../../components/video/TemplatePickerModal";
import { SceneThumbnail } from "../../components/video/SceneThumbnail";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { Input, Textarea, NumberInput } from "../../components/ui/Input";
import { ColorInput } from "../../components/ui/ColorInput";
import { cn } from "../../components/ui/cn";
import { Field, SectionLabel } from "./shared";
import { SCENE_TYPE_OPTIONS, ITEMS_EDITABLE_TEMPLATE_IDS } from "./constants";

export const ContentTab = ({ scene, selectedSceneIndex, canEdit, editor }) => (
  <>
    <div>
      <SectionLabel icon={LayoutTemplate}>Template</SectionLabel>
      <button
        type="button"
        onClick={() => canEdit && editor.setTemplatePickerOpen(true)}
        disabled={!canEdit}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface p-1.5 text-left transition-colors",
          "hover:border-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border"
        )}
      >
        <div className="aspect-video w-16 shrink-0 overflow-hidden rounded-md bg-black">
          <SceneThumbnail scene={scene} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-text-primary">
            {templateNames[scene.templateId] || scene.templateId || "Choose a template"}
          </p>
          <p className="text-[11px] text-text-tertiary">Click to preview &amp; choose</p>
        </div>
      </button>
      <TemplatePickerModal
        open={editor.templatePickerOpen}
        onClose={() => editor.setTemplatePickerOpen(false)}
        scene={scene}
        value={scene.templateId}
        onSelect={(id) => editor.handleTemplateSelect(selectedSceneIndex, id)}
      />
      {editor.remappingTemplate && <p className="mt-1.5 text-[11px] text-text-tertiary">Adapting scene content to the new template...</p>}
    </div>

    <div className="grid grid-cols-2 gap-3">
      <Field label="Scene Number">
        <NumberInput min={1} value={scene.sceneNumber} onChange={(e) => editor.handleFieldChange(selectedSceneIndex, "sceneNumber", Number(e.target.value))} disabled={!canEdit} />
      </Field>
      <Field label="Scene Type">
        <Select value={scene.sceneType} onChange={(v) => editor.handleFieldChange(selectedSceneIndex, "sceneType", v)} options={SCENE_TYPE_OPTIONS} disabled={!canEdit} />
      </Field>
      <Field label="Title">
        <Input
          value={scene.title || ""}
          onChange={(e) => {
            editor.handleFieldChange(selectedSceneIndex, "title", e.target.value);
            editor.handleElementDirectFieldChange(selectedSceneIndex, "title", e.target.value);
          }}
          disabled={!canEdit}
        />
      </Field>
      <Field label="Subtitle">
        <Input
          value={scene.subtitle || ""}
          onChange={(e) => {
            editor.handleFieldChange(selectedSceneIndex, "subtitle", e.target.value);
            editor.handleElementDirectFieldChange(selectedSceneIndex, "subtitle", e.target.value);
          }}
          disabled={!canEdit}
        />
      </Field>
      <Field label="Duration (seconds)">
        <NumberInput min={1} max={60} value={scene.duration} onChange={(e) => editor.handleFieldChange(selectedSceneIndex, "duration", Number(e.target.value))} disabled={!canEdit} />
      </Field>
      <Field label="Background Color">
        <ColorInput
          value={scene.backgroundColor}
          onChange={(v) => {
            editor.handleFieldChange(selectedSceneIndex, "backgroundColor", v);
            editor.handleElementDirectFieldChange(selectedSceneIndex, "backgroundColor", v);
          }}
          disabled={!canEdit}
        />
      </Field>
    </div>

    <div className="h-px bg-border-light" />

    <div>
      <SectionLabel icon={ListChecks}>Content Items</SectionLabel>
      {ITEMS_EDITABLE_TEMPLATE_IDS.includes(scene.templateId) ? (
        <div className="space-y-2.5">
          {editor.getSceneItems(scene).map((item, itemIndex) => (
            <div key={itemIndex} className="rounded-lg border border-border-light bg-surface p-2.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-medium text-text-tertiary">Item {itemIndex + 1}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => editor.handleMoveItem(selectedSceneIndex, itemIndex, -1)}
                    disabled={!canEdit || itemIndex === 0}
                    className="rounded p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary disabled:opacity-30"
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.handleMoveItem(selectedSceneIndex, itemIndex, 1)}
                    disabled={!canEdit || itemIndex === editor.getSceneItems(scene).length - 1}
                    className="rounded p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary disabled:opacity-30"
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.handleRemoveItem(selectedSceneIndex, itemIndex)}
                    disabled={!canEdit}
                    className="rounded p-1 text-text-tertiary hover:bg-danger-500/10 hover:text-danger-500 disabled:opacity-30"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {/* Falls back to older per-item field names (title/value on
                    not-yet-migrated items) for display only - onChange always
                    writes the canonical heading/text keys. */}
                <Input
                  value={item.heading ?? item.title ?? item.value ?? ""}
                  onChange={(e) => editor.handleItemFieldChange(selectedSceneIndex, itemIndex, "heading", e.target.value)}
                  disabled={!canEdit}
                  placeholder="Heading (optional)"
                />
                <Textarea
                  rows={2}
                  value={item.text ?? item.description ?? item.label ?? ""}
                  onChange={(e) => editor.handleItemFieldChange(selectedSceneIndex, itemIndex, "text", e.target.value)}
                  disabled={!canEdit}
                  placeholder="Text"
                />
              </div>
            </div>
          ))}
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus className="size-3.5" />}
            onClick={() => editor.handleAddItem(selectedSceneIndex)}
            disabled={!canEdit}
            className="w-full"
          >
            Add Item
          </Button>
        </div>
      ) : (
        <p className="text-[12px] text-text-tertiary">Content-item editing not available for this template.</p>
      )}
    </div>
  </>
);
