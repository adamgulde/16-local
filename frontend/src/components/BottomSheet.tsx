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
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        maxHeight: '65%',
        background: '#1c1c1e',
        borderTop: '1px solid #3a3a40',
        borderRadius: '14px 14px 0 0',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.6)',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 8px 6px 16px',
          borderBottom: title ? '1px solid #3a3a40' : 'none',
          flexShrink: 0,
        }}
      >
        {title ? <h3 style={{ margin: 0 }}>{title}</h3> : <span />}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            minWidth: 44,
            minHeight: 44,
            fontSize: '20px',
            lineHeight: 1,
            background: 'none',
            border: 'none',
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ overflowY: 'auto', padding: '4px 16px 16px' }}>{children}</div>
    </div>
  );
};
