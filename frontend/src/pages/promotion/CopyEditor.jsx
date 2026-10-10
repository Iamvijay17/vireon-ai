import { useState } from "react";
import { Sparkles, Info } from "lucide-react";
import { Textarea, Input, Label, FieldHint } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { cn } from "../../components/ui/cn";
import { parseHashtagInput, hashtagsToInput, TONES, platformLabel, PLATFORMS } from "./format";
import { PlatformTile } from "./shared";

/** "312 / 500" with the colour turning red past the limit. */
export const Counter = ({ length, limit }) => (
  <span className={cn("tabular-nums text-xs", length > limit ? "font-semibold text-danger-500" : "text-text-tertiary")}>
    {length} / {limit}
  </span>
);

/**
 * Editable copy for ONE platform: caption, hashtags, call to action, destination link.
 * Every field is manual-editable whether the text came from the local AI or was typed. The character
 * counter reflects the composed text the server measured (caption + cta + link + hashtags).
 */
export const CopyEditor = ({ platform, value, onChange, composed, disabled }) => {
  // Hashtags are typed as free text; the list is derived on every keystroke but the raw text is kept
  // locally so typing a space or "#" never jumps the caret. The parent re-keys this editor when the
  // whole copy is replaced (AI generation).
  const [tagText, setTagText] = useState(() => hashtagsToInput(value.hashtags));
  const set = (patch) => onChange({ ...value, ...patch, origin: "manual" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <PlatformTile platform={platform} size="sm" />
        <span className="text-[13px] font-semibold text-text-primary">{platformLabel(platform)} copy</span>
        {value.origin === "ai" && <Badge variant="accent" icon={<Sparkles className="size-3" />}>Written by local AI - edit freely</Badge>}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <Label className="mb-0" htmlFor={`caption-${platform}`}>{platform === "threads" ? "Post text" : "Caption"}</Label>
          {composed && <Counter length={composed.length} limit={composed.limit} />}
        </div>
        <Textarea
          id={`caption-${platform}`} rows={platform === "threads" ? 4 : 6} value={value.caption} disabled={disabled}
          onChange={(e) => set({ caption: e.target.value })}
          placeholder={platform === "threads" ? "What do you want to say?" : "Write the caption…"}
        />
        <FieldHint>
          {composed ? `Counts everything that will be sent: caption, call to action${platform === "instagram" ? "" : ", link"} and hashtags.` : "Counted by the server as you type."}
        </FieldHint>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`tags-${platform}`}>Hashtags</Label>
          <Input
            id={`tags-${platform}`} value={tagText} disabled={disabled} placeholder="#learn #javascript"
            onChange={(e) => { setTagText(e.target.value); set({ hashtags: parseHashtagInput(e.target.value) }); }}
          />
          <FieldHint>
            {composed ? `${composed.hashtagCount} hashtag${composed.hashtagCount === 1 ? "" : "s"}` : "Separate with spaces."}
            {platform === "instagram" ? " · up to 30" : platform === "threads" ? " · one topic tag works best" : ""}
          </FieldHint>
        </div>
        <div>
          <Label htmlFor={`cta-${platform}`}>Call to action</Label>
          <Input id={`cta-${platform}`} value={value.cta} disabled={disabled} placeholder="Watch the full video" onChange={(e) => set({ cta: e.target.value })} />
        </div>
      </div>

      <div>
        <Label htmlFor={`link-${platform}`}>Destination URL</Label>
        <Input id={`link-${platform}`} type="url" value={value.linkUrl} disabled={disabled} placeholder="https://…" onChange={(e) => set({ linkUrl: e.target.value })} />
        <FieldHint>
          {platform === "instagram"
            ? "Links in Instagram captions are not clickable. Put the link in your bio or a link sticker."
            : platform === "threads"
              ? "On a text post the link becomes a preview card; on a media post it is added to the text."
              : "Shown as a link preview on text posts; added to the description on videos."}
        </FieldHint>
      </div>
    </div>
  );
};

/** Tone + platforms + the Generate button. Failure never blocks: the copy can always be written by hand. */
export const AiCaptionGenerator = ({ tone, onTone, selectedPlatforms, onGenerate, generating, error, disabled }) => {
  const [only, setOnly] = useState(null); // null = all selected platforms
  const targets = only ? selectedPlatforms.filter((p) => only.includes(p)) : selectedPlatforms;
  const toggle = (p) => {
    const current = only || selectedPlatforms;
    const next = current.includes(p) ? current.filter((x) => x !== p) : [...current, p];
    setOnly(next);
  };
  return (
    <div className="space-y-3 rounded-xl border border-border-light bg-surface-hover/40 p-3.5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-40 flex-1">
          <Label>Tone</Label>
          <Select value={tone} onChange={onTone} options={TONES} disabled={disabled || generating} />
        </div>
        <Button
          variant="primary" icon={<Sparkles className="size-4" />} loading={generating} disabled={disabled || targets.length === 0}
          onClick={() => onGenerate(targets)}
        >
          Write with local AI
        </Button>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Platforms to write for">
        {PLATFORMS.filter((p) => selectedPlatforms.includes(p)).map((p) => {
          const on = targets.includes(p);
          return (
            <button
              key={p} type="button" onClick={() => toggle(p)} aria-pressed={on}
              className={cn("cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors", on ? "border-accent bg-accent-subtle text-accent" : "border-border text-text-tertiary hover:text-text-secondary")}
            >
              {platformLabel(p)}
            </button>
          );
        })}
      </div>
      <p className="flex items-start gap-1.5 text-xs text-text-tertiary">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        Runs on this computer&apos;s local AI - no paid service. It writes a different version per platform; replace anything it writes.
      </p>
      {error && (
        <Alert type="warning" title="The local AI could not write captions">
          {error} You can write them by hand below - nothing else is blocked.
        </Alert>
      )}
    </div>
  );
};

export default CopyEditor;
