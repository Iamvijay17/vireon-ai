/**
 * Performance profiles for this machine (Ryzen 5 5600G, RTX 2060 6 GB, 16 GB RAM).
 *
 * A profile is a small set of RUNTIME knobs - how many Chrome tabs a render uses, and so on.
 * It never changes what a finished video looks like: output quality (resolution, CRF preset,
 * TTS model size) is chosen per job by the person creating it, never silently by a profile.
 * `preview` is the one profile that names lower-cost job settings, and it only advertises them
 * (`jobDefaults`) for a draft the person asks for; a final render keeps its own settings.
 *
 * Every knob carries the evidence behind its value. A knob with no measurement behind it is
 * not given a value here at all - it is listed under `unmeasured` so it is visible, not guessed.
 *
 * Pure: reads only the environment it is handed, so it is trivially testable and safe to load
 * from config. Default is `balanced`, which sets nothing: exactly the behaviour from before
 * profiles existed.
 */

// Remotion `--concurrency` sweep, scripts/benchRemotionConcurrency.js, 2026-10-20, idle machine,
// 3-scene 1080p composition, one sample per level (so differences under ~5% are noise):
//   2 -> 43.2s (+1.40 GB RAM)   4 -> 38.5s (+1.76 GB)   6 -> 38.1s (+2.08 GB)   12 -> 37.5s (+2.91 GB)
const REMOTION_SWEEP = 'Remotion --concurrency sweep 2026-10-20 (3-scene 1080p): 2=43.2s/+1.40GB, 4=38.5s/+1.76GB, 6=38.1s/+2.08GB, 12=37.5s/+2.91GB';

const PROFILES = Object.freeze({
  'low-memory': {
    description: 'Stability first: a render uses fewer Chrome tabs so it leaves RAM for the TTS and alignment processes. About 13% slower renders.',
    knobs: { remotionConcurrency: 2 },
    evidence: { remotionConcurrency: `${REMOTION_SWEEP}. 2 tabs is 13% slower than 6 and holds 0.68 GB less.` },
    unmeasured: ['alignment threads', 'TTS segment size', 'ComfyUI resolution / steps'],
  },
  balanced: {
    description: 'The default, and exactly how Vireon ran before profiles existed: nothing is overridden.',
    knobs: {},
    evidence: {},
    unmeasured: [],
  },
  throughput: {
    description: 'Renders use 4 tabs, which was within noise of the default 6 (38.5s vs 38.1s) while holding 0.32 GB less RAM - headroom for a second job\'s GPU stages if you run them alongside a render. No speed-up of its own was measured.',
    knobs: { remotionConcurrency: 4 },
    evidence: { remotionConcurrency: `${REMOTION_SWEEP}. Beyond 4 the gain is within measurement noise, so this does not raise it.` },
    unmeasured: ['cross-job overlap (TTS while another video renders)', 'TTS / ComfyUI batch size'],
  },
  preview: {
    description: 'For drafts only. Runtime knobs are unchanged; it names the cheaper per-job settings a draft can use. A final render keeps its own settings.',
    knobs: {},
    jobDefaults: { quality: 'draft', fastAudio: true },
    evidence: { jobDefaults: 'quality=draft uses CRF 28 vs 18 (config.remotion.qualityCrf); fastAudio uses the 0.6B TTS model. The time saved is measured per run by scripts/benchPipeline.js, not assumed.' },
    unmeasured: ['draft render time saving', 'fast-audio time saving'],
  },
});

const DEFAULT_PROFILE = 'balanced';

// Whole numbers only: "2.5x" or "abc" is a typo to ignore, not a value to half-parse.
const positiveInt = (v) => {
  const s = String(v ?? '').trim();
  return /^\d+$/.test(s) && Number(s) > 0 ? Number(s) : null;
};

/**
 * Resolve the active profile from the environment.
 *
 *   PERF_PROFILE            low-memory | balanced | throughput | preview  (unknown -> balanced, reported)
 *   REMOTION_CONCURRENCY    explicit value; always beats the profile
 *
 * Returns the effective knob values and, per knob, whether it came from the profile or an
 * explicit override, so nothing is silently surprising.
 */
function resolveProfile(env = process.env) {
  const requested = (env.PERF_PROFILE || '').trim().toLowerCase();
  const known = Object.prototype.hasOwnProperty.call(PROFILES, requested);
  const name = known ? requested : DEFAULT_PROFILE;
  const profile = PROFILES[name];

  const effective = {};
  const source = {};
  const explicit = positiveInt(env.REMOTION_CONCURRENCY);
  if (explicit) {
    effective.remotionConcurrency = explicit;
    source.remotionConcurrency = 'REMOTION_CONCURRENCY';
  } else if (profile.knobs.remotionConcurrency) {
    effective.remotionConcurrency = profile.knobs.remotionConcurrency;
    source.remotionConcurrency = `profile:${name}`;
  } else {
    effective.remotionConcurrency = null; // Remotion's own default (half the cores)
    source.remotionConcurrency = 'remotion-default';
  }

  return {
    name,
    requested: requested || null,
    recognised: !requested || known,
    description: profile.description,
    knobs: effective,
    source,
  };
}

/**
 * Suggest a profile from live memory readings. Advice only - nothing applies it. The thresholds
 * are engineering judgement (a render adds ~2 GB, measured), not measured optima; the reasons
 * say so.
 */
function recommendProfile({ ramFreeMb = null, ramTotalMb = null } = {}) {
  if (ramFreeMb === null) {
    return { profile: DEFAULT_PROFILE, reasons: ['Free memory could not be read, so no change is suggested.'] };
  }
  const freeGb = ramFreeMb / 1024;
  if (freeGb < 3) {
    return {
      profile: 'low-memory',
      reasons: [
        `Only ${freeGb.toFixed(1)} GB of RAM is free${ramTotalMb ? ` of ${(ramTotalMb / 1024).toFixed(1)} GB` : ''}.`,
        'A default render measured +2.1 GB RAM; fewer tabs trade about 13% render time for 0.7 GB (threshold is a judgement, not a measured limit).',
      ],
    };
  }
  return { profile: DEFAULT_PROFILE, reasons: [`${freeGb.toFixed(1)} GB of RAM is free, enough for the default render.`] };
}

/** What the API reports: every profile with its evidence, which is active, and a suggestion. */
function describeProfiles(env = process.env, memory = {}) {
  const active = resolveProfile(env);
  return {
    active,
    recommendation: recommendProfile(memory),
    profiles: Object.entries(PROFILES).map(([name, p]) => ({
      name,
      active: name === active.name,
      description: p.description,
      knobs: p.knobs,
      jobDefaults: p.jobDefaults || null,
      evidence: p.evidence,
      unmeasured: p.unmeasured,
    })),
  };
}

module.exports = { PROFILES, DEFAULT_PROFILE, resolveProfile, recommendProfile, describeProfiles };
