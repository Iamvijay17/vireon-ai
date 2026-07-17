/**
 * ComfyUI Image Generation Test Script
 *
 * Tests Qwen-Image model (ComfyUI Desktop) image generation.
 *
 * Usage:
 *   node test-comfyui.mjs
 *
 * Requirements:
 *   - ComfyUI Desktop running at http://127.0.0.1:8188
 *   - Qwen-Image models installed (UNET + CLIP + VAE)
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const path = require('path');
const fs = require('fs').promises;

import dotenv from 'dotenv';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '.env');
dotenv.config({ path: envPath });

const COMFYUI_URL = process.env.COMFYUI_URL || 'http://127.0.0.1:8188';

async function fetchAPI(url) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function getNodeOptions(nodeType, inputName) {
  try {
    const info = await fetchAPI(`${COMFYUI_URL}/object_info/${nodeType}`);
    const opts = info[nodeType]?.input?.required?.[inputName]?.[0] || [];
    return opts.filter(n => n && !n.startsWith('put_'));
  } catch { return []; }
}

async function testComfyUI() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   ComfyUI Image Generation Test (Qwen-Image)    ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  // Step 1: Check ComfyUI is running
  console.log(`🔍 Checking ComfyUI at: ${COMFYUI_URL}`);
  try {
    await fetchAPI(`${COMFYUI_URL}/queue`);
    console.log('✅ ComfyUI is running!');
  } catch (err) {
    console.log(`❌ Cannot connect: ${err.message}`);
    process.exit(1);
  }

  // Step 2: Discover Qwen-Image models
  console.log('');
  console.log('🔍 Discovering available models...');

  const unetModels = await getNodeOptions('UNETLoader', 'unet_name');
  const clipModels = await getNodeOptions('CLIPLoader', 'clip_name');
  const vaeModels = await getNodeOptions('VAELoader', 'vae_name');

  if (unetModels.length === 0) {
    console.log('❌ No UNET models found. Qwen-Image may not be installed.');
    process.exit(1);
  }

  console.log(`   UNET:  ${unetModels.join(', ')}`);
  console.log(`   CLIP:  ${clipModels.join(', ')}`);
  console.log(`   VAE:   ${vaeModels.join(', ')}`);

  const unetName = unetModels[0];
  const clipName = clipModels[0];
  const vaeName = vaeModels[0];

  console.log('');
  console.log(`📝 Using:`);
  console.log(`   UNET: ${unetName}`);
  console.log(`   CLIP: ${clipName}`);
  console.log(`   VAE:  ${vaeName}`);

  // Step 3: Check for user's workflow template
  const workflowPath = path.resolve(__dirname, 'comfyui-workflow.json');
  let workflow = null;

  try {
    const exists = await fs.access(workflowPath).then(() => true).catch(() => false);
    if (exists) {
      const raw = await fs.readFile(workflowPath, 'utf-8');
      const saved = JSON.parse(raw);
      
      // Convert saved format (nodes array) to API format (flat object)
      if (saved.nodes) {
        console.log(`📂 Converting your saved workflow (${saved.nodes.length} nodes)...`);
        
        // Widget-to-input-name mapping for known node types
        const WIDGET_MAP = {
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
        
        const links = saved.links || [];
        const linkMap = {};
        for (const link of links) linkMap[link[0]] = { fromNode: link[1], toNode: link[3], toSlot: link[4] };
        
        workflow = {};
        for (const node of saved.nodes) {
          const nid = String(node.id);
          const apiNode = { class_type: node.type, inputs: {} };
          const inputs = node.inputs || [];
          const wv = node.widgets_values || [];
          
          // Step 1: Map graph connections (inputs that link to other nodes)
          for (const inp of inputs) {
            if (inp.link !== null && inp.link !== undefined && linkMap[inp.link]) {
              apiNode.inputs[inp.name] = [String(linkMap[inp.link].fromNode), 0];
            }
          }
          
          // Step 2: Map widget values by position using WIDGET_MAP
          // (The saved format's `inputs` array does NOT contain widget entries,
          //  so we map widgets_values directly by position.)
          const widgetNames = WIDGET_MAP[node.type] || [];
          for (let i = 0; i < wv.length && i < widgetNames.length; i++) {
            if (apiNode.inputs[widgetNames[i]] === undefined) {
              apiNode.inputs[widgetNames[i]] = wv[i];
            }
          }
          
          workflow[nid] = apiNode;
        }
        console.log(`   Converted to API format (${Object.keys(workflow).length} nodes)`);
      } else {
        workflow = saved;
        console.log('📂 Loaded workflow (API format)');
      }

      // Only replace prompt text and seed
      const testPrompt = 'A beautiful sunset over mountains, digital art, vibrant colors, high quality, 8k';
      const seed = Math.floor(Math.random() * 1000000000);
      let positiveReplaced = false;
      for (const node of Object.values(workflow)) {
        if (node.class_type === 'CLIPTextEncode' && typeof node.inputs?.text === 'string') {
          if (!positiveReplaced) {
            node.inputs.text = testPrompt;
            positiveReplaced = true;
          }
        }
        if ((node.class_type === 'KSampler' || node.class_type === 'RandomNoise') && node.inputs?.seed !== undefined) {
          node.inputs.seed = seed;
        }
      }
      console.log(`   Injected prompt: "${testPrompt.substring(0, 50)}..."`);
    }
  } catch (err) {
    console.log(`   Warning: Could not load workflow: ${err.message}`);
  }

  // Step 4: If no workflow file, use fallback
  if (!workflow) {
    console.log('📝 No comfyui-workflow.json found or it failed to load');
    console.log('📝 No comfyui-workflow.json found, using fallback workflow (may be lower quality)');
    console.log('   To get better quality:');
    console.log('   1. Open ComfyUI and configure your high-quality workflow');
    console.log('   2. Click Save (Ctrl+S)');
    console.log('   3. Save the file as "comfyui-workflow.json" in the backend/ folder');
    console.log('   4. Run this test again');
    console.log('');

    const testPrompt = 'A beautiful sunset over mountains, digital art, vibrant colors, high quality, 8k';
    const seed = Math.floor(Math.random() * 1000000000);

    workflow = {
      "37": { "class_type": "UNETLoader", "inputs": { "unet_name": unetName, "weight_dtype": "default" } },
      "38": { "class_type": "CLIPLoader", "inputs": { "clip_name": clipName, "type": "qwen_image", "device": "default" } },
      "39": { "class_type": "VAELoader", "inputs": { "vae_name": vaeName } },
      "58": { "class_type": "EmptySD3LatentImage", "inputs": { "width": 1024, "height": 1024, "batch_size": 1 } },
      "6":  { "class_type": "CLIPTextEncode", "inputs": { "text": testPrompt, "clip": ["38", 0] } },
      "7":  { "class_type": "CLIPTextEncode", "inputs": { "text": "blurry, low quality, distorted, ugly, bad anatomy, watermark, text, signature", "clip": ["38", 0] } },
      "66": { "class_type": "ModelSamplingAuraFlow", "inputs": { "model": ["37", 0], "shift": 3.1 } },
      "3":  { "class_type": "KSampler", "inputs": { "seed": seed, "steps": 8, "cfg": 3.5, "sampler_name": "euler", "scheduler": "sgm_uniform", "denoise": 1, "model": ["66", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["58", 0] } },
      "8":  { "class_type": "VAEDecode", "inputs": { "samples": ["3", 0], "vae": ["39", 0] } },
      "9":  { "class_type": "SaveImage", "inputs": { "filename_prefix": "vireon_test_", "images": ["8", 0] } },
    };
  }

  console.log('');
  console.log('⏳ Generating image...');

  try {
    const resp = await fetch(`${COMFYUI_URL}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow }),
      signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);

    const data = await resp.json();
    const promptId = data.prompt_id;
    console.log(`✅ Prompt submitted! ID: ${promptId}`);

    // Poll for completion
    let imageFile = null;
    const startTime = Date.now();

    while (!imageFile && (Date.now() - startTime) < 120000) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        const hist = await fetchAPI(`${COMFYUI_URL}/history/${promptId}`);
        if (hist[promptId]) {
          const outputs = hist[promptId].outputs;
          for (const nodeId of Object.keys(outputs)) {
            const imgs = outputs[nodeId]?.images;
            if (imgs?.length > 0) { imageFile = imgs[0]; break; }
          }
          if (!imageFile) throw new Error('No images in output');
        }
        process.stdout.write('.');
      } catch (err) {
        if (err.message.includes('No images')) throw err;
        process.stdout.write('x');
      }
    }

    if (!imageFile) throw new Error('Timed out');
    console.log('');
    console.log(`✅ Image generated: ${imageFile.filename}`);

    // Download
    console.log('📥 Downloading...');
    const params = new URLSearchParams({
      filename: imageFile.filename,
      subfolder: imageFile.subfolder || '',
      type: imageFile.type || 'output',
    });
    const dl = await fetch(`${COMFYUI_URL}/view?${params}`, { signal: AbortSignal.timeout(30000) });
    const buffer = Buffer.from(await dl.arrayBuffer());

    const outputDir = path.resolve(__dirname, 'test-output');
    await fs.mkdir(outputDir, { recursive: true });
    const outPath = path.join(outputDir, `comfyui-test-${Date.now()}.png`);
    await fs.writeFile(outPath, buffer);

    console.log(`   Saved: ${outPath}`);
    console.log(`   Size: ${(buffer.length / 1024).toFixed(1)} KB`);
    console.log(`   Time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   ✅  ComfyUI TEST PASSED!                       ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');

  } catch (err) {
    console.log('');
    console.log('❌ Test failed:', err.message);
    console.log('');
    console.log('   Check ComfyUI console for errors.');
    console.log('');
    process.exit(1);
  }
}

testComfyUI().catch(err => { console.error(err); process.exit(1); });
