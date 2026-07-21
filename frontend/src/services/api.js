import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Video Jobs ───────────────────────────────────────────────────────────────

export const createVideoJob = (data) => api.post('/api/videos', data);

export const getVideoJobs = (page = 1, limit = 20) =>
  api.get('/api/videos', { params: { page, limit } });

export const getVideoJob = (id) => api.get(`/api/videos/${id}`);

export const deleteVideoJob = (id) => api.delete(`/api/videos/${id}`);

export const restartVideoJob = (id) => api.post(`/api/videos/${id}/restart`);

export const rerenderVideoJob = (id) => api.post(`/api/videos/${id}/rerender`);

export const updateVideoScenes = (id, scenes) => api.put(`/api/videos/${id}/scenes`, { scenes });

// ─── Courses ────────────────────────────────────────────────────────────────────

export const createCourse = (data) => api.post('/api/courses', data);

export const getCourses = (page = 1, limit = 20, filters = {}) =>
  api.get('/api/courses', { params: { page, limit, ...filters } });

export const getCourse = (id) => api.get(`/api/courses/${id}`);

export const updateCourse = (id, data) => api.put(`/api/courses/${id}`, data);

export const deleteCourse = (id) => api.delete(`/api/courses/${id}`);

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

export const getCourseVideoActivityLogs = (id) =>
  api.get(`/api/course-videos/${id}/activity-logs`);

// ─── Health ────────────────────────────────────────────────────────────────────

export const getHealth = () => api.get('/health');

export default api;
