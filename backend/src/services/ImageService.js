const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const LoggerService = require('./LoggerService');

/**
 * ComfyUI Image Generation Service
 *
 * Connects to a running ComfyUI instance (typically at http://localhost:8188)
 * to generate images from scene image prompts.
 *
 * For each scene, it:
 * 1. Sends the imagePrompt to ComfyUI
 * 2. Polls for completion
 * 3. Downloads the generated image
 * 4. Stores it in jobs/{jobId}/images/scene{N}.png
 * 5. Returns the file path / URL
 */
class ImageService {
  /**
   * Generate images for all scenes in a job.
   *
   * @param {string} jobId - The job ID
   * @param {Array} scenes - Array of scene objects with imagePrompt
   * @param {Object} options - { singleImage: boolean }
   *   If singleImage is true, only generates ONE image from the first scene
   *   and uses it as the background for ALL scenes (useful for podcast, business types).
   * @returns {Promise<Array>} Scenes updated with imageUrl
   */
  static async generateAllImages(jobId, scenes, options = {}) {
    const imagesDir = path.resolve(__dirname, '../../jobs', jobId, 'images');
    await fs.mkdir(imagesDir, { recursive: true });
    const port = config.port || 3000;

    const updatedScenes = [];
    let backgroundImageUrl = null;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];

      // In singleImage mode, all scenes use the same image generated from first scene
      if (options.singleImage && i > 0 && backgroundImageUrl) {
        updatedScenes.push({
          ...scene,
          imageUrl: backgroundImageUrl,
        });
        continue;
      }

      const imagePrompt = scene.imagePrompt || '';

      if (!imagePrompt) {
        LoggerService.warn(`No imagePrompt for scene ${scene.sceneNumber}, skipping image generation`);
        updatedScenes.push({
          ...scene,
          imageUrl: null,
        });
        continue;
      }

      try {
        LoggerService.info(`Generating image for scene ${scene.sceneNumber}`, {
          jobId,
          prompt: imagePrompt.substring(0, 100),
          mode: options.singleImage ? 'single-background' : 'per-scene',
        });

        const imagePath = await ImageService.generateImage(
          jobId,
          scene.sceneNumber,
          imagePrompt,
          imagesDir
        );

        // Generate HTTP-accessible URL via Express static middleware
        const imageUrl = `http://localhost:${port}/public/${jobId}/images/scene${scene.sceneNumber}.png`;

        if (options.singleImage) {
          backgroundImageUrl = imageUrl;
        }

        updatedScenes.push({
          ...scene,
          imageUrl,
          localImagePath: imagePath,
        });

        LoggerService.success(`Image generated for scene ${scene.sceneNumber}`, {
          jobId,
          path: imagePath,
          url: imageUrl,
          mode: options.singleImage ? 'single-background' : 'per-scene',
        });
      } catch (err) {
        LoggerService.error(`Failed to generate image for scene ${scene.sceneNumber}`, {
          jobId,
          error: err.message,
        });
        // Continue with next scene even if one fails
        updatedScenes.push({
          ...scene,
          imageUrl: null,
        });
      }
    }

    return updatedScenes;
  }

  /**
   * Generate a single image from a prompt using ComfyUI.
   *
   * @param {string} jobId - The job ID
   * @param {number} sceneNumber - The scene number
   * @param {string} prompt - The image prompt
   * @param {string} outputDir - Directory to save the image
   * @returns {Promise<string>} Path to the generated image
   */
  static async generateImage(jobId, sceneNumber, prompt, outputDir) {
    const comfyUrl = config.comfyui?.url || 'http://localhost:8188';
    const timeout = config.comfyui?.timeout || 120000;

    // Step 1: Get the ComfyUI workflow with our prompt injected
    const workflow = await ImageService._buildWorkflow(prompt);

    // Step 2: Submit the prompt to ComfyUI
    LoggerService.debug(`Submitting prompt to ComfyUI`, {
      url: `${comfyUrl}/prompt`,
      promptPreview: prompt.substring(0, 80),
    });

    const promptResponse = await axios.post(
      `${comfyUrl}/prompt`,
      { prompt: workflow },
      { timeout: 30000 }
    );

    const promptId = promptResponse.data.prompt_id;
    LoggerService.debug(`ComfyUI prompt submitted`, { promptId, sceneNumber });

    if (!promptId) {
      throw new Error(`ComfyUI did not return a prompt_id`);
    }

    // Step 3: Poll for completion
    const outputFilename = await ImageService._pollForCompletion(
      comfyUrl,
      promptId,
      timeout
    );

    // Step 4: Download the image
    const targetPath = path.join(outputDir, `scene${sceneNumber}.png`);
    await ImageService._downloadImage(comfyUrl, outputFilename, targetPath);

    return targetPath;
  }

  /**
   * Fetch available ComfyUI node options for a given node and input.
   * @returns {Promise<string[]>} Array of available option names
   */
  static async _getNodeOptions(nodeType, inputName) {
    const comfyUrl = config.comfyui?.url || 'http://localhost:8188';
    const axios = require('axios');

    try {
      const resp = await axios.get(`${comfyUrl}/object_info/${nodeType}`, { timeout: 5000 });
      const req = resp.data[nodeType]?.input?.required;
      if (req && req[inputName] && Array.isArray(req[inputName][0])) {
        return req[inputName][0].filter(name => name && !name.startsWith('put_'));
      }
    } catch {}

    return [];
  }

  /**
   * Known widget-to-input-name mappings for ComfyUI node types.
   * In saved workflows, `widgets_values` is an ordered array.
   * This maps each position to the correct API input name.
   */
  static _WIDGET_MAP = {
    'UNETLoader': ['unet_name', 'weight_dtype'],
    'CLIPLoader': ['clip_name', 'type', 'device'],
    'VAELoader': ['vae_name'],
    'CLIPTextEncode': ['text'],
    'KSampler': ['seed', 'control_after_generate', 'steps', 'cfg', 'sampler_name', 'scheduler', 'denoise'],
    'EmptySD3LatentImage': ['width', 'height', 'batch_size'],
    'ModelSamplingAuraFlow': ['shift'],
    'SaveImage': ['filename_prefix'],
    'VAEDecode': [],
  };

  /**
   * Convert a ComfyUI saved workflow (nodes array format) to API format.
   * The saved format has `{ nodes: [{ id, type, inputs, outputs, widgets_values }] }`.
   * The API format needs `{ "nodeId": { class_type, inputs } }`.
   * 
   * IMPORTANT: In saved format, `inputs` only contains graph connection inputs
   * (like "clip", "model", "positive"). Widget values are purely positional
   * in `widgets_values` and must be mapped by position using _WIDGET_MAP.
   */
  static _convertSaveFormatToAPI(saved) {
    const nodes = saved.nodes || [];
    const links = saved.links || [];
    const apiWorkflow = {};
    
    // Build a lookup for links: linkId -> [fromNode, fromSlot, toNode, toSlot]
    const linkMap = {};
    for (const link of links) {
      // link format: [id, fromNode, fromSlot, toNode, toSlot, type]
      linkMap[link[0]] = { fromNode: link[1], toNode: link[3], toSlot: link[4] };
    }

    for (const node of nodes) {
      const nodeId = String(node.id);
      const apiNode = {
        class_type: node.type,
        inputs: {},
      };

      // Step 1: Process graph connections (inputs that link to other nodes)
      const nodeInputs = node.inputs || [];
      for (const input of nodeInputs) {
        if (input.link !== null && input.link !== undefined && linkMap[input.link]) {
          const linkInfo = linkMap[input.link];
          apiNode.inputs[input.name] = [String(linkInfo.fromNode), 0];
        }
      }

      // Step 2: Map widget values by position using the known widget map.
      // The `inputs` array in saved format does NOT contain widget entries,
      // so we map widgets_values directly by position.
      const wv = node.widgets_values || [];
      const widgetNames = ImageService._WIDGET_MAP[node.type] || [];
      
      for (let i = 0; i < wv.length && i < widgetNames.length; i++) {
        const wName = widgetNames[i];
        // Only set if not already set by a graph connection
        if (apiNode.inputs[wName] === undefined) {
          apiNode.inputs[wName] = wv[i];
        }
      }

      apiWorkflow[nodeId] = apiNode;
    }

    return apiWorkflow;
  }

  /**
   * Load the user's ComfyUI workflow template from disk.
   * The workflow file should be exported from ComfyUI UI (Save button).
   * Only the prompt text in CLIPTextEncode nodes gets replaced.
   * All other settings (steps, samplers, CFG, etc.) are preserved exactly as configured.
   */
  static _loadWorkflowTemplate() {
    const fs = require('fs');
    const path = require('path');
    const workflowPath = path.resolve(__dirname, '../../comfyui-workflow.json');

    if (fs.existsSync(workflowPath)) {
      try {
        const raw = fs.readFileSync(workflowPath, 'utf-8');
        const saved = JSON.parse(raw);
        
        // Check if it's saved format (has "nodes" array) or already API format
        if (saved.nodes) {
          const apiFormat = ImageService._convertSaveFormatToAPI(saved);
          LoggerService.info('Converted saved ComfyUI workflow to API format', {
            path: workflowPath,
            nodeCount: saved.nodes.length,
          });
          return apiFormat;
        }
        
        // Already in API format
        LoggerService.info('Loaded ComfyUI workflow template (API format)', { path: workflowPath });
        return saved;
      } catch (err) {
        LoggerService.warn('Failed to load ComfyUI workflow template, falling back to default', {
          error: err.message,
        });
      }
    }

    return null;
  }

  /**
   * Build a ComfyUI workflow with the given prompt.
   * 
   * If the user has a comfyui-workflow.json file, it loads that as a template
   * and only replaces the prompt text in CLIPTextEncode nodes.
   * 
   * Otherwise falls back to a hardcoded Qwen-Image workflow.
   */
  static async _buildWorkflow(prompt) {
    const template = ImageService._loadWorkflowTemplate();

    if (template) {
      // Use user's workflow — only replace prompt text in CLIPTextEncode nodes
      const modified = JSON.parse(JSON.stringify(template)); // deep clone
      const seed = Math.floor(Math.random() * 1000000000);

      let positiveReplaced = false;
      for (const [nodeId, node] of Object.entries(modified)) {
        // Replace prompt in CLIPTextEncode nodes (first found = positive prompt)
        if (node.class_type === 'CLIPTextEncode') {
          if (node.inputs && typeof node.inputs.text === 'string') {
            if (!positiveReplaced) {
              // First CLIPTextEncode = positive prompt
              node.inputs.text = prompt;
              positiveReplaced = true;
              LoggerService.debug(`Injected prompt into CLIPTextEncode node ${nodeId}`);
            } else {
              // Second CLIPTextEncode = negative prompt, leave as-is
              LoggerService.debug(`Kept negative prompt in CLIPTextEncode node ${nodeId}`);
            }
          }
        }
        // Replace seed in KSampler nodes for variety
        if (node.class_type === 'KSampler' || node.class_type === 'RandomNoise') {
          if (node.inputs && node.inputs.seed !== undefined) {
            node.inputs.seed = seed;
            LoggerService.debug(`Replaced seed in ${node.class_type} node ${nodeId}: ${seed}`);
          }
        }
      }

      LoggerService.info('Using user workflow template with prompt injected', {
        promptPreview: prompt.substring(0, 80),
        seed,
      });

      return modified;
    }

    // Fallback: hardcoded Qwen-Image workflow (keeps original quality settings)
    LoggerService.info('No workflow template found, using default Qwen-Image workflow');

    const unetModels = await ImageService._getNodeOptions('UNETLoader', 'unet_name');
    const clipModels = await ImageService._getNodeOptions('CLIPLoader', 'clip_name');
    const vaeModels = await ImageService._getNodeOptions('VAELoader', 'vae_name');

    const unetName = unetModels[0] || 'z_image_turbo_bf16.safetensors';
    const clipName = clipModels[0] || 'qwen_3_4b.safetensors';
    const vaeName = vaeModels[0] || 'ae.safetensors';
    const seed = Math.floor(Math.random() * 1000000000);

    return {
      "37": { "class_type": "UNETLoader", "inputs": { "unet_name": unetName, "weight_dtype": "default" } },
      "38": { "class_type": "CLIPLoader", "inputs": { "clip_name": clipName, "type": "qwen_image", "device": "default" } },
      "39": { "class_type": "VAELoader", "inputs": { "vae_name": vaeName } },
      "58": { "class_type": "EmptySD3LatentImage", "inputs": { "width": 1024, "height": 1024, "batch_size": 1 } },
      "6":  { "class_type": "CLIPTextEncode", "inputs": { "text": prompt, "clip": ["38", 0] } },
      "7":  { "class_type": "CLIPTextEncode", "inputs": { "text": "blurry, low quality, distorted, ugly, bad anatomy, watermark, text, signature", "clip": ["38", 0] } },
      "66": { "class_type": "ModelSamplingAuraFlow", "inputs": { "model": ["37", 0], "shift": 3.1 } },
      "3":  { "class_type": "KSampler", "inputs": { "seed": seed, "steps": 8, "cfg": 3.5, "sampler_name": "euler", "scheduler": "sgm_uniform", "denoise": 1, "model": ["66", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["58", 0] } },
      "8":  { "class_type": "VAEDecode", "inputs": { "samples": ["3", 0], "vae": ["39", 0] } },
      "9":  { "class_type": "SaveImage", "inputs": { "filename_prefix": "vireon_", "images": ["8", 0] } },
    };
  }

  /**
   * Poll ComfyUI for prompt completion.
   *
   * @param {string} comfyUrl - Base ComfyUI URL
   * @param {string} promptId - The prompt ID to poll
   * @param {number} timeout - Maximum timeout in ms
   * @returns {Promise<string>} The output filename
   */
  static async _pollForCompletion(comfyUrl, promptId, timeout) {
    const startTime = Date.now();
    const pollInterval = 1000; // 1 second

    while (Date.now() - startTime < timeout) {
      try {
        const response = await axios.get(`${comfyUrl}/history/${promptId}`, {
          timeout: 5000,
        });

        const historyData = response.data;

        // Check if the prompt is completed
        if (historyData[promptId]) {
          const outputs = historyData[promptId].outputs;

          // Find the first image output
          for (const nodeId of Object.keys(outputs)) {
            const nodeOutput = outputs[nodeId];
            if (nodeOutput.images && nodeOutput.images.length > 0) {
              const image = nodeOutput.images[0];
              const filename = image.filename;
              const subfolder = image.subfolder || '';
              const type = image.type || 'output';

              LoggerService.debug(`Image generation complete`, {
                promptId,
                filename,
                subfolder,
                type,
              });

              return { filename, subfolder, type };
            }
          }

          // If prompt is in history but no images found, it may have failed
          LoggerService.warn(`Prompt completed but no images found in output`, {
            promptId,
            outputs,
          });
          throw new Error('ComfyUI prompt completed but no images generated');
        }

        // Still processing, wait and retry
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      } catch (err) {
        if (err.response?.status === 404) {
          // Prompt not yet in history, still processing
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
          continue;
        }
        // Other errors may be transient, retry
        LoggerService.warn(`Error polling ComfyUI (will retry)`, {
          promptId,
          error: err.message,
        });
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
    }

    throw new Error(`ComfyUI image generation timed out after ${timeout}ms`);
  }

  /**
   * Download the generated image from ComfyUI output directory.
   *
   * @param {string} comfyUrl - Base ComfyUI URL
   * @param {Object} fileInfo - { filename, subfolder, type }
   * @param {string} targetPath - Where to save the image
   */
  static async _downloadImage(comfyUrl, fileInfo, targetPath) {
    const { filename, subfolder, type } = fileInfo;

    const viewUrl = `${comfyUrl}/view`;
    const response = await axios.get(viewUrl, {
      params: {
        filename,
        subfolder,
        type,
      },
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    await fs.writeFile(targetPath, response.data);

    LoggerService.debug(`Image downloaded from ComfyUI`, {
      url: viewUrl,
      filename,
      targetPath,
      size: `${(response.data.length / 1024).toFixed(1)} KB`,
    });
  }
}

module.exports = ImageService;