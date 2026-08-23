import { useState, useRef } from "react";
import { remapSceneElementsForTemplate } from "../../services/api";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";

const renumber = (list) => list.map((s, i) => ({ ...s, sceneNumber: i + 1 }));

// Generic editor for `elements.items: [{ heading?, text? }]` - the shape
// the "content" template uses (see constants.js's doc comment and
// ITEMS_EDITABLE_TEMPLATE_IDS).
const getSceneItems = (scene) => scene.elements?.items || scene.elements?.features || scene.elements?.steps || [];

// Every templateId is "NNN-<sceneType>" and all variants sharing a
// sceneType read the exact same `elements` shape (see
// remotion/src/templates/TemplateCategories.js's SceneTypeCategories) -
// so this strips the numeric prefix to compare scene types.
const sceneTypeOf = (templateId) => (templateId || "").replace(/^\d+-/, "");

/**
 * Owns the draft scene list and every edit operation on it - field edits,
 * template swaps (with server-side element remapping), content-item
 * CRUD/reordering, duplicate/delete/drag-reorder. Nothing here talks to
 * the job's own status/pipeline state (see useStudioJob) - purely the
 * scene array and whether it has unsaved changes.
 */
export function useSceneEditor(jobId) {
  const [editedScenes, setEditedScenes] = useState([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);
  const dragIndexRef = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [remappingTemplate, setRemappingTemplate] = useState(false);

  // Called by the job fetch to (re)hydrate the draft from a freshly loaded
  // job - resets selection/dirty state along with the scene list itself.
  const resetScenes = (scenes) => {
    setEditedScenes(scenes || []);
    setHasChanges(false);
    setSelectedSceneIndex(0);
  };

  const updateScene = (index, updater) => {
    setEditedScenes((prev) => {
      const updated = [...prev];
      updated[index] = updater(updated[index]);
      return updated;
    });
    setHasChanges(true);
  };

  const handleFieldChange = (index, field, value) => {
    updateScene(index, (scene) => ({ ...scene, [field]: value }));
  };

  // Writes into scene.elements.styleConfig.<role> (or a flat key like
  // "accentColor" when path has no "."), matching the mergeStyle({...theme,
  // ...override}) pattern templates read via `elements.styleConfig` -
  // see backend/remotion/src/theme.js and CaptionRenderer.jsx's identical
  // {...defaultCaptionConfig, ...styleConfig} merge. No backend change is
  // needed: `elements` is a schema-less Mixed field and scenes save as a
  // full array replace.
  const handleElementFieldChange = (index, path, value) => {
    updateScene(index, (scene) => {
      const styleConfig = { ...(scene.elements?.styleConfig || {}) };
      if (path.includes(".")) {
        const [role, prop] = path.split(".");
        styleConfig[role] = { ...(styleConfig[role] || {}), [prop]: value };
      } else {
        styleConfig[path] = value;
      }
      return { ...scene, elements: { ...(scene.elements || {}), styleConfig } };
    });
  };

  // Applies one style key (e.g. textAlign, fontFamily) to both the title and
  // subtitle roles at once - a single "Text Position"/"Font" control reads
  // more naturally than two separate title/subtitle pickers, and mergeStyle
  // on the template side already accepts any style key passed through
  // overrides.title/subtitle, so no template change is needed for this.
  const handleTextStyleFieldChange = (index, key, value) => {
    updateScene(index, (scene) => {
      const styleConfig = { ...(scene.elements?.styleConfig || {}) };
      styleConfig.title = { ...(styleConfig.title || {}), [key]: value };
      styleConfig.subtitle = { ...(styleConfig.subtitle || {}), [key]: value };
      return { ...scene, elements: { ...(scene.elements || {}), styleConfig } };
    });
  };

  // Writes a flat key directly onto scene.elements (not nested under
  // styleConfig) - for fields templates read straight off `elements`, like
  // `elements.backgroundColor`/`elements.title`/`elements.subtitle`. The
  // "Title"/"Subtitle"/"Background Color" fields only used to write the
  // top-level scene.title/subtitle/backgroundColor, which most templates
  // don't actually render from (they read scene.elements.* instead) - this
  // keeps both in sync.
  const handleElementDirectFieldChange = (index, field, value) => {
    updateScene(index, (scene) => ({ ...scene, elements: { ...(scene.elements || {}), [field]: value } }));
  };

  // Switching templates used to just swap templateId and leave the old
  // template's `elements` in place, so the new template rendered with
  // missing/mismatched fields (see remap-template endpoint's doc comment).
  // Sets templateId immediately for responsive UI. Only hits the remap API
  // when the new template is a different scene type - variants of the same
  // scene type (e.g. two "content" layouts) read identical elements, so
  // there's nothing to remap and no need for the round trip/spinner.
  const handleTemplateSelect = async (index, templateId) => {
    const scene = editedScenes[index];
    handleFieldChange(index, "templateId", templateId);
    if (!jobId || !scene) return;
    if (sceneTypeOf(templateId) === sceneTypeOf(scene.templateId)) return;
    setRemappingTemplate(true);
    try {
      const res = await remapSceneElementsForTemplate(jobId, scene.sceneNumber, templateId, scene);
      updateScene(index, (s) => ({ ...s, elements: res.data.elements }));
    } catch (err) {
      toast.error(err.friendlyMessage || "Couldn't adapt scene content to the new template - you may need to re-enter some fields.");
    } finally {
      setRemappingTemplate(false);
    }
  };

  const handleItemFieldChange = (index, itemIndex, field, value) => {
    updateScene(index, (scene) => {
      const items = [...getSceneItems(scene)];
      items[itemIndex] = { ...items[itemIndex], [field]: value };
      return { ...scene, elements: { ...(scene.elements || {}), items } };
    });
  };

  const handleAddItem = (index) => {
    updateScene(index, (scene) => ({
      ...scene,
      elements: { ...(scene.elements || {}), items: [...getSceneItems(scene), { heading: "", text: "" }] },
    }));
  };

  const handleRemoveItem = (index, itemIndex) => {
    updateScene(index, (scene) => ({
      ...scene,
      elements: { ...(scene.elements || {}), items: getSceneItems(scene).filter((_, i) => i !== itemIndex) },
    }));
  };

  const handleMoveItem = (index, itemIndex, direction) => {
    updateScene(index, (scene) => {
      const items = [...getSceneItems(scene)];
      const target = itemIndex + direction;
      if (target < 0 || target >= items.length) return scene;
      [items[itemIndex], items[target]] = [items[target], items[itemIndex]];
      return { ...scene, elements: { ...(scene.elements || {}), items } };
    });
  };

  const handleAudioTextChange = (index, value) => {
    updateScene(index, (scene) => ({ ...scene, audio: { ...scene.audio, text: value } }));
  };

  const handleDuplicateScene = (index) => {
    setEditedScenes((prev) => {
      const source = prev[index];
      // A duplicate needs fresh audio/image generation, not the original's
      // pointers - the pipeline resolves each scene's real audio file purely
      // by scene number (scene{N}.mp3), so carrying over a stale audio.file
      // string here would make the worker think this new scene's audio
      // already exists and skip generating it, 404-ing at render time.
      const copy = {
        ...source,
        imageUrl: "",
        audio: { ...(source.audio || {}), file: "", duration: 0, captionTimestamps: null },
        elements: source.elements ? { ...source.elements, captionTimestamps: null } : source.elements,
      };
      const updated = [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
      return renumber(updated);
    });
    setSelectedSceneIndex(index + 1);
    setHasChanges(true);
  };

  const handleDeleteScene = async (index) => {
    if (editedScenes.length <= 1) {
      toast.error("A video needs at least one scene");
      return;
    }
    const ok = await confirmDialog({
      title: "Delete this scene?",
      content: "This only affects the draft - nothing is saved until you click Save Changes.",
      danger: true,
    });
    if (!ok) return;
    setEditedScenes((prev) => renumber(prev.filter((_, i) => i !== index)));
    setSelectedSceneIndex((i) => Math.max(0, Math.min(i, editedScenes.length - 2)));
    setHasChanges(true);
  };

  const handleDrop = (targetIndex) => {
    const fromIndex = dragIndexRef.current;
    dragIndexRef.current = null;
    setDragOverIndex(null);
    if (fromIndex == null || fromIndex === targetIndex) return;
    setEditedScenes((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(targetIndex, 0, moved);
      return renumber(updated);
    });
    setSelectedSceneIndex(targetIndex);
    setHasChanges(true);
  };

  return {
    editedScenes,
    setEditedScenes,
    hasChanges,
    setHasChanges,
    resetScenes,
    selectedSceneIndex,
    setSelectedSceneIndex,
    dragIndexRef,
    dragOverIndex,
    setDragOverIndex,
    templatePickerOpen,
    setTemplatePickerOpen,
    remappingTemplate,
    getSceneItems,
    handleFieldChange,
    handleElementFieldChange,
    handleTextStyleFieldChange,
    handleElementDirectFieldChange,
    handleTemplateSelect,
    handleItemFieldChange,
    handleAddItem,
    handleRemoveItem,
    handleMoveItem,
    handleAudioTextChange,
    handleDuplicateScene,
    handleDeleteScene,
    handleDrop,
  };
}
