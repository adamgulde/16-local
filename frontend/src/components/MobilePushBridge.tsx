import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import type { PluginListenerHandle } from '@capacitor/core';
import { registerDevice } from '../services/deviceService';
import { isSafeNavigationPath } from '../utils/navigationPath';

interface MobilePushBridgeProps {
  currentUserId: string | null;
}

const getPlatform = (): 'ios' | 'android' | null => {
  const platform = Capacitor.getPlatform();
  if (platform === 'ios' || platform === 'android') return platform;
  return null;
};

export const MobilePushBridge = ({ currentUserId }: MobilePushBridgeProps) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (!currentUserId) return;

    let cancelled = false;
    const listenerHandles: PluginListenerHandle[] = [];

    const setup = async () => {
      try {
        const tokenHandle = await FirebaseMessaging.addListener('tokenReceived', (event) => {
          registerDevice(event.token, getPlatform() ?? 'android')
            .then(() => {
              localStorage.setItem('pushToken', event.token);
            })
            .catch(() => {});
        });
        if (cancelled) {
          tokenHandle.remove();
          return;
        }
        listenerHandles.push(tokenHandle);

        const actionHandle = await FirebaseMessaging.addListener(
          'notificationActionPerformed',
          (event) => {
            const path = (event.notification.data as { path?: unknown } | undefined)?.path;
            if (isSafeNavigationPath(path)) {
              navigate(path);
            }
          }
        );
        if (cancelled) {
          actionHandle.remove();
          return;
        }
        listenerHandles.push(actionHandle);

        const permStatus = await FirebaseMessaging.checkPermissions();
        let granted = permStatus.receive === 'granted';
        if (permStatus.receive === 'prompt') {
          const requested = await FirebaseMessaging.requestPermissions();
          granted = requested.receive === 'granted';
        }
        if (cancelled || !granted) return;

        const platform = getPlatform();
        if (platform === 'android') {
          await FirebaseMessaging.createChannel({ id: 'default', name: 'General', importance: 4 });
        }
        if (cancelled) return;

        const { token } = await FirebaseMessaging.getToken();
        if (cancelled) return;

        await registerDevice(token, platform ?? 'android');
        localStorage.setItem('pushToken', token);
      } catch (err) {
        console.warn('Mobile push setup failed (continuing without push):', err);
      }
    };

    setup();

    return () => {
      cancelled = true;
      listenerHandles.forEach((handle) => {
        handle.remove().catch(() => {});
      });
    };
  }, [currentUserId, navigate]);

  return null;
};
