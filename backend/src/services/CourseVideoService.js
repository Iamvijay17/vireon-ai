const CourseVideo = require('../models/CourseVideo');
const CourseService = require('./CourseService');
const LoggerService = require('./LoggerService');
const SocketService = require('./SocketService');
const ActivityLogService = require('./ActivityLogService');
const LMStudioService = require('./LMStudioService');
const AudioService = require('./TTS/audioService');
const RemotionService = require('./RemotionService');
const ScriptParserService = require('./ScriptParserService');
const { VIDEO_STATUS, SOCKET_EVENTS } = require('../constants');

/**
 * Service for managing course videos.
 * Single Responsibility: Course video CRUD and generation pipeline.
 */
class CourseVideoService {
  /**
   * Create a new video in a course.
   */
  static async create(courseId, data) {
    // Get the next order number
    const lastVideo = await CourseVideo.findOne({ courseId })
      .sort({ order: -1 })
      .select('order');

    const order = (lastVideo?.order ?? -1) + 1;

    const video = await CourseVideo.create({
      courseId,
      title: data.title,
      topic: data.topic || data.title,
      order,
      duration: data.duration || 5,
      voice: data.voice || 'female-1',
      style: data.style || 'educational',
      additionalInstructions: data.additionalInstructions || '',
      status: VIDEO_STATUS.DRAFT,
    });

    // Update course status
    await CourseService.recalculateStatus(courseId);

    LoggerService.info('Course video created', {
      videoId: video._id,
      courseId,
      title: video.title,
      order,
    });

    return video;
  }

  /**
   * Get all videos for a course.
   */
  static async getByCourse(courseId, page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const [videos, total] = await Promise.all([
      CourseVideo.find({ courseId })
        .sort({ order: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CourseVideo.countDocuments({ courseId }),
    ]);

    return {
      videos,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single video by ID.
   */
  static async getById(videoId) {
    const video = await CourseVideo.findById(videoId);
    if (!video) {
      throw { status: 404, message: 'Video not found' };
    }
    return video;
  }

  /**
   * Update a video.
   */
  static async update(videoId, data) {
    const video = await CourseVideo.findByIdAndUpdate(
      videoId,
      { $set: data },
      { new: true, runValidators: true }
    );
    if (!video) {
      throw { status: 404, message: 'Video not found' };
    }

    LoggerService.info('Course video updated', {
      videoId,
      title: video.title,
    });

    return video;
  }

  /**
   * Delete a video.
   */
  static async delete(videoId) {
    const video = await CourseVideo.findByIdAndDelete(videoId);
    if (!video) {
      throw { status: 404, message: 'Video not found' };
    }

    // Update course status
    await CourseService.recalculateStatus(video.courseId);

    LoggerService.info('Course video deleted', {
      videoId,
      courseId: video.courseId,
    });

    return { message: 'Video deleted successfully' };
  }

  /**
   * Generate script for a video using LM Studio.
   */
  static async generateScript(videoId) {
    const video = await CourseVideo.findById(videoId);
    if (!video) {
      throw { status: 404, message: 'Video not found' };
    }

    // Update status
    video.status = VIDEO_STATUS.GENERATING_SCRIPT;
    await video.save();

    await ActivityLogService.add(videoId, 'Script generation started');
    SocketService.emitCourseVideoProgress(video, VIDEO_STATUS.GENERATING_SCRIPT, 10, 'Generating script...');

    try {
      // Build prompt for LM Studio
      const prompt = this.buildScriptPrompt(video);

      // Call LM Studio
      const rawScriptData = await LMStudioService.generateScript(prompt);

      // Parse and validate script to ensure scene_meta is generated and scene types are normalized
      const scriptData = ScriptParserService.validate(rawScriptData, video.style || 'educational');

      // Store the generated script
      video.script = JSON.stringify(scriptData, null, 2);
      video.status = VIDEO_STATUS.SCRIPT_GENERATED;
      video.scriptGeneratedAt = new Date();

      // Save script to disk for Remotion pipeline
      await ScriptParserService.saveScript(video._id.toString(), scriptData);
      await video.save();

      LoggerService.info('Course video script generated', {
        videoId,
        courseId: video.courseId,
        title: video.title,
        scriptLength: video.script.length,
      });

      await ActivityLogService.add(videoId, 'Script generated successfully. Please review and approve.', video.scriptGeneratedAt);
      // Emit socket event
      SocketService.emitCourseVideoScriptReady(video, 'Script generated successfully. Please review and approve.');

      return video;
    } catch (err) {
      video.status = VIDEO_STATUS.FAILED;
      video.error = {
        message: err.message,
        step: 'Script Generation',
        retryCount: (video.error?.retryCount || 0) + 1,
      };
      await video.save();

      await ActivityLogService.add(videoId, `Script generation failed: ${err.message}`);
      SocketService.emitCourseVideoFailed(video, err.message, 'Script Generation');

      throw err;
    }
  }

  /**
   * Build the prompt for LM Studio script generation.
   * Uses a concise prompt to reduce generation time on slower models.
   */
  static buildScriptPrompt(video) {
    const durationMinutes = video.duration;
    const wordCount = durationMinutes * 130;

    return `Create a ${durationMinutes}min educational video script about "${video.topic}".

Return ONLY valid JSON with this structure:
{
  "title": "${video.title}",
  "description": "Brief description",
  "tags": ["tag1", "tag2"],
  "thumbnailPrompt": "image generation prompt",
  "scenes": [
    {
      "sceneNumber": 1,
      "sceneType": "intro|content|image",
      "title": "Scene title",
      "subtitle": "Supporting text",
      "backgroundColor": "#1a1a2e",
      "transition": "fade",
      "cameraMotion": "static",
      "animation": "",
      "imagePrompt": "",
      "scene_meta": { "content": ["", "", ""] },
      "audio": { "text": "Narration text here (~${Math.round(wordCount / 5)} words per scene)" }
    }
  ]
}

Rules:
- Total narration: ~${wordCount} words across all scenes
- 5-8 scenes total: 1 intro, 3-5 content, 1 summary
- Scene duration: 8-15 seconds each
- sceneType must be one of: "intro", "content", or "image"
- Use "intro" for the opening scene
- Use "content" for main educational content
- Use "image" only for scenes requiring AI-generated background images
- Only include "imagePrompt" when sceneType is "image"; leave it as empty string for other scene types
- For every scene with sceneType "content", include a scene_meta object with a "content" array containing the narration text split into individual sentences
- Make it beginner-friendly with examples
- End with a call to action
- ${video.additionalInstructions ? `Additional: ${video.additionalInstructions}` : ''}
- Return ONLY valid JSON, no markdown, no code blocks`;
  }

  /**
   * Approve a script so generation can continue.
   */
  static async approveScript(videoId) {
    const video = await CourseVideo.findById(videoId);
    if (!video) {
      throw { status: 404, message: 'Video not found' };
    }

    if (video.status !== VIDEO_STATUS.SCRIPT_GENERATED && video.status !== VIDEO_STATUS.WAITING_FOR_APPROVAL) {
      throw { status: 400, message: `Script cannot be approved in ${video.status} state` };
    }

    video.approved = true;
    video.approvedAt = new Date();
    video.status = VIDEO_STATUS.APPROVED;
    await video.save();

    await ActivityLogService.add(videoId, 'Script approved');

    LoggerService.info('Course video script approved', {
      videoId,
      courseId: video.courseId,
    });

    return video;
  }

  /**
   * Update the script (editing).
   */
  static async updateScript(videoId, script) {
    const video = await CourseVideo.findById(videoId);
    if (!video) {
      throw { status: 404, message: 'Video not found' };
    }

    video.script = script;
    video.status = VIDEO_STATUS.WAITING_FOR_APPROVAL;
    await video.save();

    await ActivityLogService.add(videoId, 'Script edited and saved');

    return video;
  }

  /**
   * Regenerate the script.
   */
  static async regenerateScript(videoId) {
    // Reset script data and re-generate
    const video = await CourseVideo.findById(videoId);
    if (!video) {
      throw { status: 404, message: 'Video not found' };
    }

    video.script = '';
    video.scriptGeneratedAt = null;
    video.approved = false;
    video.approvedAt = null;
    await video.save();

    await ActivityLogService.add(videoId, 'Script regeneration started');

    return this.generateScript(videoId);
  }

  /**
   * Generate audio for an approved video.
   */
  static async generateAudio(videoId) {
    const video = await CourseVideo.findById(videoId);
    if (!video) {
      throw { status: 404, message: 'Video not found' };
    }

    if (!video.approved) {
      throw { status: 400, message: 'Script must be approved before generating audio' };
    }

    video.status = VIDEO_STATUS.GENERATING_AUDIO;
    await video.save();

    await ActivityLogService.add(videoId, 'Audio generation started');
    SocketService.emitCourseVideoProgress(video, VIDEO_STATUS.GENERATING_AUDIO, 40, 'Generating audio...');

    try {
      // Parse script to extract scenes
      let scriptData;
      try {
        scriptData = JSON.parse(video.script);
      } catch {
        // If script is plain text, create a single scene
        scriptData = {
          scenes: [{
            sceneNumber: 1,
            audio: { text: video.script },
          }],
        };
      }

      const scenes = scriptData.scenes || [];

      if (scenes.length === 0) {
        // Create a single scene with the full script
        scenes.push({
          sceneNumber: 1,
          audio: { text: video.script },
        });
      }

      // Convert scenes to the format expected by AudioService
      // Ensure sceneType is included in the audio scenes
      const audioScenes = scenes.map((s, index) => {
        let sceneType = s.sceneType;
        if (!sceneType) {
          const sceneNum = s.sceneNumber || (index + 1);
          if (sceneNum === 1) sceneType = 'intro';
          else if (scenes.length > 0 && sceneNum === scenes.length) sceneType = 'summary';
          else sceneType = 'content';
        }
        return {
          sceneNumber: s.sceneNumber || (index + 1),
          sceneType,
          audio: {
            text: s.audio?.text || s.title || '',
          },
        };
      });

      // Generate audio for all scenes - use videoId as job directory
      const jobId = video._id.toString();
      const audioResults = await AudioService.generateAllAudio(jobId, audioScenes, video.voice);

      // Update each scene with actual audio duration
      for (const result of audioResults) {
        // Extract scene number from the result - either from sceneNumber property or from filename
        const sceneNum = result.sceneNumber || (typeof result.file === 'string' ? parseInt(result.file.match(/\d+/)?.[0], 10) : null);
        const scene = scriptData.scenes.find(s => s.sceneNumber === sceneNum);
        if (scene && result.duration) {
          scene.audio = {
            ...scene.audio,
            file: result.file,
            duration: result.duration,
          };
          // Update scene duration to match actual audio duration
          scene.duration = result.duration;
        }
      }

      // Save updated script with audio durations back to database and disk
      video.script = JSON.stringify(scriptData, null, 2);
      
      // Also save updated script to disk for Remotion pipeline
      await ScriptParserService.saveScript(video._id.toString(), scriptData);

      // Store audio URL (first scene's audio for preview, or full path)
      if (audioResults.length > 0) {
        video.audioUrl = audioResults[0].path || audioResults[0].file || '';
        video.audioDuration = audioResults.reduce((sum, r) => sum + (r.duration || 0), 0);
      }

      video.status = VIDEO_STATUS.AUDIO_GENERATED;
      video.audioGeneratedAt = new Date();
      await video.save();

      LoggerService.info('Course video audio generated', {
        videoId,
        courseId: video.courseId,
        scenes: audioResults.length,
        totalDuration: video.audioDuration,
      });

      await ActivityLogService.add(videoId, 'Audio generated successfully.', video.audioGeneratedAt);
      SocketService.emitCourseVideoAudioReady(video, 'Audio generated successfully.');

      return video;
    } catch (err) {
      video.status = VIDEO_STATUS.FAILED;
      video.error = {
        message: err.message,
        step: 'Audio Generation',
        retryCount: (video.error?.retryCount || 0) + 1,
      };
      await video.save();

      await ActivityLogService.add(videoId, `Audio generation failed: ${err.message}`);
      SocketService.emitCourseVideoFailed(video, err.message, 'Audio Generation');

      throw err;
    }
  }

  /**
   * Render a video using the actual Remotion pipeline.
   * Prepares assets, then calls RemotionService to render.
   * Falls back to a placeholder if Remotion is unavailable.
   */
  static async renderVideo(videoId) {
    const video = await CourseVideo.findById(videoId);
    if (!video) {
      throw { status: 404, message: 'Video not found' };
    }

    video.status = VIDEO_STATUS.RENDERING_VIDEO;
    video.renderProgress = 0;
    await video.save();

    await ActivityLogService.add(videoId, 'Rendering started');
    SocketService.emitCourseVideoProgress(video, VIDEO_STATUS.RENDERING_VIDEO, 60, 'Preparing assets for rendering...');

    try {
      // Parse the script to get scene data
      let scriptData;
      try {
        scriptData = JSON.parse(video.script);
      } catch {
        throw new Error('Invalid script JSON - cannot render');
      }

      const scenes = scriptData.scenes || [];
      if (scenes.length === 0) {
        throw new Error('No scenes found in script');
      }

       // Map audio files to scenes - use videoId as job directory
       const jobId = video._id.toString();
       const scenesWithAudio = scenes.map((scene) => {
         const sceneNum = scene.sceneNumber || 1;
         // Determine sceneType if not present (based on position)
         let sceneType = scene.sceneType;
         if (!sceneType) {
           if (sceneNum === 1) sceneType = 'intro';
           else if (scenes.length > 0 && sceneNum === scenes.length) sceneType = 'summary';
           else sceneType = 'content';
         }
         // Use audio duration if available (set during generateAudio), otherwise use scene duration
         const audioDuration = scene.audio?.duration || scene.duration || 8;
         
         // Also update the scene duration to match the audio duration for proper rendering
         return {
           ...scene,
           sceneType,
           duration: audioDuration, // Update scene duration to match audio
           audio: {
             ...scene.audio,
             file: `scene${sceneNum}.mp3`,
             duration: audioDuration,
           },
         };
       });
       
       // Log the scene durations for debugging
       const totalSceneDuration = scenesWithAudio.reduce((sum, s) => sum + (s.duration || 8), 0);
       LoggerService.info('Scene durations mapped for video rendering', {
         videoId,
         sceneDurations: scenesWithAudio.map(s => ({ sceneNumber: s.sceneNumber, duration: s.duration, audioDuration: s.audio?.duration })),
         totalDuration: totalSceneDuration,
       });

      // Build the script object for Remotion
      const remotionScript = {
        title: scriptData.title || video.title,
        description: scriptData.description || '',
        scenes: scenesWithAudio,
      };

      // Job config
      const jobConfig = {
        resolution: '1920x1080',
        aspectRatio: '16:9',
        type: video.style || 'educational',
      };

      // Prepare assets for Remotion
      SocketService.emitCourseVideoProgress(video, VIDEO_STATUS.PREPARING_ASSETS, 65, 'Preparing assets...');

      await RemotionService.prepareAssets(jobId, remotionScript, jobConfig);

      // Update progress
      video.renderProgress = 70;
      await video.save();

      SocketService.emitCourseVideoProgress(video, VIDEO_STATUS.RENDERING_VIDEO, 80, 'Rendering video...');

      // Try Remotion render - throw error if it fails
      const renderResult = await RemotionService.renderVideo(jobId);
      const renderUrl = `/public/${jobId}/render/video.mp4`;
      LoggerService.info('Course video rendered via Remotion', { videoId, renderUrl });

      // Set the render URL
      video.renderUrl = renderUrl;
      video.status = VIDEO_STATUS.COMPLETED;
      video.renderedAt = new Date();
      video.renderProgress = 100;
      await video.save();

      // Update course status
      await CourseService.recalculateStatus(video.courseId);

      LoggerService.info('Course video render completed', {
        videoId,
        courseId: video.courseId,
        renderUrl,
      });

      await ActivityLogService.add(videoId, 'Video rendering completed!', video.renderedAt);
      SocketService.emitCourseVideoRenderReady(video, 'Video completed!');

      return video;
    } catch (err) {
      video.status = VIDEO_STATUS.FAILED;
      video.error = {
        message: err.message,
        step: 'Rendering',
        retryCount: (video.error?.retryCount || 0) + 1,
      };
      await video.save();

      await ActivityLogService.add(videoId, `Rendering failed: ${err.message}`);
      SocketService.emitCourseVideoFailed(video, err.message, 'Rendering');

      throw err;
    }
  }

  /**
   * Retry a failed video step.
   */
  static async retryStep(videoId) {
    const video = await CourseVideo.findById(videoId);
    if (!video) {
      throw { status: 404, message: 'Video not found' };
    }

    if (video.status !== VIDEO_STATUS.FAILED) {
      throw { status: 400, message: `Video is in ${video.status} state, not Failed` };
    }

    const failedStep = video.error?.step || 'Script Generation';

    // Clear error
    video.error = { message: '', step: '', retryCount: 0 };
    await video.save();

    await ActivityLogService.add(videoId, `Retrying ${failedStep}...`);

    // Retry based on the failed step
    switch (failedStep) {
      case 'Script Generation':
        return this.generateScript(videoId);
      case 'Audio Generation':
        return this.generateAudio(videoId);
      case 'Rendering':
        return this.renderVideo(videoId);
      default:
        return this.generateScript(videoId);
    }
  }
}

module.exports = CourseVideoService;