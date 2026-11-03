import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { GraphNode } from '../services/graphService';
import type { Tag, TagInput } from '../services/tagService';
import { fetchAllTags } from '../services/tagService';
import { contactFullName } from '../graph/mapping';
import { closenessLabel } from '../graph/closeness';
import { ClosenessControl } from './ClosenessControl';
import { CloseIcon, DisconnectIcon, SearchIcon } from './Icons';

interface MultiSelectPanelProps {
  selected: GraphNode[];
  onCloseness: (value: number) => void;
  onAddTag: (payload: TagInput) => void;
  onDelete: () => void;
  /** Closes the panel: leaves select mode and clears the selection. */
  onClose: () => void;
  busy?: boolean;
  compact?: boolean;
}

const sectionTitle: CSSProperties = { margin: '10px 0 6px', fontSize: 11, fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: 0.4 };

/**
 * What you can do to several people at once, using the same rules as a single contact card. Notes and
 * bios stay per person, so they aren't offered here.
 */
export const MultiSelectPanel = ({ selected, onCloseness, onAddTag, onDelete, onClose, busy = false, compact = false }: MultiSelectPanelProps) => {
  const [dictionary, setDictionary] = useState<Tag[]>([]);
  const [tagQuery, setTagQuery] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    fetchAllTags().then(setDictionary).catch(() => setDictionary([]));
  }, []);

  // Tags that the whole selection already has would be a no-op for the backend; show the rest.
  const tagMatches = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    if (!q) return [];
    return dictionary.filter((t) => t.label.toLowerCase().includes(q)).slice(0, 8);
  }, [dictionary, tagQuery]);

  // The closeness shown is the average, so a mixed selection reads sensibly.
  const average = selected.length ? selected.reduce((sum, n) => sum + n.strength, 0) / selected.length : 5.5;
  const names = selected.map(contactFullName);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        maxHeight: compact ? '48dvh' : 480,
        minHeight: 0,
        padding: 12,
        background: 'rgba(28, 28, 30, 0.97)',
        border: '1px solid #3a3a40',
        borderRadius: 12,
        color: '#f0f0f0',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{selected.length} selected</div>
          <div style={{ fontSize: 12, color: '#9a9a9a', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
            {names.length ? names.join(', ') : 'Tap people on the graph to add them.'}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close selection" style={{ background: 'none', border: 'none', color: '#9a9a9a', cursor: 'pointer', padding: 4, minWidth: 40, minHeight: 40 }}>
          <CloseIcon size={16} />
        </button>
      </div>

      {selected.length > 0 && (
        <div style={{ overflowY: 'auto', minHeight: 0 }}>
          <div style={sectionTitle}>Closeness</div>
          <ClosenessControl value={average} disabled={busy} onCommit={onCloseness} />
          <div style={{ fontSize: 11, color: '#8e8e93', marginTop: 4 }}>Sets everyone selected to this value ({closenessLabel(average)} on average now).</div>

          <div style={sectionTitle}>Add a tag to everyone</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#2c2c2e', border: '1px solid #3a3a40', borderRadius: 8 }}>
            <SearchIcon size={14} color="#9a9a9a" />
            <input
              type="search"
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
              placeholder="Search tags…"
              aria-label="Search tags to add"
              style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#f0f0f0', fontSize: 14 }}
            />
          </label>
          {tagMatches.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={busy}
              onClick={() => {
                onAddTag({ tagId: t.id });
                setTagQuery('');
              }}
              style={{ display: 'block', width: '100%', minHeight: 40, textAlign: 'left', padding: '6px 4px', background: 'none', border: 'none', borderBottom: '1px solid #2c2c2e', color: '#dfe6ee', fontSize: 13, cursor: 'pointer' }}
            >
              {t.label}
            </button>
          ))}
          {tagQuery.trim() && !dictionary.some((t) => t.label.toLowerCase() === tagQuery.trim().toLowerCase()) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onAddTag({ label: tagQuery.trim() });
                setTagQuery('');
              }}
              style={{ display: 'block', width: '100%', minHeight: 40, textAlign: 'left', padding: '6px 4px', background: 'none', border: 'none', color: '#6ab0ff', fontSize: 13, cursor: 'pointer' }}
            >
              Create “{tagQuery.trim()}” for everyone
            </button>
          )}

          <div style={{ ...sectionTitle, marginTop: 14 }}>Danger zone</div>
          {!confirming ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '6px 12px', background: 'rgba(211, 47, 47, 0.15)', border: '1px solid #d32f2f', borderRadius: 6, color: '#ff6b6b', fontSize: 13, cursor: 'pointer' }}
            >
              <DisconnectIcon size={14} /> Delete {selected.length}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13 }}>Delete {selected.length} people? This cannot be undone.</span>
              <button type="button" disabled={busy} onClick={() => { setConfirming(false); onDelete(); }} style={{ minHeight: 40, padding: '6px 12px', background: '#d32f2f', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer' }}>
                Delete
              </button>
              <button type="button" onClick={() => setConfirming(false)} style={{ minHeight: 40, padding: '6px 12px', background: '#2c2c2e', border: '1px solid #3a3a40', borderRadius: 6, color: '#c0c0c6', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
