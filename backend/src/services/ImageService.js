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
   * @returns {Promise<Array>} Scenes updated with imageUrl
   */
  static async generateAllImages(jobId, scenes) {
    const imagesDir = path.resolve(__dirname, '../../jobs', jobId, 'images');
    await fs.mkdir(imagesDir, { recursive: true });

    const updatedScenes = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
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
        });

        const imagePath = await ImageService.generateImage(
          jobId,
          scene.sceneNumber,
          imagePrompt,
          imagesDir
        );

        // Generate HTTP-accessible URL via Express static middleware
        const port = config.port || 3000;
        const imageUrl = `http://localhost:${port}/public/${jobId}/images/scene${scene.sceneNumber}.png`;

        updatedScenes.push({
          ...scene,
          imageUrl,
          localImagePath: imagePath,
        });

        LoggerService.success(`Image generated for scene ${scene.sceneNumber}`, {
          jobId,
          path: imagePath,
          url: imageUrl,
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
    const workflow = ImageService._buildWorkflow(prompt);

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
   * Build a ComfyUI workflow with the given prompt.
   * This uses a default txt2img workflow.
   * Users can customize this to match their ComfyUI setup.
   */
  static _buildWorkflow(prompt) {
    // Default txt2img workflow compatible with SDXL / SD 1.5
    // This is a minimal workflow - users can override with their own
    return {
      "3": {
        "class_type": "KSampler",
        "inputs": {
          "seed": Math.floor(Math.random() * 1000000000),
          "steps": 20,
          "cfg": 7,
          "sampler_name": "euler",
          "scheduler": "normal",
          "denoise": 1,
          "model": ["4", 0],
          "positive": ["6", 0],
          "negative": ["7", 0],
          "latent_image": ["5", 0],
        },
      },
      "4": {
        "class_type": "CheckpointLoaderSimple",
        "inputs": {
          "ckpt_name": "sd_xl_base_1.0.safetensors",
        },
      },
      "5": {
        "class_type": "EmptyLatentImage",
        "inputs": {
          "width": 1024,
          "height": 1024,
          "batch_size": 1,
        },
      },
      "6": {
        "class_type": "CLIPTextEncode",
        "inputs": {
          "text": prompt,
          "clip": ["4", 1],
        },
      },
      "7": {
        "class_type": "CLIPTextEncode",
        "inputs": {
          "text": "blurry, low quality, distorted, ugly, bad anatomy, watermark, text, signature",
          "clip": ["4", 1],
        },
      },
      "8": {
        "class_type": "VAEDecode",
        "inputs": {
          "samples": ["3", 0],
          "vae": ["4", 2],
        },
      },
      "9": {
        "class_type": "SaveImage",
        "inputs": {
          "filename_prefix": "vireon_",
          "images": ["8", 0],
        },
      },
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