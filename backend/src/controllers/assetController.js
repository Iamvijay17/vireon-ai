const AssetService = require('../services/asset/AssetService');

class AssetController {
  /**
   * GET /api/assets - Unified asset list across video/course-video/audio-studio,
   * with owner/category filters, filename search, and orphan detection.
   */
  static async list(req, res, next) {
    try {
      const { ownerType, category, search, orphanedOnly, page, limit } = req.query;
      const result = await AssetService.list({
        ownerType,
        category,
        search,
        orphanedOnly: orphanedOnly === 'true',
        page,
        limit,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/assets/:id - Delete a single asset (the MinIO object + its
   * registry entry). Does not touch the owning VideoJob/CourseVideo/
   * AudioGeneration doc - use each domain's own delete endpoint for that.
   */
  static async remove(req, res, next) {
    try {
      const result = await AssetService.deleteById(req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = AssetController;
