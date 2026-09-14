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
    if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('authUser');
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

export const extractErrorMessage = (err: unknown): string | undefined => {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as { error?: string } | undefined)?.error;
  }
  return undefined;
};

export default apiClient;
