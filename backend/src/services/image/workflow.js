/**
 * ComfyUI "API format" workflow templating.
 *
 * The workflow JSON lives in a file (config.imageGen.workflowPath) with
 * {{placeholders}} where per-image values go, so changing the model or the
 * pipeline (SDXL-Turbo, Flux, an upscale pass...) is an edit to that file,
 * not to code. A value that is *only* a placeholder ("{{seed}}") is replaced
 * by the value itself, keeping its type - ComfyUI rejects a seed or step
 * count sent as a string. A placeholder inside longer text is interpolated.
 */

const PLACEHOLDER = /\{\{(\w+)\}\}/g;
const WHOLE_PLACEHOLDER = /^\{\{(\w+)\}\}$/;

function lookup(params, key) {
  if (!(key in params) || params[key] === undefined || params[key] === null) {
    throw new Error(`Image workflow references {{${key}}} but no value was provided for it`);
  }
  return params[key];
}

/** Deep-copy `template`, substituting {{placeholders}} from `params`. */
function fillWorkflow(template, params) {
  if (typeof template === 'string') {
    const whole = template.match(WHOLE_PLACEHOLDER);
    if (whole) return lookup(params, whole[1]);
    return template.replace(PLACEHOLDER, (_, key) => String(lookup(params, key)));
  }
  if (Array.isArray(template)) return template.map((item) => fillWorkflow(item, params));
  if (template && typeof template === 'object') {
    return Object.fromEntries(Object.entries(template).map(([k, v]) => [k, fillWorkflow(v, params)]));
  }
  return template;
}

/** Placeholder names a template uses, e.g. to check required config up front. */
function placeholdersIn(template) {
  const found = new Set();
  const walk = (node) => {
    if (typeof node === 'string') {
      for (const m of node.matchAll(PLACEHOLDER)) found.add(m[1]);
    } else if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (node && typeof node === 'object') {
      Object.values(node).forEach(walk);
    }
  };
  walk(template);
  return found;
}

/**
 * First saved image in a ComfyUI /history entry. Prefers a real output
 * (SaveImage) over a temp preview, since previews are deleted by ComfyUI.
 */
function firstOutputImage(historyEntry) {
  const images = Object.values(historyEntry?.outputs || {}).flatMap((out) => out?.images || []);
  return images.find((img) => img.type === 'output') || images[0] || null;
}

module.exports = { fillWorkflow, placeholdersIn, firstOutputImage };
