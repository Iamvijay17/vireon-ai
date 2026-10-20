/**
 * Pure analysis over a finished pipeline run's per-stage record. No I/O.
 *
 * Input stages are the shape the stage tracker persists (`VideoJob.stages`):
 *   { audio: { status, durationMs, reused, attempt, resources: { vram, ram, cpu } }, ... }
 *
 * Everything reported is either arithmetic over those measurements or an explicit hypothesis
 * labelled as one. Nothing here estimates a time or a memory figure.
 */

const STAGE_LABELS = {
  script: 'Script (Ollama)',
  audio: 'Narration (Qwen3-TTS)',
  images: 'Images (ComfyUI)',
  assets: 'Asset preparation',
  render: 'Render (Remotion)',
  upload: 'Upload (MinIO)',
};
const STAGE_ORDER = Object.keys(STAGE_LABELS);

const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/** Stages that actually did work, slowest first, each with its share of the active total. */
function rankStages(stages = {}) {
  const worked = STAGE_ORDER
    .map((key) => ({ key, label: STAGE_LABELS[key], ...stages[key] }))
    .filter((s) => finite(s.durationMs) && !s.reused);
  const total = worked.reduce((n, s) => n + s.durationMs, 0);
  return worked
    .map((s) => ({
      key: s.key,
      label: s.label,
      durationMs: s.durationMs,
      sharePct: pct(s.durationMs, total),
      attempts: s.attempt ?? null,
      resources: s.resources ?? null,
    }))
    .sort((a, b) => b.durationMs - a.durationMs);
}

const activeMs = (stages) => rankStages(stages).reduce((n, s) => n + s.durationMs, 0);

/**
 * Where did the time go and what is worth trying next. `workload` carries what the run
 * processed ({ scenes, audioSeconds, images }) so the explanation can quote real ratios.
 */
function findBottleneck(stages, workload = {}) {
  const ranked = rankStages(stages);
  if (ranked.length === 0) {
    return { stage: null, explanation: 'No stage did measurable work in this run (everything was reused or nothing ran).', facts: [], nextExperiment: null };
  }
  const top = ranked[0];
  const facts = [`${top.label} took ${(top.durationMs / 1000).toFixed(1)}s, ${top.sharePct}% of active time.`];

  const vram = top.resources?.vram;
  if (vram) {
    const headroom = vram.totalMb - vram.peakUsedMb;
    facts.push(`GPU memory peaked at ${vram.peakUsedMb} of ${vram.totalMb} MiB (${headroom} MiB headroom; ${vram.startUsedMb} MiB was already in use when the stage began).`);
  } else if (top.resources) {
    facts.push('GPU memory was not measured for this stage (nvidia-smi unavailable).');
  }
  const cpu = top.resources?.cpu;
  if (cpu) facts.push(`CPU averaged ${cpu.avgPct}% and peaked at ${cpu.peakPct}%.`);
  if (top.attempts > 1) facts.push(`The stage ran ${top.attempts} times; retries are included in its duration.`);

  let nextExperiment = null;
  if (top.key === 'audio') {
    if (finite(workload.audioSeconds) && workload.audioSeconds > 0) {
      facts.push(`Narration ran at ${(top.durationMs / 1000 / workload.audioSeconds).toFixed(2)}x real time (${workload.audioSeconds.toFixed(0)}s of audio).`);
    }
    nextExperiment = 'Check how many scenes came from the TTS cache; then compare the fast 0.6B model (draft quality) and segment size against this baseline with benchPipeline.';
  } else if (top.key === 'images') {
    nextExperiment = 'Check the image cache hit rate and the ComfyUI step count / resolution; trial a lower-cost preview image pass against this baseline.';
  } else if (top.key === 'render') {
    nextExperiment = cpu && cpu.avgPct >= 80
      ? 'The render is CPU-saturated; more Remotion concurrency will not help. Compare a lower draft quality for previews only.'
      : 'CPU was not saturated; benchmark REMOTION_CONCURRENCY upward with benchRemotionConcurrency.js.';
  } else if (top.key === 'script') {
    nextExperiment = 'Compare Ollama model size / num_ctx; check whether the model was already loaded (OLLAMA_KEEP_ALIVE).';
  }
  return { stage: top.key, label: top.label, sharePct: top.sharePct, explanation: facts[0], facts, nextExperiment };
}

/** Peak memory over every stage of a run, null where nothing was measured. */
function peakResources(stages = {}) {
  let vram = null;
  let ram = null;
  for (const key of STAGE_ORDER) {
    const r = stages[key]?.resources;
    if (r?.vram && (!vram || r.vram.peakUsedMb > vram.peakUsedMb)) vram = { ...r.vram, stage: key };
    if (r?.ram && (!ram || r.ram.peakUsedMb > ram.peakUsedMb)) ram = { ...r.ram, stage: key };
  }
  return { vram, ram };
}

/**
 * Before/after. Runs are only directly comparable when they processed a similar workload;
 * the LLM writes a different script each time, so the comparison also reports per-scene and
 * per-audio-second figures and says plainly when the workloads differ.
 */
function compareRuns(before, after) {
  const bScenes = before.workload?.scenes;
  const aScenes = after.workload?.scenes;
  const sceneRatio = finite(bScenes) && finite(aScenes) && bScenes > 0 ? aScenes / bScenes : null;
  const comparable = sceneRatio !== null && sceneRatio >= 0.75 && sceneRatio <= 1.34;

  const rows = STAGE_ORDER.map((key) => {
    const b = before.stages?.[key];
    const a = after.stages?.[key];
    const bMs = b && !b.reused && finite(b.durationMs) ? b.durationMs : null;
    const aMs = a && !a.reused && finite(a.durationMs) ? a.durationMs : null;
    return {
      key,
      label: STAGE_LABELS[key],
      beforeMs: bMs,
      afterMs: aMs,
      deltaMs: bMs !== null && aMs !== null ? aMs - bMs : null,
      deltaPct: bMs !== null && aMs !== null && bMs > 0 ? Math.round(((aMs - bMs) / bMs) * 1000) / 10 : null,
      beforePerSceneMs: bMs !== null && bScenes > 0 ? Math.round(bMs / bScenes) : null,
      afterPerSceneMs: aMs !== null && aScenes > 0 ? Math.round(aMs / aScenes) : null,
    };
  });

  const bTotal = before.totalMs;
  const aTotal = after.totalMs;
  const totalDeltaPct = finite(bTotal) && finite(aTotal) && bTotal > 0 ? Math.round(((aTotal - bTotal) / bTotal) * 1000) / 10 : null;
  const bPerScene = finite(bTotal) && bScenes > 0 ? bTotal / bScenes : null;
  const aPerScene = finite(aTotal) && aScenes > 0 ? aTotal / aScenes : null;
  const perScenePct = bPerScene && aPerScene ? Math.round(((aPerScene - bPerScene) / bPerScene) * 1000) / 10 : null;

  return {
    comparable,
    caveat: comparable
      ? null
      : 'The two runs processed different amounts of work (scene counts differ by more than a third or are unknown); compare the per-scene figures, not the totals.',
    totalDeltaPct,
    perSceneDeltaPct: perScenePct,
    rows,
  };
}

module.exports = { STAGE_LABELS, STAGE_ORDER, rankStages, activeMs, findBottleneck, peakResources, compareRuns };
