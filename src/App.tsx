import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { GraphContainer } from './components/GraphContainer';
import { MobileGraphView } from './components/MobileGraphView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useIsMobile } from './hooks/useIsMobile';
import { openCapacitorDb } from './data/capacitorDb';
import { initDataLayer } from './data/store';
import { APP_VERSION } from './version';

// Opened once per app launch. StrictMode runs effects twice in development, so the promise is shared.
let dataReady: Promise<void> | null = null;
const openData = (): Promise<void> => {
  dataReady ??= (async () => {
    if (!Capacitor.isNativePlatform()) {
      throw new Error('16 Local keeps your data on the phone, so it runs in the iOS app rather than in a browser.');
    }
    await initDataLayer(await openCapacitorDb());
  })();
  return dataReady;
};

function App() {
  const [status, setStatus] = useState<'loading' | 'ready' | { error: string }>('loading');
  const isMobile = useIsMobile();

  useEffect(() => {
    let cancelled = false;
    openData()
      .then(() => !cancelled && setStatus('ready'))
      .catch((err: unknown) => {
        dataReady = null;
        if (!cancelled) setStatus({ error: err instanceof Error ? err.message : 'Could not open your data.' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'loading') {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#121214', color: '#9a9a9a' }}>
        Opening your graph…
      </div>
    );
  }

  if (typeof status === 'object') {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, boxSizing: 'border-box', background: '#121214', color: '#f0f0f0', textAlign: 'center' }}>
        <p style={{ color: '#ff6b6b', margin: 0 }}>{status.error}</p>
        <p style={{ color: '#6b6b70', fontSize: 12, margin: 0 }}>16 Local {APP_VERSION}</p>
      </div>
    );
  }

  return isMobile ? (
    <ErrorBoundary>
      <MobileGraphView />
    </ErrorBoundary>
  ) : (
    <ErrorBoundary>
      <GraphContainer />
    </ErrorBoundary>
  );
}

export default App;
