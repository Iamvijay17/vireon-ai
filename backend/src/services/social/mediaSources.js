const VideoJob = require('../../models/VideoJob');
const CourseVideo = require('../../models/CourseVideo');
const Course = require('../../models/Course');
const { JOB_STATUS, STAGE_STATUS } = require('../../constants');
const { NotFoundError, ValidationError } = require('../../utils/errors');

const VIDEO_CONTENT_TYPES = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };
const IMAGE_CONTENT_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
const extOf = (key) => String(key).split('?')[0].split('.').pop().toLowerCase();

const hasCourseRender = (v) => Boolean(v.renderUrl) && (v.videoStatus === STAGE_STATUS.COMPLETED || v.status === 'Completed');
const hasStandaloneRender = (j) => Boolean(j.videoUrl) && j.status === JOB_STATUS.COMPLETED;

function dimsFromResolution(resolution) {
  const [width, height] = String(resolution || '').split('x').map(Number);
  return width > 0 && height > 0 ? { width, height } : { width: null, height: null };
}

/** Sum of narration lengths - the best duration the generation record has (the rendered file is not probed). */
function recordDuration(job) {
  const scenes = Array.isArray(job.script?.scenes) ? job.script.scenes : [];
  const total = scenes.reduce((sum, s) => sum + (Number(s.audio?.duration) || 0), 0);
  return total > 0 ? Math.round(total * 10) / 10 : null;
}

/** First ~N characters of narration, used as context for caption generation. */
function narrationExcerpt(script, max = 1200) {
  const scenes = Array.isArray(script?.scenes) ? script.scenes : [];
  return scenes.map((s) => s.audio?.text || s.narration || '').filter(Boolean).join(' ').slice(0, max);
}

/**
 * Normalise "a Vireon video" - a standalone video or a course lesson - to what the Promotion
 * Studio needs: a snapshot of the stored file (so the worker can detect a re-render), the
 * facts validation uses, and the text the captions are written from.
 */
class MediaSources {
  constructor({ storage }) {
    this.storage = storage;
  }

  async #describeStored(url, { kind, durationSec, width, height, fileName }) {
    const { bucket, key } = this.storage.parsePublicUrl(url);
    const stat = await this.storage.statObject(bucket, key);
    if (!stat || !(stat.size > 0)) throw new ValidationError('The media file is missing from storage - render it again');
    const ext = extOf(key);
    return {
      kind, bucket, key, size: stat.size, etag: stat.etag || '',
      contentType: (kind === 'video' ? VIDEO_CONTENT_TYPES : IMAGE_CONTENT_TYPES)[ext] || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
      fileName: fileName || `${key.split('/').pop()}`,
      durationSec: durationSec ?? null, width: width ?? null, height: height ?? null,
      measured: width || durationSec ? 'record' : 'none',
    };
  }

  async #thumbnail(url) {
    if (!url) return null;
    try {
      return await this.#describeStored(url, { kind: 'image' });
    } catch {
      return null; // a missing thumbnail must never block a promotion
    }
  }

  /** @returns {{media, thumbnail, title, description, script, language, source}} */
  async resolve({ videoJobId, courseVideoId }) {
    if (videoJobId) {
      const job = await VideoJob.findById(videoJobId).lean();
      if (!job) throw new NotFoundError('Video not found');
      if (!hasStandaloneRender(job)) throw new ValidationError('This video has not finished rendering yet');
      const title = job.script?.title || job.topic;
      const media = await this.#describeStored(job.videoUrl, {
        kind: 'video', durationSec: recordDuration(job), ...dimsFromResolution(job.resolution), fileName: `${title}.mp4`,
      });
      return {
        media, thumbnail: await this.#thumbnail(job.thumbnailUrl), title,
        description: job.script?.description || job.topic || '', excerpt: narrationExcerpt(job.script), language: job.language || 'english',
        source: { videoJobId: String(job._id), courseVideoId: null, title, description: job.script?.description || job.topic || '' },
      };
    }
    if (courseVideoId) {
      const video = await CourseVideo.findById(courseVideoId).lean();
      if (!video) throw new NotFoundError('Lesson not found');
      if (!hasCourseRender(video)) throw new ValidationError('This lesson has not been rendered yet');
      const course = await Course.findById(video.courseId).lean();
      const media = await this.#describeStored(video.renderUrl, {
        kind: 'video', durationSec: video.audioDuration > 0 ? video.audioDuration : null, fileName: `${video.title}.mp4`,
      });
      const description = video.script?.description || video.topic || '';
      return {
        media, thumbnail: null, title: video.title, description, excerpt: narrationExcerpt(video.script), language: course?.language || 'english',
        source: { videoJobId: null, courseVideoId: String(video._id), title: video.title, description },
      };
    }
    throw new ValidationError('Choose a video to promote');
  }

  /** Finished Vireon videos, newest first - what the media selector shows. */
  async library({ limit = 60 } = {}) {
    const take = Math.min(limit, 100);
    const [jobs, lessons] = await Promise.all([
      VideoJob.find({ status: JOB_STATUS.COMPLETED, videoUrl: { $ne: '' } }).sort({ updatedAt: -1 }).limit(take).lean(),
      CourseVideo.find({ videoStatus: STAGE_STATUS.COMPLETED, renderUrl: { $ne: '' } }).sort({ updatedAt: -1 }).limit(take).lean(),
    ]);
    const courses = await Course.find({ _id: { $in: [...new Set(lessons.map((l) => l.courseId))] } }).lean();
    const courseTitle = new Map(courses.map((c) => [String(c._id), c.title]));

    return {
      videos: jobs.map((j) => ({
        kind: 'video', videoJobId: String(j._id), title: j.script?.title || j.topic, topic: j.topic, type: j.type, language: j.language,
        resolution: j.resolution, aspectRatio: j.aspectRatio, durationSec: recordDuration(j), thumbnailUrl: j.thumbnailUrl || '', createdAt: j.createdAt,
      })),
      lessons: lessons.map((l) => ({
        kind: 'lesson', courseVideoId: String(l._id), title: l.title, courseTitle: courseTitle.get(String(l.courseId)) || '', durationSec: l.audioDuration > 0 ? l.audioDuration : null,
        thumbnailUrl: '', createdAt: l.createdAt,
      })),
    };
  }
}

module.exports = MediaSources;
module.exports.VIDEO_CONTENT_TYPES = VIDEO_CONTENT_TYPES;
module.exports.IMAGE_CONTENT_TYPES = IMAGE_CONTENT_TYPES;
module.exports.hasStandaloneRender = hasStandaloneRender;
module.exports.hasCourseRender = hasCourseRender;
