import { Palette } from "lucide-react";
import { TextPositionPad } from "../../components/video/TextPositionPad";
import { Select } from "../../components/ui/Select";
import { NumberInput } from "../../components/ui/Input";
import { ColorInput } from "../../components/ui/ColorInput";
import { Field, SectionLabel } from "./shared";
import { FONT_FAMILY_OPTIONS, FONT_WEIGHT_OPTIONS } from "./constants";

export const StyleTab = ({ scene, selectedSceneIndex, canEdit, editor }) => (
  <div>
    <SectionLabel icon={Palette}>Template Style</SectionLabel>
    <div className="space-y-3">
      <Field label="Text Position">
        <TextPositionPad
          positions={{
            title: scene.elements?.styleConfig?.title?.position,
            subtitle: scene.elements?.styleConfig?.subtitle?.position,
          }}
          hasSubtitle={!!(scene.subtitle || scene.elements?.subtitle)}
          onChange={(role, pos) => editor.handleElementFieldChange(selectedSceneIndex, `${role}.position`, pos)}
          onReset={(role) => editor.handleElementFieldChange(selectedSceneIndex, `${role}.position`, undefined)}
          disabled={!canEdit}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Font Family">
          <Select
            value={scene.elements?.styleConfig?.title?.fontFamily ?? FONT_FAMILY_OPTIONS[0].value}
            onChange={(v) => editor.handleTextStyleFieldChange(selectedSceneIndex, "fontFamily", v)}
            options={FONT_FAMILY_OPTIONS}
            disabled={!canEdit}
          />
        </Field>
        <Field label="Title Weight">
          <Select
            value={scene.elements?.styleConfig?.title?.fontWeight ?? 300}
            onChange={(v) => editor.handleElementFieldChange(selectedSceneIndex, "title.fontWeight", v)}
            options={FONT_WEIGHT_OPTIONS}
            disabled={!canEdit}
          />
        </Field>
      </div>
      <Field label="Title Size">
        <NumberInput
          min={24}
          max={96}
          value={scene.elements?.styleConfig?.title?.fontSize ?? ""}
          onChange={(e) => editor.handleElementFieldChange(selectedSceneIndex, "title.fontSize", Number(e.target.value))}
          disabled={!canEdit}
        />
      </Field>
      <Field label="Title Color">
        <ColorInput
          value={scene.elements?.styleConfig?.title?.color || "#ffffff"}
          onChange={(v) => editor.handleElementFieldChange(selectedSceneIndex, "title.color", v)}
          disabled={!canEdit}
        />
      </Field>
      <Field label="Subtitle Color">
        <ColorInput
          value={scene.elements?.styleConfig?.subtitle?.color || "#94a3b8"}
          onChange={(v) => editor.handleElementFieldChange(selectedSceneIndex, "subtitle.color", v)}
          disabled={!canEdit}
        />
      </Field>
      <Field label="Accent Color">
        <ColorInput
          value={scene.elements?.styleConfig?.accentColor || "#60a5fa"}
          onChange={(v) => editor.handleElementFieldChange(selectedSceneIndex, "accentColor", v)}
          disabled={!canEdit}
        />
      </Field>
      <div className="h-px bg-border-light" />
      <p className="text-[11px] font-medium text-text-tertiary">Captions</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Text Color">
          <ColorInput
            value={scene.elements?.styleConfig?.captions?.textColor || "#ffffff"}
            onChange={(v) => editor.handleElementFieldChange(selectedSceneIndex, "captions.textColor", v)}
            disabled={!canEdit}
          />
        </Field>
        <Field label="Caption Size">
          <NumberInput
            min={16}
            max={64}
            value={scene.elements?.styleConfig?.captions?.fontSize ?? ""}
            onChange={(e) => editor.handleElementFieldChange(selectedSceneIndex, "captions.fontSize", Number(e.target.value))}
            disabled={!canEdit}
          />
        </Field>
      </div>
    </div>
  </div>
);
