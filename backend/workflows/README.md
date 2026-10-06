# Image workflows (ComfyUI)

`txt2img.api.json` is the ComfyUI workflow Vireon sends for every scene image.
It is a plain text-to-image graph (checkpoint -> prompt encode -> KSampler -> VAE
decode -> SaveImage) in ComfyUI's **API format**, with `{{placeholders}}` where
per-image values go. Edit it, or point `IMAGE_WORKFLOW_PATH` at your own, to change
the model or the pipeline without touching code.

## Setting it up

1. Install ComfyUI and put a checkpoint in its `models/checkpoints/` folder. Which
   model fits is your call - the project does not pick one. A 6 GB card is tight: the
   smaller or "turbo"/"lightning"-style checkpoints are the realistic choice, and
   generation shares the card with the LLM and TTS (they take turns, see
   `services/localAI/gpuResourceManager.js`).
2. In `backend/.env`:
   ```
   COMFYUI_ENABLED=true
   COMFYUI_CHECKPOINT=<the checkpoint file name exactly as ComfyUI lists it>
   COMFYUI_API_URL=http://127.0.0.1:8188
   # Only if Vireon should start ComfyUI itself:
   COMFYUI_START_COMMAND=<command>
   COMFYUI_WORKDIR=<folder>
   ```
   Tune `IMAGE_STEPS`, `IMAGE_CFG`, `IMAGE_SAMPLER`, `IMAGE_SCHEDULER` to the model. A
   distilled/turbo model typically wants few steps (1-8) and a low CFG (about 1); a
   regular SD/SDXL checkpoint wants roughly 20-30 steps and CFG 5-8.
3. Restart the workers. Scenes the Director gives an image now get one.

With `COMFYUI_ENABLED` off (the default), scenes that wanted an image are rendered as
text-only scenes instead - the job never fails because of images unless
`IMAGE_GEN_REQUIRED=true`.

## Included workflows

- `txt2img.api.json` - classic single-checkpoint graph (SD/SDXL style); needs `COMFYUI_CHECKPOINT`.
- `qwen-image-2.1.api.json` - Qwen-Image 2.1 with split loaders (diffusion model + Qwen3-VL
  text encoder + VAE, filenames hardcoded in the file; no checkpoint). Use CFG 1,
  `euler`/`simple`; it ignores the negative prompt. Select with `IMAGE_WORKFLOW_PATH`.

## Placeholders

| Placeholder | Value |
|---|---|
| `{{prompt}}` | the scene's image prompt (already carries the video's style palette) |
| `{{negative}}` | `IMAGE_NEGATIVE_PROMPT` |
| `{{seed}}` | derived from the prompt, so a prompt always renders the same image |
| `{{width}}` / `{{height}}` | `IMAGE_SIZE_LANDSCAPE` / `_PORTRAIT` / `_SQUARE`, chosen by the video's aspect ratio |
| `{{outWidth}}` / `{{outHeight}}` | Size of the *saved* picture: same as width/height, or the 2K (2048 long edge) / 4K (3840) size Image Studio asks for. The Qwen workflow feeds them to an `ImageScale` (lanczos) node between VAEDecode and SaveImage; sampling stays at width x height. Optional in other workflows (unused placeholders are ignored) |
| `{{steps}}` `{{cfg}}` `{{sampler}}` `{{scheduler}}` | `IMAGE_STEPS` `IMAGE_CFG` `IMAGE_SAMPLER` `IMAGE_SCHEDULER` |
| `{{checkpoint}}` | `COMFYUI_CHECKPOINT` |

A value that is *only* a placeholder keeps its type (numbers stay numbers); a placeholder
inside longer text is interpolated. A placeholder with no value is an error, so a typo
fails loudly instead of sending a broken graph.

The graph must end in a **SaveImage** node. Export your own with ComfyUI's
"Save (API Format)" and replace the values with placeholders.

## Negative prompts

`qwen-image-2.1.api.json` takes `{{negative}}`, but Qwen-Image at CFG 1 (the setting that
renders one pass per step) **ignores** it - a same-seed test gave pixel-identical images
with and without one. Image Studio's "Avoid" field therefore renders in guided mode:
`IMAGE_NEGATIVE_CFG` (default 3) instead of CFG 1. That runs the model twice per step
(about 50% slower) and changes the whole composition, not just the avoided thing, and it
removes the subject from the foreground rather than from the whole picture. Video scene
images stay at CFG 1, where the default negative is harmless and unused.

## Text inside images

Image models invent text: asked for a poster they add rows of icon labels in gibberish,
and diagrams, screens and whiteboards fill with fake words. Same-seed tests on
Qwen-Image 2.1 (1024x576, 25 steps) found that **the wording matters, resolution and steps
do not** (1360x768 made the headline bigger but added even more made-up text):

| Prompt | Result |
|---|---|
| headline in quotes inside a busy poster prompt | right words, plus invented labels |
| same, plus a trailing "no other text" sentence | still invented labels |
| text described as THE text: `The text reads exactly: "X" in very large bold sans-serif capital letters across the center, and below it "Y" in smaller clean letters. Sharp, perfectly spelled, highly legible typography.` | clean on 4/4 runs and 2 seeds |
| nothing asked for, plain "No text, lettering, captions..." | classroom clean, diagram still labelled |
| nothing asked for, `Purely visual and completely unlabeled, with no words, letters, numbers or symbols that look like writing anywhere in the image.` | diagram clean |

`services/image/styles.js` (`composeFinalPrompt`) applies this in two places:
- **Image Studio**: the "Text in the picture" field (up to 3 short lines) becomes the exact-text
  wording; with the field empty and no quoted words in the prompt the unlabeled sentence is
  appended; a prompt that quotes its own text is left alone.
- **Video scene images** (`sceneImages.generateWithRetry`, used by the video worker, the course
  pipeline and scene regeneration): always the unlabeled sentence (unless the prompt quotes its
  own text), because the video templates draw their own titles and captions. The scene keeps its
  own `imagePrompt`; only what is sent to the model changes, which also retires cached images
  once per prompt.

Limits: it cannot help when the prompt itself asks for signs or billboards (the model draws
signage), and when the Director's prompt explicitly asks for labels ("gears labeled 'Partnerships'
...") the model still draws them - on real prompts from the library the labels came out as good
or better than without the sentence (a 7-gear infographic: 5 of 7 right vs 4 of 7; a 5-box
feedback-loop diagram: all 5 right), not removed.

## Caching

Images are cached by a hash of the prompt, seed, size, sampler settings, checkpoint and
this file's contents, so an unchanged prompt is never generated twice - across jobs too.
Editing this file changes the hash, which retires the old cached images.
