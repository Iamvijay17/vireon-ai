import { ChevronLeft, ChevronRight, Copy, Trash2 } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Tabs } from "../../components/ui/Tabs";
import { INSPECTOR_TABS } from "./constants";
import { ContentTab } from "./ContentTab";
import { StyleTab } from "./StyleTab";
import { AnimationTab, ImageTab, AudioTab } from "./MiscTabs";

export const InspectorPanel = ({ scene, selectedSceneIndex, setSelectedSceneIndex, sceneCount, canEdit, editor, inspectorTab, setInspectorTab }) => (
  <Card className="flex min-h-0 flex-col">
    <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
      <button
        type="button"
        onClick={() => setSelectedSceneIndex((i) => Math.max(0, i - 1))}
        disabled={selectedSceneIndex === 0}
        className="rounded-md p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary disabled:opacity-30"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="text-[13px] font-semibold text-text-primary">
        Scene {selectedSceneIndex + 1} of {sceneCount}
      </span>
      <button
        type="button"
        onClick={() => setSelectedSceneIndex((i) => Math.min(sceneCount - 1, i + 1))}
        disabled={selectedSceneIndex === sceneCount - 1}
        className="rounded-md p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary disabled:opacity-30"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>

    <Tabs items={INSPECTOR_TABS} active={inspectorTab} onChange={setInspectorTab} className="px-2" />

    <div className="flex-1 space-y-5 overflow-y-auto p-4">
      {inspectorTab === "content" && (
        <ContentTab scene={scene} selectedSceneIndex={selectedSceneIndex} canEdit={canEdit} editor={editor} />
      )}
      {inspectorTab === "style" && (
        <StyleTab scene={scene} selectedSceneIndex={selectedSceneIndex} canEdit={canEdit} editor={editor} />
      )}
      {inspectorTab === "animation" && (
        <AnimationTab scene={scene} selectedSceneIndex={selectedSceneIndex} canEdit={canEdit} editor={editor} />
      )}
      {inspectorTab === "image" && (
        <ImageTab scene={scene} selectedSceneIndex={selectedSceneIndex} canEdit={canEdit} editor={editor} />
      )}
      {inspectorTab === "audio" && (
        <AudioTab scene={scene} selectedSceneIndex={selectedSceneIndex} canEdit={canEdit} editor={editor} />
      )}

      <div className="flex gap-2 border-t border-border-light pt-4">
        <Button variant="secondary" size="sm" icon={<Copy className="size-3.5" />} onClick={() => editor.handleDuplicateScene(selectedSceneIndex)} disabled={!canEdit} className="flex-1">
          Duplicate
        </Button>
        <Button variant="danger" size="sm" icon={<Trash2 className="size-3.5" />} onClick={() => editor.handleDeleteScene(selectedSceneIndex)} disabled={!canEdit} className="flex-1">
          Delete
        </Button>
      </div>
    </div>
  </Card>
);
