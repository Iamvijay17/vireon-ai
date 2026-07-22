const fs = require('fs').promises;
const path = require('path');
const CourseVideo = require('../models/CourseVideo');
const CourseService = require('./CourseService');
const LoggerService = require('./LoggerService');
const SocketService = require('./SocketService');
const ActivityLogService = require('./ActivityLogService');
const LMStudioService = require('./LMStudioService');
const AudioService = require('./TTS/audioService');
const RemotionService = require('./RemotionService');
const ScriptParserService = require('./ScriptParserService');
const StorageService = require('./StorageService');
const GitHubService = require('./GitHubService');
const { VIDEO_STATUS, STAGE_STATUS, SOCKET_EVENTS } = require('../constants');

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
   * Generate a full Udemy-style curriculum via the LLM and return it for
   * review - no CourseVideo records are created yet. The caller (frontend)
   * shows this as an editable preview; the user can modify titles/topics,
   * remove lessons, or add their own before approving creation via
   * createFromLessons(). Purely a read: no DB writes, no socket emit.
   */
  static async previewCurriculum(title, topic) {
    return LMStudioService.generateCurriculum(title, topic);
  }

  /**
   * Create one CourseVideo (status Draft, all stages Pending) per lesson
   * from an approved/edited lesson list (the output of previewCurriculum,
   * possibly modified by the user). Does NOT trigger script/audio/render
   * generation - that's a separate, explicit action per the "AI only
   * builds structure, generation is manual/bulk" requirement. Always
   * appends after existing lessons, never replaces them.
   */
  static async createFromLessons(courseId, lessons, options) {
    const { voice, style, duration, additionalInstructions } = options;

    if (!Array.isArray(lessons) || lessons.length === 0) {
      throw { status: 400, message: 'lessons must be a non-empty array' };
    }

    const lastVideo = await CourseVideo.findOne({ courseId }).sort({ order: -1 }).select('order');
    let order = (lastVideo?.order ?? -1) + 1;

    const videos = [];
    for (const lesson of lessons) {
      const video = await CourseVideo.create({
        courseId,
        title: lesson.title || `Lesson ${order + 1}`,
        topic: lesson.topic || lesson.description || lesson.title || '',
        order: order++,
        duration: duration || 5,
        voice: voice || 'female-1',
        style: style || 'educational',
        additionalInstructions: additionalInstructions || '',
        status: VIDEO_STATUS.DRAFT,
      });
      videos.push(video);
    }

    await CourseService.recalculateStatus(courseId);

    LoggerService.info('Course curriculum videos created', {
      courseId,
      lessons: videos.length,
    });

    // Reuses the existing COURSE_VIDEO_CREATED event - CourseDetail.jsx
    // already listens for it and refetches the video list on receipt.
    SocketService.emitToCourse(courseId, SOCKET_EVENTS.COURSE_VIDEO_CREATED, {
      bulk: true,
      count: videos.length,
    });

    return videos;
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
    video.scriptStatus = STAGE_STATUS.PROCESSING;
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
      video.scriptStatus = STAGE_STATUS.COMPLETED;
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
      video.scriptStatus = STAGE_STATUS.FAILED;
      video.scriptError = { message: err.message, failedAt: new Date() };
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

    if (!video.script) {
      throw { status: 400, message: 'A script must exist before generating audio' };
    }

    video.status = VIDEO_STATUS.GENERATING_AUDIO;
    video.audioStatus = STAGE_STATUS.PROCESSING;
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

      // Store audio URL (first scene's audio for preview). `path` is an
      // absolute filesystem path (not servable), so build the public URL
      // from `file` instead, matching the jobs/<id>/audio static route.
      if (audioResults.length > 0) {
        video.audioUrl = audioResults[0].file
          ? `/public/${jobId}/audio/${audioResults[0].file}`
          : '';
        video.audioDuration = audioResults.reduce((sum, r) => sum + (r.duration || 0), 0);
      }

      video.status = VIDEO_STATUS.AUDIO_GENERATED;
      video.audioStatus = STAGE_STATUS.COMPLETED;
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
      video.audioStatus = STAGE_STATUS.FAILED;
      video.audioError = { message: err.message, failedAt: new Date() };
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
    video.videoStatus = STAGE_STATUS.PROCESSING;
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

      // Set the local render URL - the video is fully playable at this
      // point even if the cloud upload below fails.
      video.renderUrl = renderUrl;
      video.renderedAt = new Date();
      video.renderProgress = 90;
      video.status = VIDEO_STATUS.UPLOADING;
      await video.save();

      await ActivityLogService.add(videoId, 'Rendering complete. Uploading assets to cloud storage...');
      SocketService.emitCourseVideoProgress(video, VIDEO_STATUS.UPLOADING, 90, 'Uploading assets to cloud storage...');

      // Automatically push generated assets to GitHub storage. Soft-fails:
      // on any error the video stays on its local paths and is still
      // fully playable, per the "local first, cloud when available" contract.
      await this._uploadAssetsToCloud(video, scriptData);

      video.status = VIDEO_STATUS.COMPLETED;
      video.videoStatus = STAGE_STATUS.COMPLETED;
      video.renderProgress = 100;
      await video.save();

      // Update course status
      await CourseService.recalculateStatus(video.courseId);

      LoggerService.info('Course video render completed', {
        videoId,
        courseId: video.courseId,
        renderUrl: video.renderUrl,
      });

      await ActivityLogService.add(videoId, 'Video rendering completed!', video.renderedAt);
      SocketService.emitCourseVideoRenderReady(video, 'Video completed!');

      return video;
    } catch (err) {
      video.status = VIDEO_STATUS.FAILED;
      video.videoStatus = STAGE_STATUS.FAILED;
      video.videoError = { message: err.message, failedAt: new Date() };
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
   * Automatically push generated assets (per-scene narration audio + the
   * rendered video/thumbnail) to GitHub storage after a successful render,
   * swapping local /public paths for cloud URLs on the video record.
   *
   * Never throws: a failed upload leaves the video on its local paths,
   * which stay fully playable, so rendering itself is never blocked on
   * cloud availability. Scene audio files are uploaded individually
   * (rather than via a directory listing) so each cloud URL can be mapped
   * back to the exact scene it belongs to.
   */
  static async _uploadAssetsToCloud(video, scriptData) {
    const jobId = video._id.toString();
    let anyUploaded = false;

    try {
      if (scriptData?.scenes?.length) {
        const audioDir = StorageService.getAudioDir(jobId);
        for (const scene of scriptData.scenes) {
          const fileName = scene.audio?.file;
          if (!fileName || /^https?:\/\//i.test(fileName)) continue;

          const localPath = path.join(audioDir, fileName);
          try {
            await fs.access(localPath);
          } catch {
            continue; // scene has no local audio file (e.g. no narration)
          }

          const url = await GitHubService.uploadFile(jobId, localPath, 'audio');
          scene.audio.file = url;
          anyUploaded = true;
        }

        if (anyUploaded) {
          video.script = JSON.stringify(scriptData, null, 2);
          const firstCloudUrl = scriptData.scenes.find((s) => /^https?:\/\//i.test(s.audio?.file || ''))?.audio?.file;
          if (firstCloudUrl) video.audioUrl = firstCloudUrl;
        }
      }

      const renderDir = StorageService.getRenderDir(jobId);
      let renderFiles = [];
      try {
        renderFiles = await fs.readdir(renderDir);
      } catch {
        renderFiles = [];
      }

      for (const fileName of renderFiles) {
        const url = await GitHubService.uploadFile(jobId, path.join(renderDir, fileName), 'render');
        if (/\.(mp4|mov|webm)$/i.test(fileName)) {
          video.renderUrl = url;
        }
        anyUploaded = true;
      }

      if (anyUploaded) {
        await video.save();
        LoggerService.success('Course video assets uploaded to cloud storage', {
          videoId: video._id,
          renderUrl: video.renderUrl,
        });
        await ActivityLogService.add(video._id, 'Assets uploaded to cloud storage.');
        SocketService.emitCourseVideoUpdated(video, 'Assets uploaded to cloud storage.');
      }
    } catch (err) {
      LoggerService.warn('Course video cloud upload failed - keeping local assets', {
        videoId: video._id,
        error: err.message,
      });
      await ActivityLogService.add(video._id, `Cloud upload failed, using local assets: ${err.message}`);
    }
  }

  /**
   * Mark the relevant stage(s) Queued for a batch of videos and return the
   * ordered list of {videoId, action} jobs the caller should push to the
   * queue. Used for both single-row and multi-row (bulk) generation from
   * the lesson table - a single video is just a 1-element videoIds array.
   *
   * For 'generate-full', all three stages are marked Queued immediately
   * (they genuinely are, right away) and one video's script/audio/render
   * jobs are kept contiguous in the returned list. Combined with the
   * course-video-processing queue running at concurrency:1, this makes
   * audio start only once that same video's script job has fully finished,
   * without needing a dedicated composite worker action.
   */
  static async prepareBulkJobs(videoIds, action) {
    const stageActions = action === 'generate-full'
      ? ['generate-script', 'generate-audio', 'render']
      : [action];

    const stageField = {
      'generate-script': 'scriptStatus',
      'generate-audio': 'audioStatus',
      render: 'videoStatus',
    };

    const jobs = [];
    for (const videoId of videoIds) {
      const update = {};
      for (const a of stageActions) {
        update[stageField[a]] = STAGE_STATUS.QUEUED;
        jobs.push({ videoId, action: a });
      }
      await CourseVideo.findByIdAndUpdate(videoId, { $set: update });
    }

    return jobs;
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