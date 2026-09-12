import type { ReactNode } from 'react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

// The mobile equivalent of the desktop Escape-key handler: there's no keyboard to rely on, so
// every sheet carries its own always-visible, touch-sized close button instead. Deliberately no
// full-screen backdrop — the graph underneath a sheet should stay tappable (selecting a
// different node while a card is open is expected behavior, not blocked by a modal scrim).
export const BottomSheet = ({ open, onClose, title, children }: BottomSheetProps) => {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        maxHeight: '75dvh',
        background: 'rgba(28, 28, 30, 0.96)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid #3a3a40',
        borderRadius: '16px 16px 0 0',
        boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.75)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        touchAction: 'pan-y',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px 8px 16px',
          borderBottom: title ? '1px solid rgba(255,255,255,0.08)' : 'none',
          flexShrink: 0,
        }}
      >
        {title ? <h3 style={{ margin: 0, fontSize: '16px', color: '#f0f0f0' }}>{title}</h3> : <span />}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            minWidth: 44,
            minHeight: 44,
            fontSize: '18px',
            lineHeight: 1,
            background: 'none',
            border: 'none',
            color: '#9a9a9a',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ✕
        </button>
      </div>
      <div
        style={{
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
          padding: '4px 16px max(16px, env(safe-area-inset-bottom, 16px))',
          flex: 1,
        }}
      >
        {children}
      </div>
    </div>
  );
};
