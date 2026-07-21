const ActivityLog = require('../models/ActivityLog');

class ActivityLogService {
  /**
   * Add an activity log entry for a video.
   */
  static async add(videoId, text, timestamp) {
    const log = await ActivityLog.create({
      videoId,
      text,
      timestamp: timestamp || new Date(),
    });
    return log;
  }

  /**
   * Get activity logs for a video, newest first.
   */
  static async getByVideo(videoId, limit = 50) {
    const logs = await ActivityLog.find({ videoId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    return logs;
  }

  /**
   * Delete all activity logs for a video.
   */
  static async deleteByVideo(videoId) {
    await ActivityLog.deleteMany({ videoId });
  }
}

module.exports = ActivityLogService;