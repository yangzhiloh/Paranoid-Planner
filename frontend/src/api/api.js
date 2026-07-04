import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
});

/* Request interceptor
  * Automatically attach Authorization header when token exists.
  */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);
/* Response interceptor
 * - allows for logging 
 * - If a 401 error, token is removed and user is redirected to login.
 * - Re-throws error so caller code can handle specific UI msgs.
 */

api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error(' [API Error]', {
      status: error.response?.status,
      message: error.response?.data?.error || error.message,
      url: error.config?.url,
      method: error.config?.method,
    });

    if (error.response?.status === 401) {
      localStorage.removeItem('token');

      if (window.location.pathname !== '/login') {
          window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

/* Exported service helpers
 *
 * Each object groups related endpoints and returns the axios promise.
 * - authAPI: auth endpoints (register/login/getMe)
 * - modulesAPI: module CRUD and import eendpoints
 * - tasksAPI: task CRUD endpoints
 * 
 * - scheduleAPI: schedule endpoints
 * - productivityAPI: productivity  endpoint
 * - settingsAPI: settings endpoints
 */

export const authAPI = {
  register: (name, email, password) =>
    api.post('/auth/register', { name, email, password }),

  login: (email, password) =>
    api.post('/auth/login', { email, password }),

  getMe: () =>
    api.get('/auth/me'),
};

export const modulesAPI = {
  getModules: () =>
    api.get('/modules'),

  createModule: (data) =>
    api.post('/modules', data),

  updateModule: (id, data) =>
    api.put(`/modules/${id}`, data),

  deleteModule: (id) =>
    api.delete(`/modules/${id}`),

  importModules: (modules) =>
    api.post('/modules/import', { modules }),
};

export const tasksAPI = {
  getTasks: () =>
    api.get('/tasks'),

  createTask: ( data) =>
    api.post('/tasks', data),

  updateTask: (id , data) =>
    api.put(`/tasks/${id}`, data),

  deleteTask:  (id) =>
     api.delete(`/tasks/${id}`),
};

export const scheduleAPI = {
  generateSchedule: () =>
    api.post('/schedule/generate'),

  getSchedule: () =>
    api.get('/schedule'),
};

export const productivityAPI = {
  getSummary: () =>
    api.get('/productivity/summary'),
};

export const settingsAPI = {
  getSettings: () =>
    api.get('/settings'),

  updateSettings: (data) =>
    api.put('/settings', data),
};

export default api;
