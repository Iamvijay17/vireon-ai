import { useState, useEffect } from "react";
import { getVoices } from "../../../services/api";
import { EMPTY_FORM, FALLBACK_VOICE_OPTIONS } from "./constants";

/**
 * The voice picker's options (custom + cloned voices from the catalog, or
 * FALLBACK_VOICE_OPTIONS if it can't be loaded) and the rule for which one a
 * new form starts on.
 */
export function useVoiceOptions() {
  const [voiceCatalog, setVoiceCatalog] = useState({ custom: [], clone: [] });

  useEffect(() => {
    let cancelled = false;
    getVoices()
      .then((res) => {
        if (!cancelled) setVoiceCatalog(res.data || { custom: [], clone: [] });
      })
      .catch(() => {
        // Keep FALLBACK_VOICE_OPTIONS if the catalog can't be loaded.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const voiceOptions = [
    ...voiceCatalog.custom.map((v) => ({ value: v.id, label: v.label, description: "Custom", previewUrl: v.previewUrl })),
    ...voiceCatalog.clone.map((v) => ({ value: v.id, label: v.label, description: "Clone", previewUrl: v.previewUrl })),
  ];
  if (voiceOptions.length === 0) voiceOptions.push(...FALLBACK_VOICE_OPTIONS);

  // Preferred voice comes from the Settings page if it's still a valid
  // option, otherwise falls back to whatever's first in the catalog.
  const pickDefaultVoice = (preferred) =>
    (preferred && voiceOptions.some((o) => o.value === preferred) ? preferred : voiceOptions[0]?.value) || EMPTY_FORM.voice;

  return { voiceOptions, pickDefaultVoice };
}
