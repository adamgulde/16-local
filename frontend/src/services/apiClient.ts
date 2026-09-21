import axios from 'axios';

// Vite convention (import.meta.env) with fallback to relative path (empty base)
const rawBaseURL = import.meta.env.VITE_API_BASE_URL;
const baseURL = rawBaseURL ? rawBaseURL.replace(/\/+$/, '') : '';

export const apiClient = axios.create({
  baseURL: baseURL || undefined,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error)) {
      const isAuthEndpoint = error.config?.url?.includes('/api/auth/');
      const status = error.response?.status;
      if ((status === 401 || status === 403) && !isAuthEndpoint) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('authUser');
        window.location.reload();
      }
    }
    return Promise.reject(error);
  }
);

const SUSPICIOUS_ERROR_PATTERNS = [
  /exception/i,
  /\bat\s+[a-zA-Z0-9_$.]+\(/i,
  /\b(trace|stacktrace)\b/i,
  /\b(sql|database|hikari|postgresql|hibernate)\b/i,
  /\b(java\.|org\.springframework|com\.example)\b/i,
  /\bnullpointer/i,
  /\bconstraintviolation/i,
];

export const isSafeErrorMessage = (msg: unknown): msg is string => {
  if (typeof msg !== 'string') return false;
  const trimmed = msg.trim();
  if (!trimmed || trimmed.length > 200) return false;
  return !SUSPICIOUS_ERROR_PATTERNS.some((pattern) => pattern.test(trimmed));
};

export const extractErrorMessage = (err: unknown): string | undefined => {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: unknown; message?: unknown } | undefined;
    const candidate = data?.error || data?.message;
    if (isSafeErrorMessage(candidate)) {
      return candidate;
    }
  }
  return undefined;
};

export const getSafeErrorMessage = (err: unknown, fallback = 'An unexpected error occurred. Please try again.'): string => {
  if (axios.isAxiosError(err)) {
    // Network connectivity or timeout issues (no HTTP response received)
    if (!err.response) {
      return 'Unable to connect to the server. Please check your network connection.';
    }

    // 5xx Server Errors: strictly mask backend internal details
    if (err.response.status >= 500) {
      return 'A server error occurred. Please try again later.';
    }

    // 401 / 403: auth failures
    if (err.response.status === 401 || err.response.status === 403) {
      const extracted = extractErrorMessage(err);
      return extracted || 'Access denied or session expired.';
    }

    // 4xx Client Errors: return clean business messages if safe, otherwise fallback
    const extracted = extractErrorMessage(err);
    if (extracted) {
      return extracted;
    }
  }

  return fallback;
};

export default apiClient;
