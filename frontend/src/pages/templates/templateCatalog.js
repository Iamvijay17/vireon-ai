/**
 * The template gallery's data, derived entirely from the Remotion templates
 * package (names, descriptions, scene-type categories, the component registry
 * and one sample scene per template) - nothing is listed that the renderer
 * does not actually have, and nothing the renderer has is left out.
 *
 * `buildCatalog` takes those sources as arguments so the rules are testable
 * with small fakes; catalog.js wires in the real ones.
 */

export const SCENE_TYPES = [
  { value: "title", label: "Title" },
  { value: "content", label: "Content" },
  { value: "contentwithimage", label: "Content + image" },
  { value: "image", label: "Image" },
  { value: "podcast", label: "Podcast" },
  { value: "generative", label: "Generative" },
];

const SCENE_TYPE_LABEL = Object.fromEntries(SCENE_TYPES.map((t) => [t.value, t.label]));
export const sceneTypeLabel = (value) => SCENE_TYPE_LABEL[value] || value;

/** "001-contentwithimage" -> "contentwithimage"; the generative template has no number. */
export const sceneTypeOf = (templateId) => {
  if (templateId === "generative") return "generative";
  return String(templateId).split("-").slice(1).join("-") || "content";
};

/** Scene properties that name an image (a template that has one in its sample uses it). */
const IMAGE_KEYS = ["image", "hostImage", "guestImage"];

/**
 * Sample scenes point at stock photos on the public internet. A gallery of 40+
 * previews must not hotlink them (slow, fails offline, tells a third party
 * what you browse), so any remote image in a sample is swapped for `placeholder`.
 */
export function localiseSample(sample, placeholder) {
  const elements = { ...(sample.elements || {}) };
  for (const key of IMAGE_KEYS) {
    if (typeof elements[key] === "string" && /^https?:\/\//i.test(elements[key])) elements[key] = placeholder;
  }
  return { ...sample, elements };
}

export function buildCatalog({ names, metadata, registry, samples, placeholder }) {
  const metaById = Object.fromEntries(metadata.map((m) => [m.templateId, m]));

  return Object.keys(names).map((id) => {
    const meta = metaById[id];
    const sample = samples[id] ? localiseSample(samples[id], placeholder) : null;
    return {
      id,
      title: meta?.title || names[id].split(" (")[0],
      // Prefer the authored description; the registry's one-line name is the fallback.
      description: meta?.description || names[id],
      sceneType: sceneTypeOf(id),
      // Listed by the renderer's registry = it can render. Anything else is shown but flagged.
      available: Boolean(registry[id]),
      // Whether the sample feeds this template a picture (so a preview without one would look wrong).
      usesImage: Boolean(sample && IMAGE_KEYS.some((k) => sample.elements?.[k])),
      sample,
    };
  });
}

export function filterCatalog(catalog, { search = "", sceneType = "all" } = {}) {
  const q = search.trim().toLowerCase();
  return catalog.filter(
    (t) =>
      (sceneType === "all" || t.sceneType === sceneType) &&
      (!q || `${t.id} ${t.title} ${t.description}`.toLowerCase().includes(q))
  );
}

export function countBySceneType(catalog, search = "") {
  const base = filterCatalog(catalog, { search });
  return {
    all: base.length,
    ...Object.fromEntries(SCENE_TYPES.map((t) => [t.value, base.filter((x) => x.sceneType === t.value).length])),
  };
}
