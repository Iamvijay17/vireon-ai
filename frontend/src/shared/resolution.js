// Video jobs don't have an independently-chosen aspect ratio - the actual
// render dimensions always come from `resolution` ("WIDTHxHEIGHT"), so
// derive portrait/landscape from that directly instead of trusting a
// separate `aspectRatio` field (which older records may have saved
// inconsistently before it was made resolution-derived server-side).
export const isPortraitResolution = (resolution) => {
  const [width, height] = String(resolution || "").split("x").map(Number);
  return Boolean(width && height && height > width);
};
