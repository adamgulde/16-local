import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { startFreezeLog } from './debug/freezeLog'
import { FreezeLogView } from './debug/FreezeLogView'

startFreezeLog()

if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('native');

  (async () => {
    try {
      await StatusBar.setStyle({ style: Style.Dark });
      if (Capacitor.getPlatform() === 'android') {
        await StatusBar.setBackgroundColor({ color: '#121214' });
      }
    } catch (err) {
      console.warn('StatusBar setup failed (continuing):', err);
    }
  })();
}

// Global trap for uncaught promise rejections across the application
window.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  if (import.meta.env.DEV) {
    console.warn('Unhandled promise rejection caught:', event.reason?.message || 'Unknown reason');
  }
});

// Global trap for uncaught runtime errors
window.addEventListener('error', (event) => {
  if (import.meta.env.DEV) {
    console.warn('Uncaught window error:', event.message);
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    <FreezeLogView />
  </StrictMode>,
)

