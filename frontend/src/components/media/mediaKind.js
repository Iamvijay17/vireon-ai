/**
 * What kind of file is this, for choosing a preview? Decided from the stored
 * MIME type first, then the file name, then the registry category - an asset
 * recorded without a MIME type (older uploads) must still preview sensibly.
 *
 * @returns {"image" | "video" | "audio" | "other"}
 */
export function mediaKind({ mimeType, fileName, category } = {}) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";

  const ext = String(fileName || "").toLowerCase().split(".").pop();
  if (["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp", "svg"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "mkv", "m4v"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus"].includes(ext)) return "audio";

  if (category === "image") return "image";
  if (category === "render") return "video";
  if (category === "audio" || category === "audio-studio") return "audio";
  return "other";
}

export const KIND_LABEL = { image: "Image", video: "Video", audio: "Audio", other: "File" };
