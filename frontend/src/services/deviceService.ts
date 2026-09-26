import apiClient from './apiClient';

export type DevicePlatform = 'ios' | 'android';

export const registerDevice = async (token: string, platform: DevicePlatform): Promise<void> => {
  await apiClient.post('/api/devices', { token, platform });
};

export const unregisterDevice = async (token: string, authToken?: string): Promise<void> => {
  await apiClient.post(
    '/api/devices/unregister',
    { token },
    authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : undefined
  );
};
