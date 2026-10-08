// Plain-language wording for the scene regeneration plan the backend returns
// ({ changed, regenerate, reusable, produce, stages } - see
// backend/src/services/scene/dependencyGraph.js), so a click can say exactly what it
// will redo and what it will leave alone.

const LABELS = {
  script: "script",
  audio: "voice",
  captions: "caption timing",
  image: "image",
  layout: "layout",
  motion: "motion",
  transition: "transition",
  "scene-composition": "scene composition",
  render: "final render",
};

export const partLabel = (part) => LABELS[part] || part;

/** "a, b and c" - the way a sentence lists things. */
export const joinList = (items) => {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
};

/**
 * One sentence for a toast: what is being redone, and what is kept.
 *
 * `reusable` is deliberately summarised to the parts that cost something to make
 * (script, voice, caption timing, image) - "reusing layout" is noise.
 */
export const describePlan = (plan) => {
  if (!plan) return "";
  const redo = [...(plan.changed || []), ...(plan.regenerate || [])]
    // the parts a person asked to change read as "your edit", not as work
    .filter((part) => (plan.produce || []).includes(part) || (plan.regenerate || []).includes(part))
    .map(partLabel);
  const keep = (plan.reusable || []).filter((part) => ["script", "audio", "captions", "image"].includes(part)).map(partLabel);

  const rebuilt = redo.length ? `Rebuilding ${joinList([...new Set(redo)])}.` : "Rebuilding the render.";
  const reused = keep.length ? ` Reusing ${joinList(keep)}.` : "";
  return `${rebuilt}${reused}`;
};

/** A version in the revert list: "v3 (voice) - current". */
export const versionLabel = (version, activeVersion) => {
  const what = version.changeType && version.changeType !== "initial" ? ` (${version.changeType})` : version.version === 1 ? " (original)" : "";
  const current = version.version === activeVersion ? " - current" : "";
  return `v${version.version}${what}${current}`;
};
