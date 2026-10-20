import { describe, it, expect } from "vitest";
import { buildCatalog, filterCatalog, countBySceneType, sceneTypeOf, localiseSample } from "./templateCatalog";

const PLACEHOLDER = "data:image/svg+xml;placeholder";

const sources = {
  names: {
    generative: "Generative (Auto) - procedurally varied layout",
    "001-title": "Title (title + subtitle)",
    "002-contentwithimage": "Content + Image - Image Card (badge overlaid)",
    "003-content": "Content - Timeline (numbered steps)",
    "004-content": "Content - Not in the registry",
  },
  metadata: [
    { templateId: "001-title", title: "Title", description: "Centered title and subtitle." },
    { templateId: "generative", title: "Generative (Auto)", description: "Procedural layout." },
  ],
  registry: { generative: {}, "001-title": {}, "002-contentwithimage": {}, "003-content": {} },
  samples: {
    "001-title": { templateId: "001-title", elements: { title: "T", image: "https://images.example.com/a.jpg" }, duration: 8 },
    "002-contentwithimage": { templateId: "002-contentwithimage", elements: { title: "C", image: "https://images.example.com/b.jpg" }, duration: 8 },
    "003-content": { templateId: "003-content", elements: { title: "C", items: [] }, duration: 8 },
  },
  placeholder: PLACEHOLDER,
};

describe("sceneTypeOf", () => {
  it("reads the type from the id, and knows the generative template", () => {
    expect(sceneTypeOf("001-title")).toBe("title");
    expect(sceneTypeOf("002-contentwithimage")).toBe("contentwithimage");
    expect(sceneTypeOf("generative")).toBe("generative");
  });
});

describe("localiseSample", () => {
  it("replaces remote images with the local placeholder and leaves everything else alone", () => {
    const out = localiseSample({ elements: { title: "T", image: "https://x/y.jpg", hostImage: "" } }, PLACEHOLDER);
    expect(out.elements.image).toBe(PLACEHOLDER);
    expect(out.elements.hostImage).toBe("");
    expect(out.elements.title).toBe("T");
  });

  it("does not mutate the source sample", () => {
    const sample = { elements: { image: "https://x/y.jpg" } };
    localiseSample(sample, PLACEHOLDER);
    expect(sample.elements.image).toBe("https://x/y.jpg");
  });
});

describe("buildCatalog", () => {
  const catalog = buildCatalog(sources);
  const byId = Object.fromEntries(catalog.map((t) => [t.id, t]));

  it("lists every named template, with the authored description when there is one", () => {
    expect(catalog).toHaveLength(5);
    expect(byId["001-title"].description).toBe("Centered title and subtitle.");
    expect(byId["003-content"].description).toBe("Content - Timeline (numbered steps)");
  });

  it("flags a template the renderer's registry does not have as unavailable", () => {
    expect(byId["004-content"].available).toBe(false);
    expect(byId["001-title"].available).toBe(true);
  });

  it("notes which templates are fed a picture, using the local placeholder", () => {
    expect(byId["001-title"].usesImage).toBe(true);
    expect(byId["001-title"].sample.elements.image).toBe(PLACEHOLDER);
    expect(byId["003-content"].usesImage).toBe(false);
  });

  it("has no sample for a template that ships none (previews are then unavailable)", () => {
    expect(byId.generative.sample).toBeNull();
  });
});

describe("filtering", () => {
  const catalog = buildCatalog(sources);

  it("narrows by scene type and by text across id, title and description", () => {
    expect(filterCatalog(catalog, { sceneType: "title" }).map((t) => t.id)).toEqual(["001-title"]);
    expect(filterCatalog(catalog, { search: "timeline" }).map((t) => t.id)).toEqual(["003-content"]);
    expect(filterCatalog(catalog, { search: "002" }).map((t) => t.id)).toEqual(["002-contentwithimage"]);
  });

  it("counts per scene type against the current search", () => {
    const counts = countBySceneType(catalog);
    expect(counts.all).toBe(5);
    expect(counts.content).toBe(2);
    expect(counts.generative).toBe(1);
    expect(countBySceneType(catalog, "title").all).toBe(1);
  });
});
