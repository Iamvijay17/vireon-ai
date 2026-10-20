import { AudioLines, CheckCircle2, FileText, Layers } from "lucide-react";
import { StatTile } from "../../../components/ui/StatTile";

const ofTotal = (part, total) => (total > 0 ? `${part} / ${total}` : "—");

/**
 * Where the course stands: lessons finished, scripts written, audio made, and
 * what the course is. Counts come from the course record and its loaded
 * lessons; a course with no lessons shows a dash, not 0 / 0.
 */
export function CourseProgressCard({ course, videos }) {
  const total = course?.videoCount || 0;
  const completed = course?.completedVideoCount || 0;
  const scripts = videos.filter((v) => v.scriptStatus === "Completed").length;
  const audio = videos.filter((v) => v.audioStatus === "Completed").length;
  const meta = [course?.category, course?.difficulty, course?.language].filter(Boolean).join(" · ");

  return (
    <section aria-label="Course progress" className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile label="Lessons finished" icon={CheckCircle2} tone="success" value={ofTotal(completed, total)} hint={total > 0 ? `${Math.round((completed / total) * 100)}% complete` : "No lessons yet"} />
      <StatTile label="Scripts written" icon={FileText} tone="accent" value={ofTotal(scripts, total)} />
      <StatTile label="Audio generated" icon={AudioLines} tone="accent" value={ofTotal(audio, total)} />
      <StatTile label="Course" icon={Layers} value={course?.category || "—"} hint={meta || undefined} />
    </section>
  );
}
