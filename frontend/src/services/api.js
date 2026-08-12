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

// Backend-generated media (course audio/render output) comes back as paths
// relative to the API origin (e.g. "/public/<id>/audio/scene1.mp3"), not the
// frontend's own origin, so they need the API base prefixed to load.
export const resolveMediaUrl = (path) => {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
};

// ─── Video Jobs ───────────────────────────────────────────────────────────────

export const createVideoJob = (data) => api.post('/api/videos', data);

export const getVideoJobs = (page = 1, limit = 20, filters = {}) =>
  api.get('/api/videos', { params: { page, limit, ...filters } });

export const getVideoJob = (id) => api.get(`/api/videos/${id}`);

export const updateVideoJob = (id, data) => api.put(`/api/videos/${id}`, data);

export const deleteVideoJob = (id) => api.delete(`/api/videos/${id}`);

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

// ─── Courses ────────────────────────────────────────────────────────────────────

export const createCourse = (data) => api.post('/api/courses', data);

export const getCourses = (page = 1, limit = 20, filters = {}) =>
  api.get('/api/courses', { params: { page, limit, ...filters } });

export const getCourse = (id) => api.get(`/api/courses/${id}`);

export const updateCourse = (id, data) => api.put(`/api/courses/${id}`, data);

export const deleteCourse = (id) => api.delete(`/api/courses/${id}`);

export const stopCourse = (id) => api.post(`/api/courses/${id}/stop`);

// ─── Course Videos ──────────────────────────────────────────────────────────────

export const getCourseVideos = (courseId, page = 1, limit = 50) =>
  api.get(`/api/courses/${courseId}/videos`, { params: { page, limit } });

export const createCourseVideo = (courseId, data) =>
  api.post(`/api/courses/${courseId}/videos`, data);

export const getCourseVideo = (id) => api.get(`/api/course-videos/${id}`);

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

export const bulkGenerateCourseVideos = (videoIds, action) =>
  api.post(`/api/course-videos/bulk-generate`, { videoIds, action });

export const bulkApproveCourseVideoScripts = (videoIds) =>
  api.post(`/api/course-videos/bulk-approve-script`, { videoIds });

export const bulkDeleteCourseVideos = (videoIds) =>
  api.post(`/api/course-videos/bulk-delete`, { videoIds });

// ─── Analytics ──────────────────────────────────────────────────────────────────

export const getAnalyticsOverview = (days = 30) =>
  api.get('/api/analytics/overview', { params: { days } });

// ─── Live Logs ──────────────────────────────────────────────────────────────────

export const getRecentLogs = (limit = 300) => api.get('/api/logs/recent', { params: { limit } });

// ─── Health ────────────────────────────────────────────────────────────────────

export const getHealth = () => api.get('/health');

export default api;
