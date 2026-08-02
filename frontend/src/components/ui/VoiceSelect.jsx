import { useState, useRef, useEffect } from "react";
import { Check, ChevronDown, Play, Pause } from "lucide-react";
import { cn } from "./cn";
import { useClickOutside, useEscapeKey } from "./hooks";
import { resolveMediaUrl } from "../../services/api";

// Same dropdown as Select, but each option gets a play/pause button so the
// user can hear a sample before picking a voice. `options` is
// [{ value, label, description?, previewUrl? }] - previewUrl is optional,
// options without one just don't show a play button.
export const VoiceSelect = ({
  value,
  onChange,
  options = [],
  placeholder = "Select...",
  className,
  panelClassName,
  disabled = false,
  error = false,
}) => {
  const [open, setOpen] = useState(false);
  const [playingValue, setPlayingValue] = useState(null);
  const audioRef = useRef(null);
  const ref = useClickOutside(() => setOpen(false), open);
  useEscapeKey(() => setOpen(false), open);

  const selected = options.find((o) => o.value === value);

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
            "absolute z-50 mt-1.5 max-h-64 w-full overflow-auto rounded-xl border border-border bg-surface p-1.5",
            "animate-scale-in shadow-lg shadow-black/5",
            panelClassName
          )}
        >
          {options.length === 0 && (
            <div className="px-3 py-2 text-sm text-text-tertiary">No options</div>
          )}
          {options.map((opt) => {
            const isPlaying = playingValue === opt.value;
            return (
              <button
                key={opt.value}
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
      )}
    </div>
  );
};

export default VoiceSelect;
