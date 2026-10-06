/** The five states a node can be in, plus SKIPPED for an optional step that did not run. */
export const STATE = {
  IDLE: "idle", // not reached yet
  RUN: "run", // actively working
  WAIT: "wait", // blocked on a person, or a retry is scheduled
  DONE: "done",
  FAIL: "fail",
};

/** Stage hues, so the same step keeps the same colour as the pipeline grows. */
export const STAGE_COLOR = {
  script: "var(--color-accent-500)",
  voice: "#12b5a5",
  render: "#f0913d",
  publish: "var(--color-success-500)",
};

export const STATE_COLOR = {
  [STATE.RUN]: "var(--color-accent-500)",
  [STATE.WAIT]: "var(--color-warning-500)",
  [STATE.DONE]: "var(--color-success-500)",
  [STATE.FAIL]: "var(--color-danger-500)",
};

/**
 * The video pipeline as a graph, for the Workflow canvas.
 *
 * This mirrors backend/src/workers/videoWorker/processor.js step for step -
 * if a step is added or reordered there, it belongs here too. Nodes carry
 * the real tech behind each step (Ollama, Qwen3-TTS, ComfyUI, Remotion,
 * MinIO) so the canvas doubles as living documentation.
 *
 * Layout is a two-row snake: row 1 runs left to right, row 2 runs right to
 * left, so eleven nodes fit one screen without shrinking to illegibility.
 */

export const NODE_W = 232;
export const NODE_H = 104;
const STEP_X = 280;
const ROW_Y = [0, 210];

// Row 2 starts under the last node of row 1 and runs backwards.
const col = (i) => i * STEP_X;
const rtl = (i) => (5 - i) * STEP_X;

/**
 * `statuses`  JOB_STATUS values that mean "this node is working / waiting".
 * `order`     position in JOB_STEPS (backend/src/constants), used to decide
 *             which nodes are already behind the job.
 * `gate`      a node that waits on a person rather than doing work.
 */
export const NODES = [
  {
    id: "trigger", stage: "script", icon: "play", order: 0, x: col(0), y: ROW_Y[0], dir: "ltr",
    title: "New video request", tech: "Wizard · REST API", statuses: ["QUEUED"],
    summary: "A topic, type, duration and voice come in from the wizard or the API and are queued on BullMQ.",
    outputs: "Job record (QUEUED)",
  },
  {
    id: "script", stage: "script", icon: "text", order: 1, x: col(1), y: ROW_Y[0], dir: "ltr",
    title: "Write script", tech: "Ollama · gemma4:e4b", statuses: ["SCRIPT_GENERATION"],
    summary: "The AI Director plans the story arc first, then writes scene narration in bounded chunks so long videos never stall mid-JSON. The GPU is claimed for Ollama for the whole step.",
    file: "workers/videoWorker/scriptStep.js",
    outputs: "script.scenes[] with narration and visual prompts",
  },
  {
    id: "approval", stage: "script", icon: "hand", order: 3, x: col(2), y: ROW_Y[0], dir: "ltr", gate: true,
    title: "Approve script", tech: "Manual gate", statuses: ["SCRIPT_COMPLETED", "AWAITING_APPROVAL"],
    summary: "The pipeline always pauses here after generating a script. Edit scenes, then approve to continue.",
    outputs: "Approved script",
  },
  {
    id: "voice", stage: "voice", icon: "mic", order: 4, x: col(3), y: ROW_Y[0], dir: "ltr",
    title: "Narration", tech: "Qwen3-TTS · GPU", statuses: ["GENERATING_AUDIO"],
    summary: "One audio file per scene, generated GPU-sequentially across the batch. Skipped for scenes that already have audio, so a restart resumes instead of redoing work.",
    file: "workers/videoWorker/audioStep.js",
    outputs: "scene.audio.file for every scene",
  },
  {
    id: "captions", stage: "voice", icon: "captions", order: 4, x: col(4), y: ROW_Y[0], dir: "ltr",
    title: "Caption sync", tech: "faster-whisper alignment", statuses: ["GENERATING_AUDIO"],
    summary: "Forced alignment of the script against the generated audio, so captions land on the exact word timing rather than an estimate.",
    outputs: "Word-level caption timings, scene durations",
  },
  {
    id: "gate", stage: "render", icon: "hand", order: 5, x: col(5), y: ROW_Y[0], dir: "ltr", gate: true,
    title: "Start render", tech: "Manual mode only", statuses: ["AUDIO_COMPLETED"],
    summary: "Jobs created with fast generation off pause after audio and wait for an explicit render trigger. Fast jobs flow straight through.",
    outputs: "Render trigger",
  },

  {
    id: "images", stage: "render", icon: "image", order: 6, x: rtl(0), y: ROW_Y[1], dir: "rtl",
    title: "Scene images", tech: "ComfyUI · Qwen-Image", statuses: ["GENERATING_IMAGES", "IMAGE_COMPLETED"],
    summary: "One image per scene (about 2 min each on the 2060). Falls back to a text-only scene when image generation is off, ComfyUI is down, or a prompt fails, so a render never fails over a picture.",
    file: "workers/videoWorker/imageStep.js",
    outputs: "scene image URLs or text fallbacks",
  },
  {
    id: "assets", stage: "render", icon: "box", order: 8, x: rtl(1), y: ROW_Y[1], dir: "rtl",
    title: "Prepare assets", tech: "Remotion assets.json", statuses: ["PREPARING_ASSETS"],
    summary: "Always regenerated from the current script, then validated so a missing file fails here instead of halfway through a render.",
    file: "workers/videoWorker/renderStep.js",
    outputs: "assets.json",
  },
  {
    id: "render", stage: "render", icon: "film", order: 9, x: rtl(2), y: ROW_Y[1], dir: "rtl",
    title: "Render video", tech: "Remotion · 50 templates", statuses: ["RENDERING", "VALIDATION", "LAYOUT CHECK"],
    summary: "Validates the assets and optionally checks the layout, then renders the chosen template over the scene audio, images and captions. A crash-recovered job skips the render if the existing output is still current.",
    file: "workers/videoWorker/renderStep.js",
    outputs: "Rendered MP4",
  },
  {
    id: "upload", stage: "publish", icon: "upload", order: 10, x: rtl(3), y: ROW_Y[1], dir: "rtl",
    title: "Upload", tech: "MinIO", statuses: ["UPLOADING"],
    summary: "Pushes the finished video and its artifacts to MinIO, then cleans up local working files.",
    file: "workers/videoWorker/uploadStep.js",
    outputs: "videoUrl",
  },
  {
    id: "done", stage: "publish", icon: "check", order: 11, x: rtl(4), y: ROW_Y[1], dir: "rtl", terminal: true,
    title: "Ready", tech: "Socket event", statuses: ["COMPLETED"],
    summary: "The job completes and a socket event tells every open page. The video is playable from Jobs.",
    outputs: "COMPLETED",
  },
];

// Wrap edges leave the bottom of the last row-1 node and enter the top of
// the first row-2 node; everything else is port to port along its row.
export const EDGES = NODES.slice(0, -1).map((node, i) => {
  const next = NODES[i + 1];
  const wrap = node.dir !== next.dir;
  return {
    id: `${node.id}->${next.id}`,
    from: node.id,
    to: next.id,
    fromSide: wrap ? "bottom" : node.dir === "ltr" ? "right" : "left",
    toSide: wrap ? "top" : node.dir === "ltr" ? "left" : "right",
    // Optional steps are drawn as skippable edges.
    optional: next.optional || node.optional,
  };
});

export const NODE_BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n]));

/** Canvas-space point where an edge attaches to a node. */
export function portOf(node, side) {
  switch (side) {
    case "left": return { x: node.x, y: node.y + NODE_H / 2 };
    case "right": return { x: node.x + NODE_W, y: node.y + NODE_H / 2 };
    case "top": return { x: node.x + NODE_W / 2, y: node.y };
    default: return { x: node.x + NODE_W / 2, y: node.y + NODE_H };
  }
}

/** Cubic path between two ports, with handles pointing out of each side. */
export function edgePath(edge) {
  const a = portOf(NODE_BY_ID[edge.from], edge.fromSide);
  const b = portOf(NODE_BY_ID[edge.to], edge.toSide);
  const reach = edge.fromSide === "bottom" ? 70 : Math.max(40, Math.abs(b.x - a.x) / 2);
  const handle = (side, p, sign) => {
    if (side === "right") return { x: p.x + reach * sign, y: p.y };
    if (side === "left") return { x: p.x - reach * sign, y: p.y };
    if (side === "bottom") return { x: p.x, y: p.y + reach * sign };
    return { x: p.x, y: p.y - reach * sign };
  };
  const c1 = handle(edge.fromSide, a, 1);
  const c2 = handle(edge.toSide, b, 1);
  return `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`;
}

/** Bounding box of the whole graph, for fit-to-view. */
export const BOUNDS = {
  x: 0,
  y: 0,
  w: Math.max(...NODES.map((n) => n.x + NODE_W)),
  h: Math.max(...NODES.map((n) => n.y + NODE_H)),
};

/** Backend order of each status, matching JOB_STEPS in backend constants. */
const ORDER_BY_STATUS = {
  QUEUED: 0,
  SCRIPT_GENERATION: 1,
  SCRIPT_COMPLETED: 3,
  AWAITING_APPROVAL: 3,
  GENERATING_AUDIO: 4,
  AUDIO_COMPLETED: 5,
  GENERATING_IMAGES: 6,
  IMAGE_COMPLETED: 6,
  PREPARING_ASSETS: 8,
  RENDERING: 9,
  // Sub-steps of render() the worker records as error.step.
  VALIDATION: 9,
  "LAYOUT CHECK": 9,
  UPLOADING: 10,
  COMPLETED: 11,
};

/** Extra state a canvas node can be in beyond the five shared states. */
export const SKIPPED = "skip";

/**
 * Per-node state for one job, or an empty map when no job is selected (the
 * canvas then just shows the blueprint).
 *
 * A node is done once the job has moved past its order, active if the job's
 * status names it, and failed on the node the error belongs to. Gates are
 * WAIT rather than RUN while the job sits on them, which is the same
 * meaning the rest of v2 gives that state: blocked on a person.
 */
export function nodeStates(job) {
  if (!job) return {};

  const status = String(job.status || "").toUpperCase();
  const failedStatus = String(job.error?.step || "").toUpperCase();
  const failed = status === "FAILED" || status === "CANCELLED";
  const retrying = status === "RETRY_SCHEDULED";

  // A failed or retrying job's real position is where it broke.
  const effective = failed || retrying ? failedStatus || status : status;
  const current = ORDER_BY_STATUS[effective];
  const states = {};

  for (const node of NODES) {
    const here = node.statuses.includes(effective);

    if (current === undefined) {
      // Position unknown (failed with no recorded step): claim nothing
      // rather than draw a confident but wrong pipeline.
      states[node.id] = STATE.IDLE;
    } else if (status === "COMPLETED") {
      states[node.id] = STATE.DONE;
    } else if (here) {
      states[node.id] = failed ? STATE.FAIL : retrying || node.gate ? STATE.WAIT : STATE.RUN;
    } else if (node.order < current) {
      states[node.id] = STATE.DONE;
    } else {
      states[node.id] = STATE.IDLE;
    }
  }

  return states;
}

/** The node the job is on: the working one, else one it is blocked or failed at. */
export const activeNode = (states) =>
  NODES.find((n) => states[n.id] === STATE.RUN) ||
  NODES.find((n) => states[n.id] === STATE.WAIT) ||
  NODES.find((n) => states[n.id] === STATE.FAIL) ||
  null;
