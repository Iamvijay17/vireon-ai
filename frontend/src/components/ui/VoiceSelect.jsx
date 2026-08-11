import { useState, useRef, useEffect, useMemo } from "react";
import { Check, ChevronDown, Play, Pause, Star, Search } from "lucide-react";
import { cn } from "./cn";
import { useClickOutside, useEscapeKey } from "./hooks";
import { resolveMediaUrl } from "../../services/api";

// Same dropdown as Select, but each option gets a play/pause button so the
// user can hear a sample before picking a voice. `options` is
// [{ value, label, description?, previewUrl? }] - previewUrl is optional,
// options without one just don't show a play button.
// `isFavorite`/`onToggleFavorite` are optional - pass both to show a star
// toggle per option and float favorites to the top of the list (see
// shared/useFavoriteVoices.js for the DB-backed source of truth).
export const VoiceSelect = ({
  value,
  onChange,
  options = [],
  placeholder = "Select...",
  className,
  panelClassName,
  disabled = false,
  error = false,
  isFavorite,
  onToggleFavorite,
}) => {
  const [open, setOpen] = useState(false);
  const [playingValue, setPlayingValue] = useState(null);
  const [search, setSearch] = useState("");
  const audioRef = useRef(null);
  const searchRef = useRef(null);
  const selectedRef = useRef(null);
  const ref = useClickOutside(() => setOpen(false), open);
  useEscapeKey(() => setOpen(false), open);

  const selected = options.find((o) => o.value === value);

  const sortedOptions = useMemo(() => {
    if (!isFavorite) return options;
    const favorites = options.filter((o) => isFavorite(o.value));
    const rest = options.filter((o) => !isFavorite(o.value));
    return [...favorites, ...rest];
  }, [options, isFavorite]);

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sortedOptions;
    return sortedOptions.filter((o) =>
      `${o.label} ${o.description || ""}`.toLowerCase().includes(query)
    );
  }, [sortedOptions, search]);

  // Reset the search box each time the dropdown closes, and jump the
  // currently selected voice into view (scanning 70+ clone voices to find
  // the one a Quick Pair just picked isn't obvious otherwise) plus focus
  // the search box each time it opens.
  useEffect(() => {
    if (open) {
      searchRef.current?.focus();
      selectedRef.current?.scrollIntoView({ block: "nearest" });
    } else {
      setSearch("");
    }
  }, [open]);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    const stop = () => setPlayingValue(null);
    audio.addEventListener("ended", stop);
    audio.addEventListener("pause", stop);
    return () => {
      audio.removeEventListener("ended", stop);
      audio.removeEventListener("pause", stop);
      audio.pause();
    };
  }, []);

  // Stop any preview still playing once the dropdown closes.
  useEffect(() => {
    if (!open) audioRef.current?.pause();
  }, [open]);

  const togglePreview = (e, opt) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio || !opt.previewUrl) return;

    if (playingValue === opt.value) {
      audio.pause();
      return;
    }

    audio.src = resolveMediaUrl(opt.previewUrl);
    audio.currentTime = 0;
    audio.play().catch(() => {});
    setPlayingValue(opt.value);
  };

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3",
          "text-left text-sm text-text-primary transition-colors outline-none",
          "focus:border-accent focus:ring-4 focus:ring-accent/10",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-danger-500"
        )}
      >
        <span className={cn("truncate", !selected && "text-text-tertiary")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-text-tertiary transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 mt-1.5 w-full rounded-xl border border-border bg-surface p-1.5",
            "animate-scale-in shadow-lg shadow-black/5",
            panelClassName
          )}
        >
          {options.length > 5 && (
            <div className="relative mb-1.5">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-tertiary" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="Search voices..."
                className="h-8 w-full rounded-lg border border-border bg-bg pl-8 pr-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
              />
            </div>
          )}

          <div className="max-h-56 overflow-auto">
            {options.length === 0 && (
              <div className="px-3 py-2 text-sm text-text-tertiary">No options</div>
            )}
            {options.length > 0 && filteredOptions.length === 0 && (
              <div className="px-3 py-2 text-sm text-text-tertiary">No voices match "{search}"</div>
            )}
            {filteredOptions.map((opt) => {
            const isPlaying = playingValue === opt.value;
            const favorite = isFavorite?.(opt.value);
            return (
              <button
                key={opt.value}
                ref={opt.value === value ? selectedRef : null}
                type="button"
                onClick={() => {
                  onChange?.(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                  opt.value === value
                    ? "bg-accent-subtle text-accent"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                )}
              >
                {onToggleFavorite && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={favorite ? `Unfavorite ${opt.label}` : `Favorite ${opt.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(opt.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        onToggleFavorite(opt.value);
                      }
                    }}
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full transition-colors",
                      favorite ? "text-amber-400 hover:text-amber-500" : "text-text-tertiary hover:text-amber-400"
                    )}
                  >
                    <Star className="size-3.5" fill={favorite ? "currentColor" : "none"} />
                  </span>
                )}
                {opt.previewUrl && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={isPlaying ? `Stop ${opt.label} sample` : `Play ${opt.label} sample`}
                    onClick={(e) => togglePreview(e, opt)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        togglePreview(e, opt);
                      }
                    }}
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full transition-colors",
                      isPlaying ? "bg-accent text-white" : "bg-surface-active text-text-secondary hover:bg-accent hover:text-white"
                    )}
                  >
                    {isPlaying ? <Pause className="size-3" fill="currentColor" /> : <Play className="ml-0.5 size-3" fill="currentColor" />}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">
                  {opt.label}
                  {opt.description && (
                    <span className="ml-1.5 text-xs text-text-tertiary">{opt.description}</span>
                  )}
                </span>
                {opt.value === value && <Check className="size-4 shrink-0" />}
              </button>
            );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default VoiceSelect;
