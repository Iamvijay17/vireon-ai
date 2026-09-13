const config = require('../../config');
const lmStudioManager = require('./lmStudioManager');
const ttsManager = require('./ttsManager');
const comfyUIManager = require('./comfyUIManager');
const avatarManager = require('./avatarManager');
const remotionStatus = require('./remotionStatus');
const { GPUResourceManager } = require('./gpuResourceManager');

/**
 * Local AI Service Manager: single place other services/routes reach for
 * "make sure LM Studio / Qwen3-TTS / ComfyUI is up" instead of assuming the
 * user opened them by hand, PLUS the GPU Resource Manager that sequences
 * those three so they never hold their models in VRAM at the same time -
 * this dev machine's 6GB RTX 2060 can't run all three loaded at once.
 *
 * Callers making an actual GPU-heavy request should go through
 * `gpu.withGPU(name, fn)` (see scriptStep.js/audioStep.js), NOT call
 * lmStudio.ensureRunning()/tts.ensureRunning() directly - the individual
 * managers' ensureRunning() (still used by LMStudioService/ttsClient
 * connect points, and by the manual start/stop/restart API below) only
 * makes sure a service is reachable, it doesn't participate in the
 * sequential GPU handoff by itself.
 */
const gpu = new GPUResourceManager();
gpu.register('llm', lmStudioManager, { autoStop: config.localAI.lmStudio.autoStop, process: lmStudioManager.process });
gpu.register('tts', ttsManager, { autoStop: config.localAI.tts.autoStop, process: ttsManager.process });
gpu.register('comfyui', comfyUIManager, { autoStop: config.localAI.comfyUI.autoStop, process: comfyUIManager.process });
gpu.register('avatar', avatarManager, { autoStop: config.localAI.avatar.autoStop, process: avatarManager.process });

async function getAllStatuses() {
  const [llm, tts, comfyui, avatar] = await Promise.all([
    lmStudioManager.getStatus(),
    ttsManager.getStatus(),
    comfyUIManager.getStatus(),
    avatarManager.getStatus(),
  ]);

  const gpuStatus = gpu.getStatus();

  return {
    gpu: gpuStatus.gpu,
    services: {
      llm: { ...llm, gpuState: gpuStatus.services.llm.status },
      tts: { ...tts, gpuState: gpuStatus.services.tts.status },
      comfyui: { ...comfyui, gpuState: gpuStatus.services.comfyui.status },
      avatar: { ...avatar, gpuState: gpuStatus.services.avatar.status },
      remotion: remotionStatus.getStatus(),
    },
  };
}

module.exports = {
  lmStudio: lmStudioManager,
  tts: ttsManager,
  comfyUI: comfyUIManager,
  avatar: avatarManager,
  gpu,
  getAllStatuses,
};
