import { useMemo, useState } from "react";
import { Play, Pause, Search, Star, Check } from "lucide-react";
import { cn } from "./cn";
import { Modal } from "./Modal";
import { resolveMediaUrl } from "../../services/api";
import { usePreviewPlayer } from "./hooks";

// Deterministic gradient (by voice id) so every card gets a distinct,
// consistent-across-sessions avatar instead of a repeated generic icon -
// there's no portrait art for these voices, so a colored initial avatar
// stands in for one, ElevenLabs-style.
const AVATAR_GRADIENTS = [
  "from-violet-500 to-indigo-500",
  "from-fuchsia-500 to-pink-500",
  "from-sky-500 to-blue-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-red-500",
  "from-cyan-500 to-sky-500",
  "from-lime-500 to-emerald-500",
];

const gradientFor = (seed) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
};

const initialsFor = (label) =>
  label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

// Card-grid voice browser (ElevenLabs-style "Voice Library"), opened as a
// Modal from a "Browse voices" affordance next to a VoiceSelect. Kept
// separate from VoiceSelect itself rather than replacing it - VoiceSelect is
// reused across the wizard/course-video forms/settings, so a compact
// in-form dropdown there stays untouched; this is purely an additional
// discovery surface that feeds a voice id back into whichever field opened it.
export const VoiceLibrary = ({ open, onClose, options = [], value, onSelect, isFavorite, onToggleFavorite }) => {
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState(null);
  const [activeGender, setActiveGender] = useState(null);
  const { playingValue, toggle } = usePreviewPlayer();

  // Most-common-first, capped - a full alphabetical dump of every tag in the
  // catalog reads as noise, not a filter bar. The search box still reaches
  // any tag not shown here.
  const MAX_VISIBLE_TAGS = 18;
  const tags = useMemo(() => {
    const counts = new Map();
    options.forEach((o) => (o.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_VISIBLE_TAGS)
      .map(([t]) => t);
  }, [options]);

  const genders = useMemo(() => {
    const set = new Set();
    options.forEach((o) => o.gender && set.add(o.gender));
    return Array.from(set).sort();
  }, [options]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return options.filter((o) => {
      if (activeTag && !(o.tags || []).includes(activeTag)) return false;
      if (activeGender && o.gender !== activeGender) return false;
      if (query && !`${o.label} ${(o.tags || []).join(" ")}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [options, search, activeTag, activeGender]);

  const handleSelect = (voiceId) => {
    onSelect?.(voiceId);
    onClose?.();
  };

  const clearFilters = () => {
    setActiveTag(null);
    setActiveGender(null);
    setSearch("");
  };

  const hasFilters = Boolean(activeTag || activeGender || search);

  return (
    <Modal open={open} onClose={onClose} title="Voice Library" description={`${options.length} voices available`} width="xl" className="max-w-3xl">
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-tertiary" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or vibe (e.g. warm, british, calm)..."
          className="h-11 w-full rounded-xl border border-border bg-bg pl-10 pr-3 text-sm text-text-primary placeholder:text-text-tertiary outline-none transition-colors focus:border-accent focus:ring-4 focus:ring-accent/10"
        />
      </div>

      {(genders.length > 0 || tags.length > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-full border border-transparent px-2.5 py-1 text-xs font-medium text-text-tertiary hover:text-danger-500"
            >
              Clear
            </button>
          )}
          {genders.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setActiveGender((prev) => (prev === g ? null : g))}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition-all",
                activeGender === g
                  ? "border-accent bg-accent text-white shadow-sm shadow-accent/25"
                  : "border-border bg-surface text-text-secondary hover:border-accent/40 hover:text-text-primary"
              )}
            >
              {g}
            </button>
          ))}
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTag((prev) => (prev === t ? null : t))}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-all",
                activeTag === t
                  ? "border-accent bg-accent-subtle text-accent"
                  : "border-border bg-surface text-text-secondary hover:border-accent/40 hover:text-text-primary"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="grid max-h-[440px] grid-cols-1 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2">
        {filtered.length === 0 && (
          <div className="col-span-full flex flex-col items-center gap-1 py-14 text-center">
            <p className="text-sm font-medium text-text-secondary">No voices match your filters</p>
            <button type="button" onClick={clearFilters} className="text-xs font-medium text-accent hover:underline">
              Clear filters
            </button>
          </div>
        )}
        {filtered.map((opt) => {
          const isPlaying = playingValue === opt.value;
          const favorite = isFavorite?.(opt.value);
          const selected = opt.value === value;
          return (
            <div
              key={opt.value}
              onClick={() => handleSelect(opt.value)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSelect(opt.value);
                }
              }}
              className={cn(
                "group relative flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 text-left transition-all",
                selected
                  ? "border-accent bg-accent-subtle ring-1 ring-accent"
                  : "border-border bg-surface hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-md"
              )}
            >
              <div className="relative shrink-0">
                <div
                  className={cn(
                    "flex size-11 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white",
                    gradientFor(opt.value)
                  )}
                >
                  {initialsFor(opt.label)}
                </div>
                {opt.previewUrl && (
                  <button
                    type="button"
                    aria-label={isPlaying ? `Stop ${opt.label} sample` : `Play ${opt.label} sample`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(opt.value, resolveMediaUrl(opt.previewUrl));
                    }}
                    className={cn(
                      "absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full border-2 border-surface shadow-sm transition-all",
                      isPlaying
                        ? "bg-accent text-white"
                        : "bg-white text-text-secondary opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-white"
                    )}
                  >
                    {isPlaying ? <Pause className="size-2.5" fill="currentColor" /> : <Play className="ml-0.5 size-2.5" fill="currentColor" />}
                  </button>
                )}
              </div>

              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-[13.5px] font-semibold text-text-primary">{opt.label}</p>
                  {opt.description && (
                    <span className="shrink-0 rounded-md bg-surface-hover px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-tertiary">
                      {opt.description}
                    </span>
                  )}
                </div>
                {(opt.tags || []).length > 0 && (
                  <p className="mt-1 truncate text-xs text-text-tertiary capitalize">{(opt.tags || []).slice(0, 3).join(" · ")}</p>
                )}
              </div>

              <div className="flex shrink-0 flex-col items-center gap-1.5 pt-0.5">
                {selected && (
                  <span className="flex size-5 items-center justify-center rounded-full bg-accent text-white">
                    <Check className="size-3" />
                  </span>
                )}
                {onToggleFavorite && (
                  <button
                    type="button"
                    aria-label={favorite ? `Unfavorite ${opt.label}` : `Favorite ${opt.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(opt.value);
                    }}
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full transition-colors",
                      favorite ? "text-amber-400 hover:text-amber-500" : "text-text-tertiary/60 hover:text-amber-400"
                    )}
                  >
                    <Star className="size-3.5" fill={favorite ? "currentColor" : "none"} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
};

export default VoiceLibrary;
