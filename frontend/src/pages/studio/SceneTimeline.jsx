import { GripVertical } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { SceneThumbnail } from "../../components/video/SceneThumbnail";
import { cn } from "../../components/ui/cn";

export const SceneTimeline = ({
  editedScenes,
  selectedSceneIndex,
  setSelectedSceneIndex,
  totalSeconds,
  canEdit,
  dragIndexRef,
  dragOverIndex,
  setDragOverIndex,
  onDrop,
}) => (
  <Card className="flex min-h-0 flex-col">
    <div className="flex items-center justify-between border-b border-border-light px-3.5 py-3">
      <h3 className="text-[13px] font-semibold text-text-primary">Scenes</h3>
      <span className="text-[11px] text-text-tertiary">{Math.round(totalSeconds)}s</span>
    </div>
    <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
      {editedScenes.map((s, i) => {
        const isActive = i === selectedSceneIndex;
        const isDragOver = dragOverIndex === i;
        return (
          <button
            key={i}
            type="button"
            draggable={canEdit}
            onDragStart={() => {
              dragIndexRef.current = i;
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragOverIndex !== i) setDragOverIndex(i);
            }}
            onDragLeave={() => setDragOverIndex((cur) => (cur === i ? null : cur))}
            onDrop={() => canEdit && onDrop(i)}
            onDragEnd={() => setDragOverIndex(null)}
            onClick={() => setSelectedSceneIndex(i)}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg border p-1.5 text-left transition-colors",
              isActive ? "border-accent bg-accent-subtle" : "border-border-light bg-surface hover:bg-surface-hover",
              isDragOver && "ring-2 ring-accent",
            )}
          >
            <GripVertical className="size-3.5 shrink-0 cursor-grab text-text-tertiary" />
            <div className="aspect-video w-20 shrink-0 overflow-hidden rounded-md bg-black">
              <SceneThumbnail scene={s} />
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-[11px] font-medium", isActive ? "text-accent" : "text-text-primary")}>
                {s.sceneNumber || i + 1}. {s.title || "Untitled"}
              </p>
              <p className="mt-0.5 text-[10px] text-text-tertiary">{Math.round(s.duration || 8)}s</p>
            </div>
          </button>
        );
      })}
    </div>
  </Card>
);
