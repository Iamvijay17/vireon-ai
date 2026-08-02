import { useRef, useState, useMemo } from "react";
import { Play, Pause } from "lucide-react";
import { cn } from "./cn";

const BAR_COUNT = 46;

// Deterministic pseudo-random bar heights seeded by the src URL, so the same
// file always renders the same waveform shape. This is a visual stand-in,
// not real decoded audio data.
const seededBars = (seed, count) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const bars = [];
  for (let i = 0; i < count; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    bars.push(0.3 + ((h >>> 8) % 1000) / 1000 * 0.7);
  }
  return bars;
};

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

// Pill-shaped audio player - circular play/pause button + waveform seek bar,
// replacing the browser's default <audio controls> UI everywhere in the app.
export const AudioPlayer = ({ src, className }) => {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const bars = useMemo(() => seededBars(src || "audio", BAR_COUNT), [src]);

  // Reset playback state when the src changes, without an effect - this is
  // React's documented pattern for adjusting state during render in response
  // to a prop change (avoids the extra render an effect-based reset causes).
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setPlaying(false);
    setProgress(0);
    setDuration(0);
  }

  if (!src) return null;

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else audio.play().catch(() => {});
  };

  const seekToRatio = (ratio) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = Math.min(1, Math.max(0, ratio)) * duration;
  };

  const activeBarIndex = Math.floor(progress * BAR_COUNT);

  return (
    <div className={cn("flex items-center gap-3 rounded-full bg-success-500/10 py-1.5 pr-4 pl-1.5", className)}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => {
          const d = e.currentTarget.duration || 0;
          if (d) setProgress(e.currentTarget.currentTime / d);
        }}
      />

      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? "Pause" : "Play"}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success-500 text-white shadow-sm transition-transform hover:scale-105 active:scale-95"
      >
        {playing ? <Pause className="size-4" fill="currentColor" /> : <Play className="ml-0.5 size-4" fill="currentColor" />}
      </button>

      <div
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        tabIndex={0}
        className="flex h-8 flex-1 cursor-pointer items-center gap-[3px]"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          seekToRatio((e.clientX - rect.left) / rect.width);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") seekToRatio(progress + 0.05);
          if (e.key === "ArrowLeft") seekToRatio(progress - 0.05);
        }}
      >
        {bars.map((h, i) => (
          <span
            key={i}
            className={cn("w-[3px] shrink-0 rounded-full transition-colors", i <= activeBarIndex ? "bg-success-500" : "bg-success-500/30")}
            style={{ height: `${Math.round(h * 100)}%` }}
          />
        ))}
      </div>

      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-text-tertiary">
        {formatTime(duration ? duration * (1 - progress) : 0)}
      </span>
    </div>
  );
};

export default AudioPlayer;
