const path = require('path');
const Asset = require('../../models/Asset');
const VideoJob = require('../../models/VideoJob');
const CourseVideo = require('../../models/CourseVideo');
const AudioGeneration = require('../../models/AudioGeneration');
const LoggerService = require('../common/LoggerService');

const MIME_TYPES = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

const OWNER_MODELS = {
  video: VideoJob,
  'course-video': CourseVideo,
  'audio-studio': AudioGeneration,
};

function mimeTypeFor(fileName) {
  return MIME_TYPES[path.extname(fileName).toLowerCase()] || null;
}

/**
 * Resolve which collection an id belongs to. `audio-studio` category is
 * unambiguous (always an AudioGeneration); `audio`/`avatar`/`render` are
 * shared between video jobs and course videos, so those need a lookup -
 * cheap, since both are indexed _id lookups.
 */
async function resolveOwnerType(id, category) {
  if (category === 'audio-studio') return 'audio-studio';
  if (await VideoJob.exists({ _id: id })) return 'video';
  if (await CourseVideo.exists({ _id: id })) return 'course-video';
  return 'unknown';
}

class AssetService {
  /**
   * Record a newly-uploaded asset. Called from MinioStorageProvider right
   * after a successful upload - never allowed to fail the upload itself.
   *
   * `size` is passed in by the caller (stat'd before the upload started)
   * rather than re-stat'd here: this function isn't awaited by
   * MinioStorageProvider.uploadFile in every caller's chain, and the local
   * scratch file it would stat is often deleted by job cleanup moments
   * later - stat'ing here lost that race 100% of the time in practice,
   * silently leaving every asset's size null.
   */
  static async recordUpload({ id, category, bucket, key, url, filePath, size = null }) {
    try {
      const fileName = path.basename(filePath);
      const ownerType = await resolveOwnerType(id, category);

      await Asset.findOneAndUpdate(
        { ownerId: id, key },
        {
          ownerType,
          ownerId: id,
          category,
          bucket,
          key,
          url,
          fileName,
          size,
          mimeType: mimeTypeFor(fileName),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (err) {
      LoggerService.warn('Failed to record asset', { id, category, key, error: err.message });
    }
  }

  static async list({ ownerType, category, search, orphanedOnly, page = 1, limit = 20 }) {
    const query = {};
    if (ownerType) query.ownerType = ownerType;
    if (category) query.category = category;
    if (search) query.fileName = { $regex: search, $options: 'i' };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));

    let assets = await Asset.find(query).sort({ createdAt: -1 }).lean();

    if (orphanedOnly) {
      assets = await filterOrphaned(assets);
    } else {
      const flags = await orphanFlags(assets);
      assets = assets.map((a) => ({ ...a, orphaned: flags.get(a._id.toString()) ?? false }));
    }

    const total = assets.length;
    const start = (pageNum - 1) * limitNum;
    const data = assets.slice(start, start + limitNum);

    return {
      data,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    };
  }

  static async deleteById(assetId) {
    const asset = await Asset.findById(assetId);
    if (!asset) {
      throw { status: 404, message: 'Asset not found' };
    }

    const { getStorageProvider } = require('../storage/providers');
    await getStorageProvider().deleteObject(asset.bucket, asset.key).catch(() => {});
    await Asset.findByIdAndDelete(assetId);

    LoggerService.info('Asset deleted', { assetId, key: asset.key });
    return { message: 'Asset deleted successfully' };
  }
}

async function orphanFlags(assets) {
  const flags = new Map();
  const idsByOwnerType = new Map();
  for (const asset of assets) {
    if (!idsByOwnerType.has(asset.ownerType)) idsByOwnerType.set(asset.ownerType, new Set());
    idsByOwnerType.get(asset.ownerType).add(asset.ownerId);
  }

  const existingByOwnerType = new Map();
  for (const [ownerType, ids] of idsByOwnerType) {
    const Model = OWNER_MODELS[ownerType];
    if (!Model) {
      existingByOwnerType.set(ownerType, new Set());
      continue;
    }
    const docs = await Model.find({ _id: { $in: [...ids] } }).select('_id').lean();
    existingByOwnerType.set(ownerType, new Set(docs.map((d) => d._id.toString())));
  }

  for (const asset of assets) {
    const existing = existingByOwnerType.get(asset.ownerType) || new Set();
    flags.set(asset._id.toString(), !existing.has(asset.ownerId));
  }
  return flags;
}

async function filterOrphaned(assets) {
  const flags = await orphanFlags(assets);
  return assets
    .filter((a) => flags.get(a._id.toString()))
    .map((a) => ({ ...a, orphaned: true }));
}

module.exports = AssetService;
