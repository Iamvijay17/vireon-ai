// Only one list audio plays at a time: when an <audio data-exclusive-audio>
// starts, every other one is paused. The 'play' event doesn't bubble, so a
// single capture-phase listener on document covers all of them. Pausing fires
// the other elements' own 'pause' events, so AudioPlayer's play/pause button
// state resets itself. Opt-in via the attribute so unrelated media (Remotion
// player audio, <video>) is never touched.
export const EXCLUSIVE_AUDIO_ATTR = "data-exclusive-audio";

let installed = false;

export const pauseOtherExclusiveAudio = (current) => {
  document.querySelectorAll(`audio[${EXCLUSIVE_AUDIO_ATTR}]`).forEach((el) => {
    if (el !== current && !el.paused) el.pause();
  });
};

export const installExclusiveAudio = () => {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener(
    "play",
    (e) => {
      const el = e.target;
      if (el instanceof HTMLAudioElement && el.hasAttribute(EXCLUSIVE_AUDIO_ATTR)) {
        pauseOtherExclusiveAudio(el);
      }
    },
    true
  );
};
