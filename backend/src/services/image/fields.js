// Scene fields image generation can change. A generated image sets the URLs and
// elements; a scene that fell back to text-only also changes its sceneType (and
// template). Anything else on a scene (audio, timing, narration) is never touched
// by the image step, so persisting only these keeps it safe to run alongside
// other writers.
const IMAGE_SCENE_FIELDS = ['sceneType', 'templateId', 'imagePrompt', 'imageUrl', 'elements', 'storyboard'];

module.exports = { IMAGE_SCENE_FIELDS };
