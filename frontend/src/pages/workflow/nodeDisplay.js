import {
  Play, FileText, Hand, Mic2, Captions, UserSquare2, Image as ImageIcon, Package, Film,
  UploadCloud, CircleCheck, X, Check, Loader2, Pause,
} from "lucide-react";
import { STATE, SKIPPED } from "./graph";

// How a pipeline node presents itself: its icon, and the icon and label for
// each run state. Shared by the canvas nodes and the inspector.

export const ICONS = {
  play: Play, text: FileText, hand: Hand, mic: Mic2, captions: Captions, user: UserSquare2,
  image: ImageIcon, box: Package, film: Film, upload: UploadCloud, check: CircleCheck,
};

export const STATE_ICON = { [STATE.DONE]: Check, [STATE.RUN]: Loader2, [STATE.WAIT]: Pause, [STATE.FAIL]: X };

export const STATE_TEXT = {
  [STATE.IDLE]: "Not started",
  [STATE.RUN]: "In progress",
  [STATE.WAIT]: "Waiting for you",
  [STATE.DONE]: "Completed",
  [STATE.FAIL]: "Failed",
  [SKIPPED]: "Skipped",
};
