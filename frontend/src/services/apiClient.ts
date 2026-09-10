import axios from 'axios';

const apiClient = axios.create();

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
