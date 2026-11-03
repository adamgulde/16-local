import { useMemo, useState, type CSSProperties } from 'react';
import type { GraphNode } from '../services/graphService';
import { contactFullName } from '../graph/mapping';
import { CloseIcon, SearchIcon } from './Icons';

interface LinkPanelProps {
  /** The person being linked from. */
  from: GraphNode;
  /** Everyone you could link to (you are not included). */
  contacts: GraphNode[];
  linkedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onDone: () => void;
  busy?: boolean;
  /** Question shown above the list, e.g. "Connect Ann to someone else?". */
  heading?: string;
  /** Fixed-height panel for mobile, leaving the graph visible above it. */
  compact?: boolean;
}

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
  minHeight: 44,
  borderBottom: '1px solid #2c2c2e',
};

const buttonStyle = (linked: boolean): CSSProperties => ({
  minHeight: 36,
  minWidth: 84,
  padding: '6px 10px',
  borderRadius: 6,
  border: `1px solid ${linked ? '#d32f2f' : '#3d8bff'}`,
  background: linked ? 'rgba(211, 47, 47, 0.15)' : 'rgba(61, 139, 255, 0.15)',
  color: linked ? '#ff6b6b' : '#6ab0ff',
  fontSize: 12,
  cursor: 'pointer',
});

/**
 * Search your contacts and link or unlink them to `from`. Tapping people on the graph does the same
 * thing, so the panel stays usable while you look at the graph.
 */
export const LinkPanel = ({ from, contacts, linkedIds, onToggle, onDone, busy = false, heading, compact = false }: LinkPanelProps) => {
  const [query, setQuery] = useState('');
  const options = useMemo(() => contacts.filter((c) => c.id !== from.id), [contacts, from.id]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q ? options.filter((c) => contactFullName(c).toLowerCase().includes(q)) : options;
    // Linked people first, then by name, so the current links are easy to see and remove.
    return [...matches].sort((a, b) => Number(linkedIds.has(b.id)) - Number(linkedIds.has(a.id)) || contactFullName(a).localeCompare(contactFullName(b)));
  }, [options, query, linkedIds]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        maxHeight: compact ? '42dvh' : 420,
        minHeight: 0,
        padding: 12,
        background: 'rgba(14, 30, 48, 0.97)',
        border: '1px solid #3d8bff',
        borderRadius: 12,
        color: '#f0f0f0',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{heading ?? `Link ${contactFullName(from)} to…`}</div>
          <div style={{ fontSize: 11, color: '#8ab4e0', marginTop: 2 }}>Pick people here, or tap them on the graph. Tapping a linked person unlinks them.</div>
        </div>
        <button type="button" onClick={onDone} aria-label="Done" style={{ background: 'none', border: 'none', color: '#9ec3f0', cursor: 'pointer', padding: 4, minWidth: 40, minHeight: 40 }}>
          <CloseIcon size={16} />
        </button>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 8, background: '#1c1c1e', border: '1px solid #3a3a40', borderRadius: 8 }}>
        <SearchIcon size={16} color="#9a9a9a" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your contacts…"
          aria-label="Search contacts to link"
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#f0f0f0', fontSize: 14 }}
        />
      </label>

      <div style={{ overflowY: 'auto', minHeight: 0 }}>
        {shown.length === 0 && <div style={{ color: '#8e8e93', fontSize: 13, padding: '12px 0' }}>No one matches.</div>}
        {shown.map((c) => {
          const linked = linkedIds.has(c.id);
          return (
            <div key={c.id} style={rowStyle}>
              <span style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contactFullName(c)}</span>
              <button type="button" disabled={busy} onClick={() => onToggle(c.id)} style={buttonStyle(linked)}>
                {linked ? 'Unlink' : 'Link'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
