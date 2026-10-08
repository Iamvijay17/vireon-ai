import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import {
  getCurrentWordIndex,
  getPauseAtTime,
  getPhraseAtTime,
  getSegmentAtTime,
  normalizeSpeechTimeline,
} from "vireon-remotion-templates/src/speech/timeline";
import { getSpeechTimeline, resolveSceneAudioUrl } from "../../services/api";
import { Card, CardBody, CardHeader } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Select } from "../ui/Select";
import { Spinner } from "../ui/Spinner";
import { cn } from "../ui/cn";
import { formatSeconds, peaksFromSamples } from "../../lib/speechStages";

/**
 * Developer preview of a scene's canonical speech timeline: the same data the
 * captions, animation and scene timing read. Play the scene's audio and watch
 * the word, phrase, segment and pause under the playhead. Clicking any lane
 * seeks. The waveform is decoded from the real audio (if it cannot be decoded
 * the lane is simply absent - nothing is drawn that was not measured).
 *
 * Developer-only: the render page mounts it behind ?dev=1 (or a dev build).
 */

const LABEL_W = 72; // px, matches the w-[72px] label gutter in Track
const WAVE_BINS = 800;

/** One labelled lane. The label stays put while the time area scrolls sideways. */
const Track = ({ label, height = "h-9", width, pxPerSecond, onSeek, children, ...rest }) => (
  <div className="flex">
    <span className="sticky left-0 z-20 flex w-[72px] shrink-0 items-center bg-surface pr-2 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">{label}</span>
    <div
      className={cn("relative", height)}
      style={{ width }}
      onClick={(e) => onSeek((e.clientX - e.currentTarget.getBoundingClientRect().left) / pxPerSecond)}
      {...rest}
    >
      {children}
    </div>
  </div>
);

/** A box positioned by time on a lane that is `duration * pxPerSecond` wide. */
const Span = ({ item, pxPerSecond, className, children, title }) => (
  <div
    title={title}
    className={cn("absolute top-0.5 bottom-0.5 overflow-hidden rounded border px-1 text-[11px] leading-7 whitespace-nowrap", className)}
    style={{ left: item.start * pxPerSecond, width: Math.max(2, (item.end - item.start) * pxPerSecond) }}
  >
    {children}
  </div>
);

function useWaveform(url, enabled) {
  const [peaks, setPeaks] = useState([]);
  useEffect(() => {
    if (!enabled || !url) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        const audio = await ctx.decodeAudioData(buf);
        ctx.close?.();
        if (!cancelled) setPeaks(peaksFromSamples(audio.getChannelData(0), WAVE_BINS));
      } catch {
        if (!cancelled) setPeaks([]);
      }
    })();
    return () => { cancelled = true; };
  }, [url, enabled]);
  return peaks;
}

const SceneView = ({ jobId, scene }) => {
  const timeline = useMemo(() => normalizeSpeechTimeline(scene.timeline), [scene.timeline]);
  const audioUrl = resolveSceneAudioUrl(jobId, scene.audioFile);
  const audioRef = useRef(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pxPerSecond, setPxPerSecond] = useState(140);
  const peaks = useWaveform(audioUrl, Boolean(timeline));

  const duration = scene.timeline?.duration || scene.duration || 0;
  const width = Math.max(300, duration * pxPerSecond);

  // Follow the audio clock while playing (the <audio> element is the source of truth).
  useEffect(() => {
    if (!playing) return undefined;
    let id;
    const loop = () => {
      if (audioRef.current) setTime(audioRef.current.currentTime);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [playing]);

  const seek = (t) => {
    const clamped = Math.min(Math.max(0, t), duration);
    if (audioRef.current) audioRef.current.currentTime = clamped;
    setTime(clamped);
  };
  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    else { el.pause(); setPlaying(false); }
  };
  if (!timeline) {
    return <p className="text-sm text-text-tertiary">Scene {scene.sceneNumber} has no speech timeline (its audio was made without speech alignment).</p>;
  }

  const wordIndex = getCurrentWordIndex(timeline, time);
  const word = wordIndex >= 0 ? timeline.words[wordIndex] : null;
  const speaking = word && time < word.end ? word : null;
  const phrase = getPhraseAtTime(timeline, time);
  const segment = getSegmentAtTime(timeline, time);
  const pause = getPauseAtTime(timeline, time);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          className="flex size-9 items-center justify-center rounded-full bg-accent text-white hover:opacity-90"
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <input
          type="range" min={0} max={duration || 1} step={0.01} value={time}
          onChange={(e) => seek(parseFloat(e.target.value))}
          aria-label="Seek" className="min-w-40 flex-1"
        />
        <span className="w-28 text-right font-mono text-xs text-text-secondary">{formatSeconds(time)} / {formatSeconds(duration)}</span>
        <label className="flex items-center gap-2 text-xs text-text-tertiary">
          Zoom
          <input type="range" min={40} max={400} step={10} value={pxPerSecond} onChange={(e) => setPxPerSecond(parseInt(e.target.value, 10))} aria-label="Zoom" />
        </label>
        <audio ref={audioRef} src={audioUrl} preload="auto" onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4" aria-label="Current speech">
        {[
          ["Word", speaking ? `${speaking.text}  ${formatSeconds(speaking.start)}–${formatSeconds(speaking.end)}` : "—"],
          ["Phrase", phrase ? `${phrase.text}` : "—"],
          ["Segment", segment ? `${segment.segmentId} (${segment.granularity}-level)` : "—"],
          ["Pause", pause ? `${pause.kind} · ${pause.duration.toFixed(2)}s` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-text-tertiary">{k}</dt>
            <dd className="truncate font-medium text-text-primary" title={v}>{v}</dd>
          </div>
        ))}
      </dl>

      <div className="overflow-x-auto pb-2">
        <div className="relative flex flex-col gap-1.5" style={{ width: width + LABEL_W }}>
          <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-danger-500" style={{ left: LABEL_W + time * pxPerSecond }} />
          {(() => {
            const track = { width, pxPerSecond, onSeek: seek };
            return (
              <>
                <Track label="Time" height="h-4" {...track}>
                  {Array.from({ length: Math.floor(duration) + 1 }, (_, s) => (
                    <span key={s} className="absolute border-l border-border-light pl-0.5 text-[10px] text-text-tertiary" style={{ left: s * pxPerSecond }}>{s}s</span>
                  ))}
                </Track>

                {peaks.length > 0 && (
                  <Track label="Audio" height="h-12" {...track} aria-label="Waveform">
                    <div className="flex h-full items-center">
                      {peaks.map((p, i) => (
                        <span key={i} className="flex-1 bg-text-tertiary/50" style={{ height: `${Math.max(2, p * 100)}%` }} />
                      ))}
                    </div>
                  </Track>
                )}

                <Track label="Words" {...track} aria-label="Words">
                  {timeline.words.map((w) => (
                    <Span
                      key={w.wordId} item={w} pxPerSecond={pxPerSecond}
                      title={`${w.text}  ${w.start.toFixed(2)}-${w.end.toFixed(2)}s  confidence ${w.confidence ?? "n/a"}${w.emphasis ? "  (emphasis)" : ""}`}
                      className={cn(
                        "border-border bg-surface text-text-primary",
                        w.emphasis && "border-warning-500",
                        speaking?.wordId === w.wordId && "border-accent bg-accent/20 font-semibold"
                      )}
                    >
                      {w.text}
                    </Span>
                  ))}
                </Track>

                <Track label="Phrases" {...track} aria-label="Phrases">
                  {timeline.phrases.map((p) => (
                    <Span
                      key={p.phraseId} item={p} pxPerSecond={pxPerSecond} title={`${p.text}  ${p.start.toFixed(2)}-${p.end.toFixed(2)}s`}
                      className={cn("border-accent/30 bg-accent/10 text-text-secondary", p.emphasis && "border-warning-500 bg-warning-500/10", phrase?.phraseId === p.phraseId && "border-accent bg-accent/25")}
                    >
                      {p.text}
                    </Span>
                  ))}
                </Track>

                <Track label="Segments" {...track} aria-label="Segments">
                  {timeline.segments.map((s) => (
                    <Span
                      key={s.segmentId} item={s} pxPerSecond={pxPerSecond} title={`${s.segmentId}  ${s.granularity}-level  ${s.alignmentStatus}`}
                      className={cn("border-border bg-text-tertiary/10 text-text-secondary", s.granularity === "segment" && "border-dashed border-danger-500/60", segment?.segmentId === s.segmentId && "border-accent")}
                    >
                      {s.segmentId.split("-").pop()} · {s.granularity}
                    </Span>
                  ))}
                </Track>

                <Track label="Pauses" {...track} aria-label="Pauses">
                  {timeline.pauses.map((p) => (
                    <Span key={p.pauseId} item={p} pxPerSecond={pxPerSecond} title={`${p.kind} pause ${p.duration.toFixed(2)}s`} className={cn("border-border-light bg-text-tertiary/15 text-text-tertiary", pause?.pauseId === p.pauseId && "border-accent")}>
                      {p.duration.toFixed(2)}s
                    </Span>
                  ))}
                </Track>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

export const SpeechTimelineDebug = ({ jobId }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [sceneNumber, setSceneNumber] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getSpeechTimeline(jobId)
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        const first = res.data.scenes.find((s) => s.timeline) || res.data.scenes[0];
        setSceneNumber(first?.sceneNumber ?? null);
      })
      .catch((err) => !cancelled && setError(err.friendlyMessage || "Failed to load the speech timeline"));
    return () => { cancelled = true; };
  }, [jobId]);

  const scene = data?.scenes.find((s) => s.sceneNumber === sceneNumber);
  const t = scene?.timeline;

  return (
    <Card>
      <CardHeader
        title="Speech timing (developer)"
        subtitle="Words, phrases, segments and pauses measured from the generated narration"
        extra={
          data && (
            <>
              <Badge variant={data.alignmentEnabled ? "success" : "neutral"}>{data.alignmentEnabled ? "alignment on" : "alignment off"}</Badge>
              <Badge variant={data.drivenAnimationEnabled ? "success" : "neutral"}>{data.drivenAnimationEnabled ? "speech-driven animation on" : "speech-driven animation off"}</Badge>
            </>
          )
        }
      />
      <CardBody className="flex flex-col gap-4">
        {!data && !error && <div className="flex items-center gap-2 text-sm text-text-tertiary"><Spinner size="sm" /> Loading...</div>}
        {error && <p className="text-sm text-danger-600">{error}</p>}
        {data && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Select
                className="w-44"
                value={sceneNumber}
                onChange={setSceneNumber}
                options={data.scenes.map((s) => ({ value: s.sceneNumber, label: `Scene ${s.sceneNumber}${s.timeline ? "" : " (no timeline)"}` }))}
              />
              {t && (
                <p className="text-xs text-text-tertiary">
                  {t.alignmentStatus} · {t.granularity}-level · {t.alignmentProvider} · {t.alignmentVersion} · {t.stats.alignedWordCount}/{t.stats.wordCount} words
                  {scene.issues.length > 0 && <span className="ml-2 text-danger-600">{scene.issues.length} timing issue(s)</span>}
                </p>
              )}
            </div>
            {scene && <SceneView key={scene.sceneNumber} jobId={jobId} scene={scene} />}
            {data.scenes.length === 0 && <p className="text-sm text-text-tertiary">This video has no scenes yet.</p>}
          </>
        )}
      </CardBody>
    </Card>
  );
};

export default SpeechTimelineDebug;
