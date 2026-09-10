import { useState } from 'react';
import type { ReactNode } from 'react';

interface CollapsibleSectionProps {
  title: string;
  badge?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}

// A docked accordion section — used to give Notifications and View their own predictable,
// stackable homes on the right without either one hogging space when the other is what's
// actually needed at the moment.
export const CollapsibleSection = ({ title, badge, defaultOpen = true, children }: CollapsibleSectionProps) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: '1px solid #3a3a40' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'none',
          border: 'none',
          padding: '10px 4px',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ fontWeight: 'bold', fontSize: '14px' }}>
          {title}
          {badge !== undefined && badge > 0 && (
            <span
              style={{
                marginLeft: '6px',
                background: '#d32f2f',
                color: 'white',
                borderRadius: '10px',
                padding: '1px 6px',
                fontSize: '11px',
                fontWeight: 'normal',
              }}
            >
              {badge}
            </span>
          )}
        </span>
        <span style={{ color: '#9a9a9a' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && <div style={{ paddingBottom: '10px' }}>{children}</div>}
    </div>
  );
};
