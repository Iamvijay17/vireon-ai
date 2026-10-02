export const getCurrentStep = (status) => {
  const stepMap = {
    Draft: 0,
    "Generating Script": 0,
    "Script Generated": 1,
    "Waiting for Approval": 1,
    Approved: 1,
    "Generating Audio": 2,
    "Audio Generated": 2,
    "Generating Scenes": 2,
    "Scenes Generated": 2,
    "Generating Images": 2,
    "Images Generated": 2,
    "Rendering Video": 3,
    Uploading: 3,
    Completed: 4,
    Failed: -1,
  };
  return stepMap[status] ?? 0;
};

// `video.script` is already a real { title, description, scenes, ... }
// object from the API - this is only for the raw-JSON textarea editor.
export const scriptToText = (script) => (script?.scenes?.length ? JSON.stringify(script, null, 2) : "");

export const STEP_CIRCLE_CLASSES = {
  done: "border-accent bg-accent text-white",
  active: "border-accent bg-surface text-accent",
  error: "border-danger-500 bg-danger-500/10 text-danger-500",
  locked: "border-border bg-surface text-text-tertiary",
};
