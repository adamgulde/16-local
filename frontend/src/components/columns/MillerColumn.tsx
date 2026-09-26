import { useMemo, useState } from 'react';
import { ChevronRightIcon, SearchIcon } from '../Icons';

// A single Miller-columns entry — deliberately generic (not tied to `GraphNode`) so the same
// column renderer can list your own contacts, someone else's shared contacts, or the "Other's
// graphs" list of sharers, all through one component (PLAN.md §5 F8).
export interface MillerColumnEntry {
  id: string;
  label: string;
  sublabel?: string;
  badge?: string;
  hasChildren?: boolean;
}

interface MillerColumnProps {
  title: string;
  entries: MillerColumnEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
  error?: string | null;
  emptyLabel?: string;
  isMobile?: boolean;
  width?: number | string;
}

const getAvatarColor = (name: string): string => {
  const colors = ['#3d8bff', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6366f1'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

// Only take the initial from words that actually start with a letter or digit — a contact whose
// name/label carries a parenthetical annotation (e.g. "Blake (met at gym)") should never surface
// a stray punctuation character like "(" as an "initial".
const startsAlnum = /^[\p{L}\p{N}]/u;

const initialsOf = (label: string): string => {
  const words = label.trim().split(/\s+/).filter((w) => startsAlnum.test(w));
  return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase();
};

// A single Miller column: a header, a client-side filter box (everything it lists is already
// loaded — no more per-column fetch, see MillerColumnsView), and the entries themselves.
export const MillerColumn = ({
  title,
  entries,
  selectedId,
  onSelect,
  loading = false,
  error = null,
  emptyLabel = 'Nothing here yet',
  isMobile = false,
  width = 320,
}: MillerColumnProps) => {
  const [filterText, setFilterText] = useState('');

  const filtered = useMemo(() => {
    if (!filterText.trim()) return entries;
    const q = filterText.toLowerCase();
    return entries.filter((e) => e.label.toLowerCase().includes(q));
  }, [entries, filterText]);

  return (
    <div
      style={{
        width: isMobile ? '100%' : width,
        minWidth: isMobile ? '100%' : width,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#1c1c1e',
        borderRight: isMobile ? 'none' : '1px solid #3a3a40',
        color: '#f0f0f0',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #2c2c2e', background: 'rgba(28, 28, 30, 0.95)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3
            style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: isMobile ? '200px' : '180px' }}
            title={title}
          >
            {title}
          </h3>
          <span style={{ fontSize: '12px', color: '#9a9a9a' }}>
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <span style={{ position: 'absolute', left: '8px', display: 'flex', color: '#6a6a70', pointerEvents: 'none' }}>
            <SearchIcon size={14} />
          </span>
          <input
            type="text"
            placeholder="Filter..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px 6px 28px', background: '#2c2c2e', border: '1px solid #3a3a40', borderRadius: '6px', color: '#fff', fontSize: '12px', outline: 'none' }}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {loading && (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: '#9a9a9a', fontSize: '13px' }}>Loading...</div>
        )}

        {error && !loading && (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: '#ff6b6b', fontSize: '13px' }}>{error}</div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div style={{ padding: '36px 16px', textAlign: 'center', color: '#6a6a70', fontSize: '13px' }}>
            {entries.length === 0 ? emptyLabel : 'No matches for filter'}
          </div>
        )}

        {!loading && !error && filtered.map((entry) => {
          const isSelected = selectedId === entry.id;
          const avatarBg = getAvatarColor(entry.label);
          return (
            <div
              key={entry.id}
              onClick={() => onSelect(entry.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                borderRadius: '8px',
                background: isSelected ? 'rgba(61, 139, 255, 0.18)' : '#242426',
                border: `1px solid ${isSelected ? '#3d8bff' : 'transparent'}`,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) e.currentTarget.style.background = '#2c2c2e';
              }}
              onMouseLeave={(e) => {
                if (!isSelected) e.currentTarget.style.background = '#242426';
              }}
              title={entry.label}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '16px',
                    background: avatarBg,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {initialsOf(entry.label)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{ fontSize: '13px', fontWeight: isSelected ? 600 : 500, color: isSelected ? '#fff' : '#f0f0f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      title={entry.label}
                    >
                      {entry.label}
                    </span>
                    {entry.badge && (
                      <span style={{ fontSize: '10px', color: '#8a8a92', background: 'rgba(255, 255, 255, 0.08)', padding: '1px 5px', borderRadius: '4px', fontWeight: 500, flexShrink: 0 }}>
                        {entry.badge}
                      </span>
                    )}
                  </div>
                  {entry.sublabel && (
                    <span style={{ fontSize: '11px', color: '#9a9a9a', marginTop: '2px' }}>{entry.sublabel}</span>
                  )}
                </div>
              </div>
              {entry.hasChildren && (
                <span style={{ color: isSelected ? '#3d8bff' : '#6a6a70', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  <ChevronRightIcon size={16} />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
