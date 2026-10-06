import { useQuery } from "@tanstack/react-query";
import { getVoices } from "../services/api";
import { queryKeys } from "../lib/queryClient";

const EMPTY_CATALOG = { custom: [], clone: [] };

const toOption = (description) => (v) => ({
  value: v.id,
  label: v.label,
  description,
  previewUrl: v.previewUrl,
  tags: v.tags,
  gender: v.gender,
});

/**
 * The voice catalog (custom + cloned voices) as picker options. Cached under
 * one query key, so every page that offers a voice picker shares a single
 * request instead of each fetching the catalog on mount. A failed load is
 * silent: the picker falls back to `fallbackOptions`.
 */
export function useVoiceOptions(fallbackOptions = []) {
  const { data } = useQuery({
    queryKey: queryKeys.voices.catalog,
    queryFn: async () => (await getVoices()).data || EMPTY_CATALOG,
  });
  const catalog = data || EMPTY_CATALOG;

  const voiceOptions = [...catalog.custom.map(toOption("Custom")), ...catalog.clone.map(toOption("Clone"))];
  if (voiceOptions.length === 0) voiceOptions.push(...fallbackOptions);

  return { voiceCatalog: catalog, voiceOptions };
}
