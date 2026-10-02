import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Wand2, Play, Pause, Check, Zap, UserSquare2, AlertTriangle, Sparkles,
} from "lucide-react";
import { Panel, PanelHead, Button, Divider, Skeleton } from "../ui/primitives";
import { Select, Segmented, Checkbox } from "../ui/controls";
import { cx } from "../ui/cx";
import { useApiQuery } from "../../lib/useApiQuery";
import { createVideoJob, getVoices, resolveMediaUrl } from "../../services/api";
import { toast } from "../../components/ui/toastBus";

/* ── Domain constants, mirroring backend/src/constants ─────────────────── */

const TYPES = [
  { value: "educational", label: "Educational", hint: "Explain a concept clearly" },
  { value: "marketing", label: "Marketing", hint: "Sell a product or service" },
  { value: "story", label: "Story", hint: "Narrative with a beginning and end" },
  { value: "motivational", label: "Motivational", hint: "Inspire and energise" },
  { value: "business", label: "Business", hint: "Professional and factual" },
  { value: "youtube_shorts", label: "YouTube Shorts", hint: "Vertical, under 3 minutes" },
  { value: "podcast", label: "Podcast", hint: "Two-speaker conversation" },
];

const RESOLUTIONS = [
  { value: "1920x1080", label: "1920×1080", ratio: "16:9" },
  { value: "1280x720", label: "1280×720", ratio: "16:9" },
  { value: "3840x2160", label: "3840×2160", ratio: "16:9" },
  { value: "1080x1920", label: "1080×1920", ratio: "9:16" },
  { value: "720x1280", label: "720×1280", ratio: "9:16" },
  { value: "2160x3840", label: "2160×3840", ratio: "9:16" },
  { value: "1080x1080", label: "1080×1080", ratio: "1:1" },
  { value: "1080x1350", label: "1080×1350", ratio: "4:5" },
];

const STANDARD_DURATIONS = [1, 2, 3, 4, 5, 8, 10, 15, 20, 25, 30];
const SHORTS_DURATIONS = [1, 2, 3];
const QUALITIES = [
  { value: "draft", label: "Draft" },
  { value: "standard", label: "Standard" },
  { value: "hd", label: "HD" },
];

/**
 * Create video.
 *
 * Deliberately one page, not a multi-step wizard: there are seven decisions
 * and they interact (type constrains duration and resolution), so showing
 * them together lets the form *explain* a constraint at the moment it
 * applies instead of failing at a later step.
 *
 * The backend's cross-field rules (youtube_shorts must be vertical and ≤3
 * minutes; podcast needs two voices) are enforced here too - not to replace
 * server validation, but so the user never gets bounced after submitting.
 */
export default function CreateVideo() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    topic: "",
    type: "educational",
    duration: 5,
    resolution: "1920x1080",
    quality: "standard",
    voice: "",
    hostVoice: "",
    guestVoice: "",
    fastGeneration: true,
    fastAudio: false,
    avatarEnabled: false,
  });

  const { data: voices, loading: voicesLoading } = useApiQuery(
    ["voices"],
    getVoices,
    { errorMessage: "Could not load voices", staleTime: 5 * 60_000 }
  );

  const allVoices = useMemo(
    () => [...(voices?.custom || []), ...(voices?.clone || [])],
    [voices]
  );

  const isShorts = form.type === "youtube_shorts";
  const isPodcast = form.type === "podcast";

  const durations = isShorts ? SHORTS_DURATIONS : STANDARD_DURATIONS;
  const resolutions = isShorts ? RESOLUTIONS.filter((r) => r.ratio === "9:16") : RESOLUTIONS;

  const set = (patch) =>
    setForm((prev) => {
      const next = { ...prev, ...patch };

      // Switching to Shorts can strand the form on a landscape resolution or
      // a 20-minute duration the server would reject. Correct it here, at
      // the moment of the change, rather than reporting it at submit.
      if (patch.type === "youtube_shorts") {
        if (!SHORTS_DURATIONS.includes(next.duration)) next.duration = 3;
        const ratio = RESOLUTIONS.find((r) => r.value === next.resolution)?.ratio;
        if (ratio !== "9:16") next.resolution = "1080x1920";
      }
      return next;
    });

  const errors = useMemo(() => {
    const e = {};
    const topic = form.topic.trim();
    if (topic.length > 0 && topic.length < 3) e.topic = "Give it at least 3 characters";
    if (topic.length > 500) e.topic = "Keep it under 500 characters";
    if (isPodcast) {
      if (!form.hostVoice) e.hostVoice = "Podcasts need a host voice";
      if (!form.guestVoice) e.guestVoice = "Podcasts need a guest voice";
    } else if (!form.voice) {
      e.voice = "Pick a voice";
    }
    return e;
  }, [form, isPodcast]);

  const ready = form.topic.trim().length >= 3 && Object.keys(errors).length === 0;

  const submit = async () => {
    if (!ready) return;
    setSubmitting(true);
    try {
      const payload = {
        topic: form.topic.trim(),
        type: form.type,
        duration: form.duration,
        resolution: form.resolution,
        quality: form.quality,
        fastGeneration: form.fastGeneration,
        fastAudio: form.fastAudio,
        avatarEnabled: form.avatarEnabled,
        ...(isPodcast
          ? { hostVoice: form.hostVoice, guestVoice: form.guestVoice }
          : { voice: form.voice }),
      };
      const res = await createVideoJob(payload);
      const job = res.data.job || res.data;
      toast.success("Video queued");
      // Straight to the job so the user watches the pipeline they just
      // started, rather than being returned to a list to hunt for it.
      navigate(`/v2/jobs/${job._id || job.id}`);
    } catch (err) {
      toast.error(err.friendlyMessage || "Could not create the video");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-[1180px] animate-v2-rise grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        {/* ── Topic ─────────────────────────────────────────────────────── */}
        <Panel>
          <PanelHead title="What is the video about?" subtitle="One or two sentences is plenty — the script is written from this" />
          <div className="px-5 pb-5">
            <textarea
              value={form.topic}
              onChange={(e) => set({ topic: e.target.value })}
              rows={3}
              autoFocus
              placeholder="e.g. How compound interest works, explained with everyday examples"
              className={cx(
                "w-full resize-y rounded-[var(--radius-v2-sm)] border bg-surface-2 px-3.5 py-3",
                "text-[14px] leading-relaxed text-hi placeholder:text-[var(--v2-text-3)]",
                "transition-colors focus:outline-none",
                errors.topic ? "border-[var(--color-state-fail)]" : "border-line focus:border-[var(--v2-accent)]"
              )}
            />
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-[11.5px] text-[var(--color-state-fail)]">{errors.topic || ""}</span>
              <span className="numeric text-[11.5px] text-lo">{form.topic.trim().length}/500</span>
            </div>
          </div>
        </Panel>

        {/* ── Format ────────────────────────────────────────────────────── */}
        <Panel>
          <PanelHead title="Format" />
          <Divider />
          <div className="p-5">
            <p className="label-xs mb-2.5">Type</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => set({ type: t.value })}
                  className={cx(
                    "rounded-[var(--radius-v2-md)] border p-3 text-left transition-all duration-140",
                    form.type === t.value
                      ? "border-[var(--v2-accent)] bg-accent-soft"
                      : "border-line hover:border-line-strong hover:bg-[var(--v2-hover)]"
                  )}
                >
                  <span className={cx("block text-[13px] font-medium", form.type === t.value ? "text-hi" : "text-mid")}>
                    {t.label}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-lo">{t.hint}</span>
                </button>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Length">
                <Select
                  value={String(form.duration)}
                  onChange={(v) => set({ duration: Number(v) })}
                  options={durations.map((d) => ({ value: String(d), label: `${d} min` }))}
                />
                {isShorts && <Hint>Shorts are capped at 3 minutes</Hint>}
              </Field>

              <Field label="Resolution">
                <Select
                  value={form.resolution}
                  onChange={(v) => set({ resolution: v })}
                  options={resolutions.map((r) => ({ value: r.value, label: `${r.label} · ${r.ratio}` }))}
                />
                {isShorts && <Hint>Vertical only</Hint>}
              </Field>

              <Field label="Quality">
                <Segmented value={form.quality} onChange={(v) => set({ quality: v })} options={QUALITIES} className="w-full" />
              </Field>
            </div>
          </div>
        </Panel>

        {/* ── Voice ─────────────────────────────────────────────────────── */}
        <Panel>
          <PanelHead
            title="Voice"
            subtitle={isPodcast ? "Podcasts need two distinct voices" : "Used for every scene's narration"}
          />
          <Divider />
          <div className="p-5">
            {voicesLoading ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : isPodcast ? (
              <div className="flex flex-col gap-5">
                <VoicePicker
                  label="Host" voices={allVoices} value={form.hostVoice}
                  onChange={(v) => set({ hostVoice: v })} error={errors.hostVoice}
                />
                <VoicePicker
                  label="Guest" voices={allVoices} value={form.guestVoice}
                  onChange={(v) => set({ guestVoice: v })} error={errors.guestVoice}
                  // Two speakers that sound identical defeat the format.
                  excludeId={form.hostVoice}
                />
              </div>
            ) : (
              <VoicePicker voices={allVoices} value={form.voice} onChange={(v) => set({ voice: v })} error={errors.voice} />
            )}
          </div>
        </Panel>

        {/* ── Options ───────────────────────────────────────────────────── */}
        <Panel>
          <PanelHead title="Options" />
          <Divider />
          <div className="flex flex-col gap-3.5 p-5">
            <Toggle
              icon={Zap}
              title="Generate automatically"
              hint="Runs script → voice → render without stopping. Turn off to approve the script and audio yourself."
              checked={form.fastGeneration}
              onChange={(v) => set({ fastGeneration: v })}
            />
            <Toggle
              icon={Sparkles}
              title="Fast audio"
              hint="Uses the smaller TTS model. Quicker, slightly lower quality."
              checked={form.fastAudio}
              onChange={(v) => set({ fastAudio: v })}
            />
            <Toggle
              icon={UserSquare2}
              title="Avatar overlay"
              hint="Adds a lip-synced presenter matching the chosen voice."
              checked={form.avatarEnabled}
              onChange={(v) => set({ avatarEnabled: v })}
            />
          </div>
        </Panel>
      </div>

      {/* ── Summary ─────────────────────────────────────────────────────── */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <Panel>
          <PanelHead title="Summary" />
          <Divider />
          <div className="flex flex-col gap-2.5 p-5">
            <Row label="Type" value={TYPES.find((t) => t.value === form.type)?.label} />
            <Row label="Length" value={`${form.duration} min`} />
            <Row label="Resolution" value={form.resolution.replace("x", "×")} />
            <Row label="Quality" value={QUALITIES.find((q) => q.value === form.quality)?.label} />
            <Row
              label="Voice"
              value={
                isPodcast
                  ? [form.hostVoice, form.guestVoice].filter(Boolean).map(voiceName).join(" & ") || "—"
                  : voiceName(form.voice) || "—"
              }
            />
            <Row label="Mode" value={form.fastGeneration ? "Automatic" : "Manual approval"} />
          </div>
          <Divider />
          <div className="p-5">
            <Button
              variant="solid" size="lg" className="w-full"
              disabled={!ready} loading={submitting}
              icon={<Wand2 className="size-4" />}
              onClick={submit}
            >
              Create video
            </Button>
            {!ready && (
              <p className="mt-2.5 flex items-start gap-1.5 text-[11.5px] leading-snug text-lo">
                <AlertTriangle className="mt-px size-3 shrink-0" />
                {form.topic.trim().length < 3
                  ? "Describe the video to continue"
                  : Object.values(errors)[0]}
              </p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────── */

function Field({ label, children }) {
  return (
    <div>
      <p className="label-xs mb-2">{label}</p>
      {children}
    </div>
  );
}

function Hint({ children }) {
  return <p className="mt-1.5 text-[11.5px] text-lo">{children}</p>;
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[12.5px] text-mid">{label}</span>
      <span className="truncate text-[12.5px] text-hi">{value || "—"}</span>
    </div>
  );
}

function Toggle({ icon: Icon, title, hint, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <Checkbox checked={checked} onChange={onChange} srLabel={title} className="mt-0.5" />
      <Icon className="mt-0.5 size-4 shrink-0 text-lo" />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-hi">{title}</span>
        <span className="mt-0.5 block text-[11.5px] leading-relaxed text-lo">{hint}</span>
      </span>
    </label>
  );
}

/**
 * Voice picker with inline preview.
 *
 * Playback is the point: a voice name tells you nothing, and v1 made you
 * open a separate library to hear one. Only one clip plays at a time - the
 * previous is stopped when another starts.
 */
function VoicePicker({ label, voices, value, onChange, error, excludeId }) {
  const [playing, setPlaying] = useState(null);
  const [audio, setAudio] = useState(null);

  const preview = (voice, e) => {
    e.stopPropagation();
    audio?.pause();
    if (playing === voice.id) {
      setPlaying(null);
      return;
    }
    const el = new Audio(resolveMediaUrl(voice.previewUrl));
    el.onended = () => setPlaying(null);
    el.play().catch(() => setPlaying(null));
    setAudio(el);
    setPlaying(voice.id);
  };

  const options = excludeId ? voices.filter((v) => v.id !== excludeId) : voices;

  return (
    <div>
      {label && <p className="label-xs mb-2">{label}</p>}
      <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
        {options.map((voice) => {
          const selected = value === voice.id;
          return (
            <button
              key={voice.id}
              type="button"
              onClick={() => onChange(voice.id)}
              className={cx(
                "group relative rounded-[var(--radius-v2-md)] border p-2.5 text-left transition-all duration-140",
                selected
                  ? "border-[var(--v2-accent)] bg-accent-soft"
                  : "border-line hover:border-line-strong hover:bg-[var(--v2-hover)]"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={cx("truncate text-[12.5px] font-medium", selected ? "text-hi" : "text-mid")}>
                  {voice.label}
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Preview ${voice.label}`}
                  onClick={(e) => preview(voice, e)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    preview(voice, e);
                  }}
                  className="flex size-5 shrink-0 items-center justify-center rounded-full text-lo transition-colors hover:bg-[var(--v2-active)] hover:text-hi"
                >
                  {playing === voice.id ? <Pause className="size-3" /> : <Play className="size-3" />}
                </span>
              </div>
              <span className="mt-0.5 block truncate text-[11px] text-lo">
                {voice.gender} · {voice.accent}
              </span>
              {selected && (
                <Check className="absolute top-1.5 right-1.5 size-3 text-[var(--v2-accent)]" strokeWidth={3} />
              )}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-2 text-[11.5px] text-[var(--color-state-fail)]">{error}</p>}
    </div>
  );
}

/** "custom:Aiden" / "clone:alex-foo.mp3" -> something readable. */
function voiceName(id) {
  if (!id) return "";
  return String(id)
    .replace(/^(custom|clone):/, "")
    .replace(/\.(mp3|wav)$/i, "")
    .replace(/[-_]/g, " ");
}
