/** Constants and small rules for the Media Library, kept out of the components. */

// The tabs map straight onto the Asset registry's own categories, so each one
// is a real server-side filter rather than a guess from the file name.
export const KIND_TABS = [
  { value: "", label: "All files" },
  { value: "image", label: "Images" },
  { value: "render", label: "Videos" },
  { value: "audio", label: "Narration" },
  { value: "audio-studio", label: "Voice Studio" },
];

export const OWNER_OPTIONS = [
  { value: "", label: "Any source" },
  { value: "video", label: "Video jobs" },
  { value: "course-video", label: "Course videos" },
  { value: "audio-studio", label: "Voice Studio" },
  { value: "image-studio", label: "Image Studio" },
];

export const OWNER_LABEL = {
  video: "Video job",
  "course-video": "Course video",
  "audio-studio": "Voice Studio",
  "image-studio": "Image Studio",
  unknown: "Unknown source",
};

/** Where the thing that made an asset lives, if it still has a page. Orphans have none. */
export function ownerRoute(asset) {
  if (!asset || asset.orphaned) return null;
  switch (asset.ownerType) {
    case "video":
      return `/render?id=${asset.ownerId}`;
    case "audio-studio":
      return "/audio";
    case "image-studio":
      return "/images";
    default:
      return null;
  }
}

export const CATEGORY_LABEL = {
  image: "Image",
  render: "Video",
  audio: "Narration",
  "audio-studio": "Voice Studio",
};

export const PAGE_SIZE = { grid: 24, list: 20 };
