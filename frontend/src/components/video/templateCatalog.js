import { useEffect, useState } from "react";
import { getTemplates } from "../../services/api";

// The template catalog changes rarely (a backend deploy, not per-request) and
// several components on the same Studio page need it (TemplatePickerModal's
// gallery, ContentTab/CourseVideoStudio's template-name label) - cache the
// one fetch across all of them instead of everyone re-requesting it.
let cachedPromise = null;

function fetchTemplateCatalog() {
  if (!cachedPromise) {
    cachedPromise = getTemplates()
      .then((res) => res.data.templates)
      .catch((err) => {
        cachedPromise = null; // let a later mount retry instead of caching a failure forever
        throw err;
      });
  }
  return cachedPromise;
}

/** `{ templates, templateNames }` - templateNames is an {id: label} map for quick lookups. */
export function useTemplateCatalog() {
  const [templates, setTemplates] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetchTemplateCatalog()
      .then((list) => {
        if (!cancelled) setTemplates(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const templateNames = Object.fromEntries(templates.map((t) => [t.id, t.label]));
  return { templates, templateNames };
}
