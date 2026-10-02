import { useEffect, useRef, useState } from "react";

export const useClickOutside = (onOutside, active = true) => {
  const ref = useRef(null);

  useEffect(() => {
    if (!active) return undefined;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onOutside(e);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onOutside, active]);

  return ref;
};

export const useEscapeKey = (onEscape, active = true) => {
  useEffect(() => {
    if (!active) return undefined;
    const handler = (e) => {
      if (e.key === "Escape") onEscape(e);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onEscape, active]);
};

export const useLockBodyScroll = (locked) => {
  useEffect(() => {
    if (!locked) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [locked]);
};

// Single shared <audio> element for playing one voice-sample preview at a
// time, keyed by an arbitrary id (e.g. a voice id) - `toggle(id, url)` plays
// that sample or pauses it if it's already the one playing. Extracted from
// VoiceSelect's inline preview logic so VoiceLibrary can reuse the same
// play/pause-one-at-a-time behavior instead of re-implementing it.
export const usePreviewPlayer = () => {
  const [playingValue, setPlayingValue] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    const stop = () => setPlayingValue(null);
    audio.addEventListener("ended", stop);
    audio.addEventListener("pause", stop);
    return () => {
      audio.removeEventListener("ended", stop);
      audio.removeEventListener("pause", stop);
      audio.pause();
    };
  }, []);

  const toggle = (id, url) => {
    const audio = audioRef.current;
    if (!audio || !url) return;
    if (playingValue === id) {
      audio.pause();
      return;
    }
    audio.src = url;
    audio.currentTime = 0;
    audio.play().catch(() => {});
    setPlayingValue(id);
  };

  const stop = () => audioRef.current?.pause();

  return { playingValue, toggle, stop };
};
