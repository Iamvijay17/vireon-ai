import axios from 'axios';

// Derive the API base URL from the current browser hostname so the app works
// both locally (localhost) and when accessed from another device on the LAN
// (e.g. http://192.168.1.7:5173 → API at http://192.168.1.7:3000).
// VITE_API_URL can still override this explicitly if needed.
const getApiBase = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  const { hostname, protocol } = window.location;
  return `${protocol}//${hostname}:3000`;
};

const API_BASE = getApiBase();

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Every call site used to repeat its own
// `err.response?.data?.error || err.response?.data?.message || fallback`
// chain, with inconsistent ordering/coverage across pages (some didn't
// check `details`, the shape our zod validators use for field-level
// errors). This normalizes all of that once, onto `err.friendlyMessage`,
// so callers just do `err.friendlyMessage || "fallback for this action"`.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const data = error.response?.data;
    // `details[0].message` (per-field validation detail, e.g. "Invalid id")
    // is more specific than `error` (the generic "Validation failed"
    // umbrella message that always accompanies it), so it takes priority.
    error.friendlyMessage =
      data?.message || data?.details?.[0]?.message || data?.error || error.message || 'Something went wrong';
    return Promise.reject(error);
  }
);

// MinIO serves scene audio directly (anonymous-read bucket) rather than
// through the backend, so it needs its own origin, not API_BASE. Mirrors
// getApiBase()'s "derive from the current hostname, allow an env override"
// pattern so LAN access still works. Bucket name matches the backend's
// MINIO_SCENES_BUCKET default (see backend/src/config/index.js).
const getMinioBase = () => {
  if (import.meta.env.VITE_MINIO_PUBLIC_URL) return import.meta.env.VITE_MINIO_PUBLIC_URL;
  const { hostname, protocol } = window.location;
  return `${protocol}//${hostname}:9000`;
};
const MINIO_BASE = getMinioBase();
const MINIO_SCENES_BUCKET = import.meta.env.VITE_MINIO_SCENES_BUCKET || 'vireon-scenes';

// Port the backend's MinIO instance serves object URLs on (backend/.env
// MINIO_PUBLIC_URL, default 9000). Used to recognize MinIO object links so
// their host can be re-homed for LAN access.
const MINIO_PORT = (() => {
  try {
    return new URL(MINIO_BASE).port || '9000';
  } catch {
    return '9000';
  }
})();

// The backend builds every asset URL it stores/returns (videoUrl,
// thumbnailUrl, avatarVideoUrl, audioUrl, renderUrl, scene.audio.file) from
// MINIO_PUBLIC_URL in backend/.env - by default http://127.0.0.1:9000. That
// origin only works on the backend machine itself: a browser on any other LAN
// device resolves 127.0.0.1 to its own loopback, so every <video>/<audio>/<img>
// fails to load while the API and socket (both derived from window.location)
// keep working. Re-home such URLs to the host the page was served from so they
// follow the device that loaded the page, mirroring the getApiBase/getMinioBase
// trick.
const resolveAssetUrl = (url) => {
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return url;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const isLoopback =
      hostname === 'localhost' || hostname === '::1' || /^127(\.\d{1,3}){3}$/.test(hostname);
    // Loopback links (and any stale URL still pointed at the MinIO port, e.g.
    // an old LAN IP baked in before this machine's address changed) are MinIO
    // object links - swap in the host this page was served from. A port must
    // be explicitly present: stored MinIO URLs always carry one (publicUrl is
    // built as http(s)://host:port), and URLs without one must pass through.
    const isMinioPort = parsed.port !== '' && String(parsed.port) === String(MINIO_PORT || '9000');
    if ((isLoopback || hostname !== window.location.hostname) && isMinioPort) {
      parsed.hostname = window.location.hostname;
      return parsed.toString();
    }
    return url;
  } catch {
    return url;
  }
};

// Backend-generated media (course audio/render output) comes back either as
// absolute MinIO URLs (audioUrl/renderUrl - host may be a loopback address) or
// as paths relative to the API origin (e.g. "/public/<id>/audio/scene1.mp3").
// Relative paths get the API base prefixed; absolute ones get LAN re-homed.
export const resolveMediaUrl = (path) => {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return resolveAssetUrl(path);
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
};

// Resolves a scene's audio field (`scene.audio.file`) to a browser-fetchable
// URL. The backend stores it as a bare filename (e.g. "scene1.mp3") and
// uploads the actual bytes to MinIO the moment it's generated. Already-
// absolute values (a leftover from an older job, or a future provider change)
// get the same LAN re-homing as other media URLs instead of passing through.
export const resolveSceneAudioUrl = (videoId, audioFile) => {
  if (!audioFile) return null;
  if (/^https?:\/\//i.test(audioFile)) return resolveAssetUrl(audioFile);
  return `${MINIO_BASE}/${MINIO_SCENES_BUCKET}/${videoId}/audio/${audioFile}`;
};

// ─── Video Jobs ───────────────────────────────────────────────────────────────

export const createVideoJob = (data) => api.post('/api/videos', data);

export const getVideoJobs = (page = 1, limit = 20, filters = {}) =>
  api.get('/api/videos', { params: { page, limit, ...filters } });

export const getVideoJob = (id) => api.get(`/api/videos/${id}`);

export const updateVideoJob = (id, data) => api.put(`/api/videos/${id}`, data);

export const deleteVideoJob = (id) => api.delete(`/api/videos/${id}`);

export const bulkDeleteVideoJobs = (jobIds) => api.post('/api/videos/bulk-delete', { jobIds });

export const restartVideoJob = (id) => api.post(`/api/videos/${id}/restart`);

export const regenerateVideoJobScript = (id) => api.post(`/api/videos/${id}/regenerate-script`);

export const approveVideoJob = (id) => api.post(`/api/videos/${id}/approve`);

// Manual mode only (fastGeneration: false) - each is a separate explicit
// trigger, mirroring the course-video pipeline.
export const generateVideoAudio = (id) => api.post(`/api/videos/${id}/generate-audio`);

export const generateVideoRender = (id) => api.post(`/api/videos/${id}/generate-render`);

export const rerenderVideoJob = (id) => api.post(`/api/videos/${id}/rerender`);

export const stopVideoJob = (id) => api.post(`/api/videos/${id}/stop`);

export const updateVideoScenes = (id, scenes) => api.put(`/api/videos/${id}/scenes`, { scenes });

export const regenerateVideoSceneAudio = (id, sceneNumber) =>
  api.post(`/api/videos/${id}/scenes/${sceneNumber}/regenerate-audio`);

export const remapSceneElementsForTemplate = (id, sceneNumber, templateId, currentScene) =>
  api.post(`/api/videos/${id}/scenes/${sceneNumber}/remap-template`, {
    templateId,
    fromTemplateId: currentScene?.templateId,
    title: currentScene?.title,
    subtitle: currentScene?.subtitle,
    audioText: currentScene?.audio?.text,
    speaker: currentScene?.speaker,
    elements: currentScene?.elements,
  });

export const getVideoJobActivityLogs = (id) => api.get(`/api/videos/${id}/activity-logs`);

// ─── Voices ─────────────────────────────────────────────────────────────────────

export const getVoices = () => api.get('/api/voices');

export const getFavoriteVoices = () => api.get('/api/voices/favorites');

export const addFavoriteVoice = (voiceId) => api.post('/api/voices/favorites', { voiceId });

export const removeFavoriteVoice = (voiceId) =>
  api.delete('/api/voices/favorites', { data: { voiceId } });

// ─── Audio Studio ───────────────────────────────────────────────────────────────

// TTS synthesis itself takes tens of seconds (see AudioService), well past
// the default 30s timeout - same override pattern as generateCourseCurriculum.
export const generateAudio = (data) => api.post('/api/audio/generate', data, { timeout: 120000 });

// Multi-speaker ("podcast") script - one TTS call per turn, so this needs a
// longer timeout still, scaled by how many turns a long script can produce.
export const generateDialogueAudio = (data) => api.post('/api/audio/generate-dialogue', data, { timeout: 300000 });

export const getAudioGenerations = (page = 1, limit = 20) =>
  api.get('/api/audio', { params: { page, limit } });

export const deleteAudioGeneration = (id) => api.delete(`/api/audio/${id}`);

// ─── Courses ────────────────────────────────────────────────────────────────────

export const createCourse = (data) => api.post('/api/courses', data);

export const getCourses = (page = 1, limit = 20, filters = {}) =>
  api.get('/api/courses', { params: { page, limit, ...filters } });

export const getCourse = (id) => api.get(`/api/courses/${id}`);

export const updateCourse = (id, data) => api.put(`/api/courses/${id}`, data);

export const deleteCourse = (id) => api.delete(`/api/courses/${id}`);

export const stopCourse = (id) => api.post(`/api/courses/${id}/stop`);

// Plain URLs (not axios calls) - handed to an <a download> so the browser
// streams straight from the backend instead of buffering the whole file in
// JS first. The backend sets Content-Disposition to the video/course title.
export const getCourseDownloadAllUrl = (courseId) => resolveMediaUrl(`/api/courses/${courseId}/download-all`);

// ─── Course Videos ──────────────────────────────────────────────────────────────

export const getCourseVideos = (courseId, page = 1, limit = 50) =>
  api.get(`/api/courses/${courseId}/videos`, { params: { page, limit } });

export const createCourseVideo = (courseId, data) =>
  api.post(`/api/courses/${courseId}/videos`, data);

export const getCourseVideo = (id) => api.get(`/api/course-videos/${id}`);

export const getCourseVideoDownloadUrl = (id) => resolveMediaUrl(`/api/course-videos/${id}/download`);

export const updateCourseVideo = (id, data) => api.put(`/api/course-videos/${id}`, data);

export const deleteCourseVideo = (id) => api.delete(`/api/course-videos/${id}`);

export const generateCourseVideoScript = (id) =>
  api.post(`/api/course-videos/${id}/generate-script`);

export const approveCourseVideoScript = (id) =>
  api.post(`/api/course-videos/${id}/approve-script`);

export const updateCourseVideoScript = (id, script) =>
  api.put(`/api/course-videos/${id}/script`, { script });

export const regenerateCourseVideoScript = (id) =>
  api.post(`/api/course-videos/${id}/regenerate-script`);

export const generateCourseVideoAudio = (id) =>
  api.post(`/api/course-videos/${id}/generate-audio`);

export const renderCourseVideo = (id) =>
  api.post(`/api/course-videos/${id}/render`);

export const retryCourseVideo = (id) =>
  api.post(`/api/course-videos/${id}/retry`);

export const stopCourseVideo = (id) =>
  api.post(`/api/course-videos/${id}/stop`);

export const regenerateCourseVideoSceneAudio = (id, sceneNumber) =>
  api.post(`/api/course-videos/${id}/scenes/${sceneNumber}/regenerate-audio`);

export const getCourseVideoActivityLogs = (id) =>
  api.get(`/api/course-videos/${id}/activity-logs`);

export const getCourseWorkerStatus = () => api.get(`/api/course-videos/worker-status`);

// Curriculum generation is one LLM call producing 12-20 lessons - can take
// well over the default 30s timeout, so this request gets a longer one.
// Preview only - no CourseVideo records are created by this call.
export const generateCourseCurriculum = (courseId, data) =>
  api.post(`/api/courses/${courseId}/generate-curriculum`, data, { timeout: 120000 });

// Creates one CourseVideo per lesson from an approved (possibly edited)
// lesson list - the output of generateCourseCurriculum above.
export const createCourseVideosFromCurriculum = (courseId, data) =>
  api.post(`/api/courses/${courseId}/curriculum-videos`, data);

// Autosaved in-progress curriculum draft (form + generated lessons), so
// navigating away and back restores it instead of forcing a regeneration.
export const saveCourseCurriculumDraft = (courseId, draft) =>
  api.put(`/api/courses/${courseId}/curriculum-draft`, draft);

export const clearCourseCurriculumDraft = (courseId) =>
  api.delete(`/api/courses/${courseId}/curriculum-draft`);

// Durable history of past AI-generated curriculum structures for a course
// (separate from the single in-progress curriculumDraft above) - each
// generate-curriculum call is saved here permanently.
export const getCourseCurriculumHistory = (courseId, params) =>
  api.get(`/api/courses/${courseId}/curriculum-history`, { params });

export const bulkGenerateCourseVideos = (videoIds, action) =>
  api.post(`/api/course-videos/bulk-generate`, { videoIds, action });

export const bulkApproveCourseVideoScripts = (videoIds) =>
  api.post(`/api/course-videos/bulk-approve-script`, { videoIds });

export const bulkDeleteCourseVideos = (videoIds) =>
  api.post(`/api/course-videos/bulk-delete`, { videoIds });

// ─── Job Management (unified video/course/audio job view) ────────────────────────

export const getJobs = (page = 1, limit = 20, filters = {}) =>
  api.get('/api/jobs', { params: { page, limit, ...filters } });

export const getJob = (type, id) => api.get(`/api/jobs/${type}/${id}`);

export const cancelJob = (type, id) => api.post(`/api/jobs/${type}/${id}/cancel`);

export const retryJob = (type, id) => api.post(`/api/jobs/${type}/${id}/retry`);

export const bulkJobAction = (jobs, action) => api.post('/api/jobs/bulk', { jobs, action });

// ─── Assets (unified registry across video/course-video/audio-studio uploads) ────

export const getAssets = (page = 1, limit = 20, filters = {}) =>
  api.get('/api/assets', { params: { page, limit, ...filters } });

export const deleteAsset = (id) => api.delete(`/api/assets/${id}`);

// ─── Analytics ──────────────────────────────────────────────────────────────────

export const getAnalyticsOverview = (days = 30) =>
  api.get('/api/analytics/overview', { params: { days } });

// ─── Live Logs ──────────────────────────────────────────────────────────────────

export const getRecentLogs = (limit = 300) => api.get('/api/logs/recent', { params: { limit } });

// ─── Templates ────────────────────────────────────────────────────────────────────

export const getTemplates = () => api.get('/api/templates');

// ─── Studio live preview ──────────────────────────────────────────────────────────
//
// Replaces the old @remotion/player-based ScenePreview/SceneThumbnail:
// buildStudioPreview (re)builds a scratch HyperFrames composition from the
// editor's current (possibly unsaved) scenes and ensures a preview server is
// running for it; getStudioThumbnailUrl then just points a plain <img>/<video
// poster> at that server's per-frame PNG endpoint (auth is a no-op in this
// single-user backend - see backend/src/middleware/auth.js - so no header
// wiring is needed for a bare <img src>).

export const buildStudioPreview = (jobId, { scenes, resolution, fontPairing }) =>
  api.post(`/api/studio/preview/${jobId}`, { scenes, resolution, fontPairing });

export const getStudioThumbnailUrl = (jobId, t) =>
  `${API_BASE}/api/studio/preview/${jobId}/thumbnail?t=${encodeURIComponent(t)}`;

// ─── Health ────────────────────────────────────────────────────────────────────

export const getHealth = () => api.get('/health');

export default api;
