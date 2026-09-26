import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MobilePushBridge } from './MobilePushBridge';

vi.mock('@capacitor-firebase/messaging', () => ({
  FirebaseMessaging: {
    addListener: vi.fn(),
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    createChannel: vi.fn(),
    getToken: vi.fn(),
  },
}));

describe('MobilePushBridge on web', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('makes no Capacitor plugin calls when not on a native platform', async () => {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');

    render(
      <MemoryRouter>
        <MobilePushBridge currentUserId="user-1" />
      </MemoryRouter>
    );

    // Flush microtasks in case the effect scheduled any async work.
    await Promise.resolve();
    await Promise.resolve();

    expect(FirebaseMessaging.addListener).not.toHaveBeenCalled();
    expect(FirebaseMessaging.checkPermissions).not.toHaveBeenCalled();
    expect(FirebaseMessaging.getToken).not.toHaveBeenCalled();
  });
});
