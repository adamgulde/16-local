import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => true),
  },
}));

vi.mock('./apiClient', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: undefined }),
  },
}));

import apiClient from './apiClient';
import { clearSession } from './authService';

describe('clearSession (native push unregister)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('sends the unregister request with the Bearer header captured before clearing storage', async () => {
    localStorage.setItem('authToken', 'abc123');
    localStorage.setItem('authUser', JSON.stringify({ id: 'u1' }));
    localStorage.setItem('pushToken', 'push-token-xyz');

    clearSession();

    // Flush the fire-and-forget unregisterDevice() promise chain.
    await Promise.resolve();
    await Promise.resolve();

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/devices/unregister',
      { token: 'push-token-xyz' },
      { headers: { Authorization: 'Bearer abc123' } }
    );

    expect(localStorage.getItem('authToken')).toBeNull();
    expect(localStorage.getItem('authUser')).toBeNull();
    expect(localStorage.getItem('pushToken')).toBeNull();
  });

  it('skips the unregister call when there is no push token', async () => {
    localStorage.setItem('authToken', 'abc123');

    clearSession();
    await Promise.resolve();

    expect(apiClient.post).not.toHaveBeenCalled();
    expect(localStorage.getItem('authToken')).toBeNull();
  });

  it('skips the unregister call when there is no auth token, but still clears pushToken', async () => {
    localStorage.setItem('pushToken', 'push-token-xyz');

    clearSession();
    await Promise.resolve();

    expect(apiClient.post).not.toHaveBeenCalled();
    expect(localStorage.getItem('pushToken')).toBeNull();
  });
});
