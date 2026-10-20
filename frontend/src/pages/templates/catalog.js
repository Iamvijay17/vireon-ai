import { templateNames, getAllTemplateMetadata } from "vireon-remotion-templates/src/templates/TemplateCategories";
import TemplateRegistry from "vireon-remotion-templates/src/templates/TemplateRegistry";
import { sampleScenes } from "vireon-remotion-templates/src/sampleData";
import { buildCatalog } from "./templateCatalog";

// A violet-grey gradient with a soft horizon: stands in for a photo in previews.
const PLACEHOLDER_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="960" viewBox="0 0 1280 960">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4c3a9e"/><stop offset="1" stop-color="#16162b"/></linearGradient></defs>' +
      '<rect width="1280" height="960" fill="url(#g)"/>' +
      '<circle cx="940" cy="300" r="120" fill="#a78bfa" fill-opacity="0.35"/>' +
      '<path d="M0 760 L260 520 L460 680 L760 400 L1280 800 L1280 960 L0 960 Z" fill="#0d0d1c" fill-opacity="0.55"/>' +
      "</svg>"
  );

// The generative template ships no sample of its own: it lays itself out from
// whatever content it is given, so this is representative content.
const samples = {
  ...sampleScenes,
  generative: {
    templateId: "generative",
    sceneType: "content",
    elements: {
      title: "Key Takeaways",
      items: [
        { heading: "Focus:", text: "Ship the smallest version that proves the idea." },
        { heading: "Iterate:", text: "Real usage beats speculation every time." },
        { heading: "Measure:", text: "Track outcomes, not just activity." },
      ],
      backgroundColor: "#1a1a2e",
    },
    duration: 8,
  },
};

export const CATALOG = buildCatalog({
  names: templateNames,
  metadata: getAllTemplateMetadata(),
  registry: TemplateRegistry,
  samples,
  placeholder: PLACEHOLDER_IMAGE,
});
