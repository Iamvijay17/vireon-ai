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

## Placeholders

| Placeholder | Value |
|---|---|
| `{{prompt}}` | the scene's image prompt (already carries the video's style palette) |
| `{{negative}}` | `IMAGE_NEGATIVE_PROMPT` |
| `{{seed}}` | derived from the prompt, so a prompt always renders the same image |
| `{{width}}` / `{{height}}` | `IMAGE_SIZE_LANDSCAPE` / `_PORTRAIT` / `_SQUARE`, chosen by the video's aspect ratio |
| `{{steps}}` `{{cfg}}` `{{sampler}}` `{{scheduler}}` | `IMAGE_STEPS` `IMAGE_CFG` `IMAGE_SAMPLER` `IMAGE_SCHEDULER` |
| `{{checkpoint}}` | `COMFYUI_CHECKPOINT` |

A value that is *only* a placeholder keeps its type (numbers stay numbers); a placeholder
inside longer text is interpolated. A placeholder with no value is an error, so a typo
fails loudly instead of sending a broken graph.

The graph must end in a **SaveImage** node. Export your own with ComfyUI's
"Save (API Format)" and replace the values with placeholders.

## Caching

Images are cached by a hash of the prompt, seed, size, sampler settings, checkpoint and
this file's contents, so an unchanged prompt is never generated twice - across jobs too.
Editing this file changes the hash, which retires the old cached images.
