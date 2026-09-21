import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'

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
  </StrictMode>,
)

