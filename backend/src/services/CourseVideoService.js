const CourseVideo = require('../models/CourseVideo');
const CourseService = require('./CourseService');
const LoggerService = require('./LoggerService');
const SocketService = require('./SocketService');
const LMStudioService = require('./LMStudioService');
const AudioService = require('./TTS/audioService');
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

    // Emit progress
    SocketService.emitToCourse(video.courseId.toString(), SOCKET_EVENTS.COURSE_VIDEO_PROGRESS, {
      videoId: video._id,
      status: VIDEO_STATUS.GENERATING_SCRIPT,
      message: 'Generating script...',
    });

    try {
      // Build prompt for LM Studio
      const prompt = this.buildScriptPrompt(video);

      // Call LM Studio
      const scriptData = await LMStudioService.generateScript(prompt);

      // Store the generated script
      video.script = JSON.stringify(scriptData, null, 2);
      video.status = VIDEO_STATUS.SCRIPT_GENERATED;
      video.scriptGeneratedAt = new Date();
      await video.save();

      LoggerService.info('Course video script generated', {
        videoId,
        courseId: video.courseId,
        title: video.title,
        scriptLength: video.script.length,
      });

      // Emit socket event
      SocketService.emitToCourse(video.courseId.toString(), SOCKET_EVENTS.COURSE_VIDEO_SCRIPT_READY, {
        videoId: video._id,
        status: VIDEO_STATUS.SCRIPT_GENERATED,
        script: video.script,
        message: 'Script generated successfully. Please review and approve.',
      });

      return video;
    } catch (err) {
      video.status = VIDEO_STATUS.FAILED;
      video.error = {
        message: err.message,
        step: 'Script Generation',
        retryCount: (video.error?.retryCount || 0) + 1,
      };
      await video.save();

      SocketService.emitToCourse(video.courseId.toString(), SOCKET_EVENTS.JOB_FAILED, {
        videoId: video._id,
        error: err.message,
        step: 'Script Generation',
      });

      throw err;
    }
  }

  /**
   * Build the prompt for LM Studio script generation.
   */
  static buildScriptPrompt(video) {
    const durationMinutes = video.duration;

    return `You are an expert educational content creator. Create a detailed video script for the following topic.

Topic: ${video.topic}
Title: ${video.title}
Style: ${video.style}
Duration: ${durationMinutes} minutes
Additional Instructions: ${video.additionalInstructions || 'None'}

Generate a complete video script in JSON format with:
- title: The video title
- description: A brief description
- tags: Array of relevant tags
- thumbnailPrompt: A prompt for generating a thumbnail image
- scenes: Array of scene objects, each with:
  - sceneNumber: Sequential number
  - sceneType: "intro", "content", or "summary"
  - title: Scene title
  - subtitle: Scene subtitle or supporting text
  - duration: Duration in seconds (aim for 8-15 seconds per scene)
  - backgroundColor: A hex color suitable for the scene
  - transition: "fade", "slide", "zoom", "dissolve", "wipe", or "none"
  - imagePrompt: A detailed prompt for generating an image for this scene
  - cameraMotion: "static", "pan-left", "pan-right", "zoom-in", "zoom-out", or "tracking"
  - animation: Any specific animation for text elements
  - audio.text: The narration text for this scene (written in a conversational, engaging tone)
  - audio.voice: Leave empty

The total narration across all scenes should be approximately ${durationMinutes} minutes long (roughly ${durationMinutes * 130} words total).
Make the content educational, engaging, and suitable for beginners.
Include examples and clear explanations.
End with a call to action in the summary scene.

Return ONLY valid JSON, no markdown formatting.`;
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

    SocketService.emitToCourse(video.courseId.toString(), SOCKET_EVENTS.COURSE_VIDEO_PROGRESS, {
      videoId: video._id,
      status: VIDEO_STATUS.GENERATING_AUDIO,
      message: 'Generating audio...',
    });

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
      const audioScenes = scenes.map((s) => ({
        sceneNumber: s.sceneNumber || 1,
        audio: {
          text: s.audio?.text || s.title || '',
        },
        duration: s.duration || 8,
      }));

      // Generate audio for all scenes
      const jobId = `course-${video.courseId}-video-${video._id}`;
      const audioResults = await AudioService.generateAllAudio(jobId, audioScenes, video.voice);

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

      SocketService.emitToCourse(video.courseId.toString(), SOCKET_EVENTS.COURSE_VIDEO_AUDIO_READY, {
        videoId: video._id,
        status: VIDEO_STATUS.AUDIO_GENERATED,
        audioUrl: video.audioUrl,
        audioDuration: video.audioDuration,
        message: 'Audio generated successfully.',
      });

      return video;
    } catch (err) {
      video.status = VIDEO_STATUS.FAILED;
      video.error = {
        message: err.message,
        step: 'Audio Generation',
        retryCount: (video.error?.retryCount || 0) + 1,
      };
      await video.save();

      SocketService.emitToCourse(video.courseId.toString(), SOCKET_EVENTS.JOB_FAILED, {
        videoId: video._id,
        error: err.message,
        step: 'Audio Generation',
      });

      throw err;
    }
  }

  /**
   * Re-render a video (render using Remotion).
   */
  static async renderVideo(videoId) {
    const video = await CourseVideo.findById(videoId);
    if (!video) {
      throw { status: 404, message: 'Video not found' };
    }

    video.status = VIDEO_STATUS.RENDERING_VIDEO;
    video.renderProgress = 0;
    await video.save();

    SocketService.emitToCourse(video.courseId.toString(), SOCKET_EVENTS.COURSE_VIDEO_PROGRESS, {
      videoId: video._id,
      status: VIDEO_STATUS.RENDERING_VIDEO,
      progress: 0,
      message: 'Starting render...',
    });

    try {
      // For now, simulate rendering progress
      // In production, this would call the Remotion render pipeline
      const totalSteps = 10;
      for (let step = 1; step <= totalSteps; step++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const progress = Math.round((step / totalSteps) * 100);
        video.renderProgress = progress;
        await video.save();

        SocketService.emitToCourse(video.courseId.toString(), SOCKET_EVENTS.COURSE_VIDEO_PROGRESS, {
          videoId: video._id,
          status: VIDEO_STATUS.RENDERING_VIDEO,
          progress,
          message: `Rendering... ${progress}%`,
        });
      }

      // Set a placeholder render URL
      video.renderUrl = `/public/course-${video.courseId}/video-${video._id}/output.mp4`;
      video.status = VIDEO_STATUS.COMPLETED;
      video.renderedAt = new Date();
      video.renderProgress = 100;
      await video.save();

      // Update course status
      await CourseService.recalculateStatus(video.courseId);

      LoggerService.info('Course video rendered', {
        videoId,
        courseId: video.courseId,
      });

      SocketService.emitToCourse(video.courseId.toString(), SOCKET_EVENTS.COURSE_VIDEO_RENDER_READY, {
        videoId: video._id,
        status: VIDEO_STATUS.COMPLETED,
        renderUrl: video.renderUrl,
        message: 'Video completed!',
      });

      return video;
    } catch (err) {
      video.status = VIDEO_STATUS.FAILED;
      video.error = {
        message: err.message,
        step: 'Rendering',
        retryCount: (video.error?.retryCount || 0) + 1,
      };
      await video.save();

      SocketService.emitToCourse(video.courseId.toString(), SOCKET_EVENTS.JOB_FAILED, {
        videoId: video._id,
        error: err.message,
        step: 'Rendering',
      });

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