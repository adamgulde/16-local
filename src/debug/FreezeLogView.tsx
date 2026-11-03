import { useEffect, useState } from 'react';
import { ENABLED, recentLines, subscribe } from './freezeLog';

/** Shows the last few diagnostic lines over the app. Taps pass through it. */
export const FreezeLogView = () => {
  const [, force] = useState(0);
  useEffect(() => {
    const unsubscribe = subscribe(() => force((n) => n + 1));
    return () => {
      unsubscribe();
    };
  }, []);
  if (!ENABLED) return null;
  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        maxHeight: '28dvh',
        overflow: 'hidden',
        padding: '4px 6px',
        background: 'rgba(0, 0, 0, 0.8)',
        color: '#9ef59e',
        font: '10px/1.3 ui-monospace, monospace',
        pointerEvents: 'none',
        zIndex: 9999,
        whiteSpace: 'pre-wrap',
      }}
    >
      {recentLines(12).join('\n')}
    </div>
  );
};
