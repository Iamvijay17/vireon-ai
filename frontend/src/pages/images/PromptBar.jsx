import { Wand2, Loader2, Zap, Sparkles, Gem, X } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { Textarea, Input } from "../../components/ui/Input";
import { Segmented } from "./Segmented";
import { ASPECTS, COUNTS, STYLES, EXAMPLES, MAX_SEED } from "./constants";

const MAX_CHARS = 1000;

const QUALITIES = [
  { value: "fast", label: "Fast", icon: <Zap className="size-3.5" />, title: "Fewer steps: about 35s, a little less detail" },
  { value: "standard", label: "Standard", icon: <Sparkles className="size-3.5" />, title: "Full steps: about a minute, good detail" },
  { value: "high", label: "High", icon: <Gem className="size-3.5" />, title: "Extra steps: about 80s, finest detail" },
];

// A tiny caption over each control, so the bar reads without hovering anything.
const Field = ({ label, className, children }) => (
  <div className={className}>
    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">{label}</p>
    {children}
  </div>
);

// The prompt and everything that shapes the result, in one card: the prompt on
// top, the options in a wrapping row beneath, Generate at the end of it.
export const PromptBar = ({ promptRef, prompt, setPrompt, negative, setNegative, text, setText, opts, setOpt, seed, setSeed, submitting, onGenerate }) => {
  const seeded = seed !== "";
  // A pinned seed would make every image of a batch identical, so it locks the count to 1.
  const count = seeded ? 1 : opts.count;

  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !submitting) onGenerate();
  };

  const onSeedChange = (e) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 15);
    setSeed(digits && Number(digits) > MAX_SEED ? String(MAX_SEED) : digits);
  };

  return (
    // relative z-10: the Style dropdown opens downward over the gallery toolbar,
    // and the animated Card is its own stacking context - without this the
    // toolbar's positioned inputs paint on top of the open list.
    <Card className="relative z-10 animate-slide-up p-3 sm:p-4">
      <Textarea
        ref={promptRef}
        rows={3}
        aria-label="Prompt"
        value={prompt}
        maxLength={MAX_CHARS}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={onKeyDown}
        className="resize-none"
        placeholder="Describe the picture: subject, setting, lighting, style... e.g. A misty mountain valley at sunrise, golden light through the clouds, realistic photo"
      />

      <div className="mt-2.5 grid grid-cols-1 gap-x-3 gap-y-2.5 md:grid-cols-2">
        <div>
          <Input
            aria-label="Text in the picture"
            value={text}
            maxLength={240}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Text in the picture (optional): exact words, e.g. FUTURE OF AI | BUILDING TOMORROW"
          />
          {text.trim() && (
            <p className="mt-1.5 text-xs text-text-tertiary">
              Line 1 is the big headline; separate up to 2 more lines with |. Short words spell best.
            </p>
          )}
        </div>
        <div>
          <Input
            aria-label="Avoid"
            value={negative}
            maxLength={500}
            onChange={(e) => setNegative(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Avoid (optional): things to leave out, e.g. blur, extra people, clutter"
          />
          {negative.trim() && (
            <p className="mt-1.5 text-xs text-warning-600 dark:text-warning-500">
              Guided mode: about 50% slower, and the whole picture can change, not just the avoided thing.
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-3">
        <Field label="Shape" className="w-full sm:w-auto">
          <Segmented label="Shape" options={ASPECTS} value={opts.aspectRatio} onChange={(v) => setOpt("aspectRatio", v)} className="sm:w-64" />
        </Field>
        <Field label="Quality" className="w-full sm:w-auto">
          <Segmented label="Quality" options={QUALITIES} value={opts.quality} onChange={(v) => setOpt("quality", v)} className="sm:w-72" />
        </Field>
        <Field label="Style" className="w-full sm:w-40">
          <Select value={opts.style} onChange={(v) => setOpt("style", v)} options={STYLES} />
        </Field>
        <Field label="Images" className="w-full sm:w-auto">
          <Segmented label="Number of images" options={COUNTS} value={count} onChange={(v) => setOpt("count", v)} disabled={seeded} className="sm:w-32" />
        </Field>
        <Field label="Seed" className="w-full sm:w-36">
          <div className="relative">
            <input
              inputMode="numeric"
              aria-label="Seed"
              value={seed}
              onChange={onSeedChange}
              placeholder="Random"
              title="Pin a seed to reproduce a picture or refine its prompt; leave empty for a random one"
              className="h-9 w-full rounded-lg border border-border bg-surface px-3 pr-8 text-sm text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-accent focus:ring-4 focus:ring-accent/10"
            />
            {seeded && (
              <button
                type="button"
                aria-label="Clear seed"
                onClick={() => setSeed("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-text-tertiary hover:text-text-primary"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </Field>

        <Button
          className="w-full sm:ml-auto sm:w-auto sm:min-w-36"
          variant="primary"
          icon={submitting ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
          disabled={submitting || prompt.trim().length < 3}
          onClick={onGenerate}
        >
          {submitting ? "Starting" : count > 1 ? `Generate ${count}` : "Generate"}
        </Button>
      </div>

      {prompt.trim() === "" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-tertiary">Try:</span>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setPrompt(example);
                promptRef.current?.focus();
              }}
              className="max-w-full cursor-pointer truncate rounded-full border border-border-light px-2.5 py-1 text-xs text-text-secondary transition-colors hover:border-border hover:bg-surface-hover"
            >
              {example.split(",")[0]}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2.5 text-xs text-text-tertiary">
          About a minute per image (~35s Fast, ~80s High). Several images render one after another. Ctrl+Enter generates. Pictures have no text unless you fill "Text in the picture" - AI invents garbled words otherwise.
        </p>
      )}
    </Card>
  );
};

export default PromptBar;
