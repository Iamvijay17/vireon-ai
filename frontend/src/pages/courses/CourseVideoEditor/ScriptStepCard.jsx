import { CheckCircle2, RotateCw, Pencil, Zap, PlayCircle } from "lucide-react";
import { Card, CardHeader } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { AccordionItem } from "../../../components/ui/Accordion";
import { Textarea } from "../../../components/ui/Input";
import { ScenePreview } from "../../../components/video/ScenePreview";
import { InlineEmpty, InlineSpinner, StepSection } from "./shared";
import { scriptToText } from "./constants";

export const ScriptStepCard = ({
  video,
  scenes,
  hasScript,
  isApproved,
  hasAudio,
  isProcessing,
  scriptState,
  scriptSummary,
  isOpen,
  onToggle,
  actionLoading,
  editingScript,
  setEditingScript,
  scriptText,
  setScriptText,
  onGenerateScript,
  onApproveScript,
  onRegenerateScript,
  onSaveScript,
  onManualRefresh,
  courseId,
  videoId,
  navigate,
}) => (
  <>
    <StepSection
      number={1}
      title="Script Generation"
      state={scriptState}
      isOpen={isOpen}
      onToggle={onToggle}
      summary={scriptSummary}
      badges={
        <>
          {hasScript && !isApproved && <Badge variant="warning">Needs Approval</Badge>}
          {isApproved && <Badge variant="success" icon={<CheckCircle2 className="size-3" />}>Approved</Badge>}
        </>
      }
      actions={
        <>
          <Button variant="ghost" size="sm" iconOnly aria-label="Refresh" icon={<RotateCw className="size-3.5" />} onClick={onManualRefresh} />
          {!hasScript && video?.status !== "Generating Script" && (
            <Button variant="primary" size="sm" icon={<Zap className="size-3.5" />} loading={actionLoading.script} onClick={onGenerateScript}>
              Generate Script
            </Button>
          )}
          {hasScript && !isApproved && video?.status !== "Generating Script" && (
            <>
              <Button variant="secondary" size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setEditingScript((v) => !v)}>
                {editingScript ? "Cancel" : "Edit"}
              </Button>
              <Button variant="primary" size="sm" icon={<CheckCircle2 className="size-3.5" />} loading={actionLoading.approve} onClick={onApproveScript}>
                Approve Script
              </Button>
              <Button variant="secondary" size="sm" icon={<RotateCw className="size-3.5" />} loading={actionLoading.script} onClick={onRegenerateScript}>
                Regenerate
              </Button>
            </>
          )}
          {isApproved && video?.status !== "Generating Script" && (
            <Button variant="secondary" size="sm" icon={<RotateCw className="size-3.5" />} loading={actionLoading.script} onClick={onRegenerateScript}>
              Regenerate Script
            </Button>
          )}
        </>
      }
    >
      {!hasScript && !isProcessing && (
        <InlineEmpty description="No script yet">
          <Button variant="primary" size="sm" icon={<Zap className="size-3.5" />} loading={actionLoading.script} onClick={onGenerateScript} className="mt-1">
            Generate Script with AI
          </Button>
        </InlineEmpty>
      )}
      {!hasScript && video?.status === "Generating Script" && <InlineSpinner label="Generating script using AI..." />}
      {hasScript && !editingScript && (
        <div>
          {scenes.length > 0 ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {scenes.map((scene, i) => (
                <div
                  key={i}
                  className="animate-slide-up rounded-[10px] bg-surface-hover p-3.5"
                  style={{ "--stagger-index": i }}
                >
                  <div className="mb-1.5 flex items-start justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <Badge variant="accent" className="shrink-0">
                        {scene.sceneNumber || i + 1}
                      </Badge>
                      <p className="font-semibold text-text-primary">{scene.title || "Untitled scene"}</p>
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {scene.sceneType && <Badge>{scene.sceneType}</Badge>}
                      {Boolean(scene.duration) && <span className="text-xs text-text-tertiary">{scene.duration}s</span>}
                    </div>
                  </div>
                  {scene.subtitle && <p className="text-[13px] text-text-secondary">{scene.subtitle}</p>}
                  {(scene.audio?.text || scene.narration) && (
                    <p className="mt-1 line-clamp-2 text-[13px] text-text-tertiary">
                      &ldquo;{scene.audio?.text || scene.narration}&rdquo;
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <InlineEmpty description="Script has no scenes" />
          )}

          <AccordionItem title={<span className="text-[13px] text-text-tertiary">View raw script JSON</span>} ghost className="mt-3">
            <pre className="max-h-96 overflow-auto rounded-lg border border-border-light bg-bg p-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-text-primary">
              {JSON.stringify(video.script, null, 2)}
            </pre>
          </AccordionItem>
        </div>
      )}
      {hasScript && editingScript && (
        <div>
          <Textarea
            rows={15}
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            className="bg-bg font-mono text-[13px]"
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setEditingScript(false);
                setScriptText(scriptToText(video.script));
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" loading={actionLoading.save} onClick={onSaveScript}>
              Save Script
            </Button>
          </div>
        </div>
      )}
    </StepSection>

    {/* SCENE PREVIEW: live in-browser Remotion preview, no server render */}
    {hasScript && scenes.length > 0 && isOpen && (
      <Card>
        <CardHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              <PlayCircle className="size-4 text-text-tertiary" />
              Scene Preview
              {!hasAudio && <Badge>No audio</Badge>}
            </span>
          }
          extra={
            <Button
              variant="primary"
              size="sm"
              icon={<Pencil className="size-3.5" />}
              onClick={() => navigate(`/courses/${courseId}/videos/${videoId}/studio`)}
            >
              Customize in Studio
            </Button>
          }
        />
        <div className="p-5">
          <ScenePreview scenes={scenes} videoId={videoId} />
        </div>
      </Card>
    )}
  </>
);
