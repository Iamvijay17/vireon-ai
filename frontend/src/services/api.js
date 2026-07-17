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

// ─── Health ────────────────────────────────────────────────────────────────────

export const getHealth = () => api.get('/health');

export default api;
