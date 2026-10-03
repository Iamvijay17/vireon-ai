import React, { useEffect, useRef, useState } from 'react';
import { AbsoluteFill, Sequence, continueRender, delayRender, useCurrentFrame, useVideoConfig } from 'remotion';
import { Scene } from '../VideoComposition';
import { applyFontPairing } from '../theme';
import { analyzeLayout, sortIssues } from './analyzeLayout';

/**
 * Layout QC composition - renders ONE scene per frame, settled, and reports what is
 * wrong with its layout.
 *
 * Frame N of this composition is scene N (so a whole video is checked in a single
 * Remotion render, one bundle). The scene is shown at a settled point of its
 * entrance animation by shifting its Sequence backwards, then measured in the real
 * headless-Chromium DOM: where each text block actually ended up, whether it was
 * clipped by its box, whether images loaded. The measurements go through
 * analyzeLayout.js and the result is logged as a `VIREON_QC {json}` line, which
 * services/qc/LayoutQcService.js reads from the render's output.
 *
 * It measures what the renderer drew, not what the layout engine intended - which
 * is the point: the engine's text fitting is an estimate, the browser is the truth.
 */

// Far enough into a scene that staggered entrance animations have finished.
const SETTLE_FRAMES = 90;
const FPS = 30;
// Upper bound on waiting for a lazy template/fonts before measuring anyway.
const READY_TIMEOUT_MS = 10000;
const POLL_MS = 50;

const rectOf = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

/**
 * How many lines of text a box shows, and how many of them fall outside it.
 * scrollHeight vs clientHeight over-reports (an inline line box is a few pixels
 * taller than the glyphs, so a perfectly fitting title reads as "overflowing"), so
 * count lines instead: a line counts as cut off when its centre is below the box.
 */
const lineStats = (el) => {
  const range = document.createRange();
  range.selectNodeContents(el);
  const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0).sort((a, b) => a.top - b.top);

  const lines = [];
  for (const r of rects) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.top - r.top) < 3) {
      last.bottom = Math.max(last.bottom, r.bottom);
    } else {
      lines.push({ top: r.top, bottom: r.bottom });
    }
  }

  const boxBottom = el.getBoundingClientRect().bottom;
  const clipped = lines.filter((l) => (l.top + l.bottom) / 2 > boxBottom + 1).length;
  return { totalLines: lines.length, clippedLines: clipped };
};

const textOf = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();

/**
 * Text blocks in a scene. Generative scenes mark theirs (data-slot-role); for the
 * hand-coded templates there is no marker, so fall back to any element that holds
 * text of its own.
 */
const collectTexts = (root) => {
  const slots = [...root.querySelectorAll('[data-slot-role]')];
  if (slots.length > 0) {
    return slots
      .filter((el) => textOf(el))
      .map((el) => {
        const inner = el.querySelector('span:last-child') || el;
        const scale = el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth : 1;
        return {
          role: el.getAttribute('data-slot-role'),
          text: textOf(el),
          rect: rectOf(el),
          ...lineStats(el),
          fontPx: parseFloat(getComputedStyle(inner).fontSize) * scale,
        };
      });
  }

  return [...root.querySelectorAll('*')]
    .filter((el) => el.getAttribute('data-qc') !== 'caption' && !el.closest('[data-qc="caption"]'))
    .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
    .filter((el) => el.offsetWidth > 0 && el.offsetHeight > 0)
    .map((el) => {
      const scale = el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth : 1;
      return { role: 'text', text: textOf(el), rect: rectOf(el), ...lineStats(el), fontPx: parseFloat(getComputedStyle(el).fontSize) * scale };
    });
};

const collectCaptions = (root) =>
  [...root.querySelectorAll('[data-qc="caption"]')].map((el) => ({ text: textOf(el), rect: rectOf(el) }));

const collectImages = (root) =>
  [...root.querySelectorAll('img')].map((img) => ({ src: img.currentSrc || img.src, loaded: img.complete && img.naturalWidth > 0 }));

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

const Probe = ({ sceneNumber, children }) => {
  const ref = useRef(null);
  const { width, height } = useVideoConfig();
  const [handle] = useState(() => delayRender(`Measuring scene ${sceneNumber}`));

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const startedAt = Date.now();
      // The template is lazy-loaded; wait until it has mounted (see QcReadyMarker).
      while (!ref.current?.hasAttribute('data-qc-ready') && Date.now() - startedAt < READY_TIMEOUT_MS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
      const timedOut = !ref.current?.hasAttribute('data-qc-ready');
      try { await document.fonts?.ready; } catch { /* fonts API unavailable - measure anyway */ }
      await nextFrame();

      let issues;
      let error = null;
      try {
        const root = ref.current;
        issues = sortIssues(analyzeLayout({
          canvas: { width, height },
          texts: collectTexts(root),
          captions: collectCaptions(root),
          images: collectImages(root),
        }));
        if (timedOut) issues.unshift({ type: 'not-ready', severity: 'warn', message: 'the scene template did not finish loading before it was measured' });
      } catch (err) {
        error = err.message;
        issues = [];
      }

      // eslint-disable-next-line no-console
      console.log(`VIREON_QC ${JSON.stringify({ scene: sceneNumber, issues, ...(error ? { error } : {}) })}`);
      if (!cancelled) continueRender(handle);
    })();

    return () => { cancelled = true; };
    // Measure once per mounted probe (one per frame/scene).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AbsoluteFill ref={ref} data-qc-probe="true">
      {children}
    </AbsoluteFill>
  );
};

export const LayoutQc = ({ assets, jobId }) => {
  const frame = useCurrentFrame();
  const scenes = assets?.scenes || [];
  applyFontPairing(assets?.fontPairing);

  const scene = scenes[Math.min(frame, scenes.length - 1)];
  if (!scene) return null;

  const sceneFrames = Math.max(2, Math.round((scene.duration || 8) * FPS));
  const settle = Math.min(SETTLE_FRAMES, sceneFrames - 1);

  // Audio is irrelevant here (and would only add network fetches), and a camera
  // move would push edge text past the frame and report false positives.
  const qcScene = { ...scene, cameraMotion: 'static', audio: scene.audio ? { ...scene.audio, file: '' } : scene.audio };

  return (
    <AbsoluteFill style={{ backgroundColor: scene.backgroundColor || '#1a1a2e' }}>
      <Sequence key={frame} from={frame - settle} durationInFrames={sceneFrames}>
        <Probe sceneNumber={scene.sceneNumber ?? frame + 1}>
          <Scene scene={qcScene} jobId={jobId} qc />
        </Probe>
      </Sequence>
    </AbsoluteFill>
  );
};

/** One frame per scene, at the video's own resolution. */
export const calculateQcMetadata = ({ props }) => {
  const [width, height] = String(props?.assets?.resolution || '1920x1080').split('x').map(Number);
  return {
    durationInFrames: Math.max(1, (props?.assets?.scenes || []).length),
    fps: FPS,
    width: width || 1920,
    height: height || 1080,
  };
};
