import axios from 'axios';

// Defaults to same-origin /api: Vercel rewrites it to the backend in production and Vite proxies it in development,
// which keeps the refresh cookie first-party.
const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  // Send the httpOnly refresh cookie (equivalent of fetch's credentials: 'include')
  withCredentials: true,
});

/* Access token
 * Held in memory only (never localStorage) so injected scripts cannot read it from storage.
 * It is lost on page reload and restored through refreshSession().
 */
let accessToken = null;

export const setAccessToken = (token) => {
  accessToken = token;
};

/* Refresh
 * Concurrent callers share one in-flight request. Refresh tokens rotate on every use and a reused
 * token revokes the whole session, so two parallel refreshes would log the user out.
 */
let refreshPromise = null;

export const refreshSession = () => {
  if (!refreshPromise) {
    refreshPromise = api
      .post('/auth/refresh')
      .then((res) => {
        setAccessToken(res.data.token);
        return res.data;
      })
      .catch((err) => {
        setAccessToken(null);
        throw err;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
};

// Auth endpoints that must not trigger a refresh-and-retry on 401
const NO_RETRY_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

/* Request interceptor
  * Automatically attach Authorization header when token exists.
  */
api.interceptors.request.use(
  (config) => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);
/* Response interceptor
 * - allows for logging
 * - On a 401, tries one refresh and retries the request.
 * - If the refresh fails, the token is cleared and user is redirected to login.
 * - Re-throws error so caller code can handle specific UI msgs.
 */

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response?.status === 401
      && originalRequest
      && !originalRequest._retried
      && !NO_RETRY_PATHS.includes(originalRequest.url)
    ) {
      originalRequest._retried = true;

      try {
        await refreshSession();
        return api(originalRequest);
      } catch {
        if (!['/login', '/register'].includes(window.location.pathname)) {
          window.location.href = '/login';
        }
      }
    }

    console.error(' [API Error]', {
      status: error.response?.status,
      message: error.response?.data?.error || error.message,
      url: error.config?.url,
      method: error.config?.method,
    });

    return Promise.reject(error);
  }
);

/* Exported service helpers
 *
 * Each object groups related endpoints and returns the axios promise.
 * - authAPI: auth endpoints (register/login/refresh/logout/getMe)
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

  refresh: () =>
    refreshSession(),

  logout: () =>
    api.post('/auth/logout'),

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

  generateAISchedule: () =>
    api.post('/schedule/generate-ai'),

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
