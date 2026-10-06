import { EMPTY_FORM, FALLBACK_VOICE_OPTIONS } from "./constants";
import { useVoiceOptions as useSharedVoiceOptions } from "../../../shared/useVoiceOptions";

/**
 * The voice picker's options (custom + cloned voices from the catalog, or
 * FALLBACK_VOICE_OPTIONS if it can't be loaded) and the rule for which one a
 * new form starts on.
 */
export function useVoiceOptions() {
  const { voiceOptions } = useSharedVoiceOptions(FALLBACK_VOICE_OPTIONS);

  // Preferred voice comes from the Settings page if it's still a valid
  // option, otherwise falls back to whatever's first in the catalog.
  const pickDefaultVoice = (preferred) =>
    (preferred && voiceOptions.some((o) => o.value === preferred) ? preferred : voiceOptions[0]?.value) || EMPTY_FORM.voice;

  return { voiceOptions, pickDefaultVoice };
}
