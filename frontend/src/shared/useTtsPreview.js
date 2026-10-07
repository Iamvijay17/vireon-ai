import { useCallback, useEffect, useRef, useState } from "react";
import { previewTts } from "../services/api";

/**
 * Generates a narration preview and exposes it as an object URL the player can
 * use. Owns the blob URL lifecycle (revoked when replaced or unmounted) and
 * ignores a response that arrives after a newer request or an unmount.
 */
export const useTtsPreview = () => {
  const [state, setState] = useState({ loading: false, url: null, meta: null, error: null });
  const urlRef = useRef(null);
  const requestRef = useRef(0);

  const revoke = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  };

  useEffect(() => () => {
    requestRef.current += 1;
    revoke();
  }, []);

  const generate = useCallback(async (request) => {
    const id = ++requestRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await previewTts(request);
      if (id !== requestRef.current) return;
      revoke();
      urlRef.current = URL.createObjectURL(res.data);
      setState({
        loading: false,
        url: urlRef.current,
        error: null,
        meta: {
          durationMs: Number(res.headers["x-tts-duration-ms"]) || null,
          cache: res.headers["x-tts-cache"] || null,
          segments: Number(res.headers["x-tts-segments"]) || null,
          style: res.headers["x-tts-style"] || null,
          note: res.headers["x-tts-note"] || null,
        },
      });
    } catch (err) {
      if (id !== requestRef.current) return;
      setState((s) => ({ ...s, loading: false, error: err.friendlyMessage || "Preview failed" }));
    }
  }, []);

  return { ...state, generate };
};
