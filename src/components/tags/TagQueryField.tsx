import { forwardRef, useImperativeHandle, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { TagCriteria } from '../../graph/graphSearch';
import { fetchAllTags, peekAllTags, type Tag } from '../../services/tagService';
import { TagChip } from './TagChip';

export interface TagQueryFieldHandle {
  close: () => void;
}

interface TagQueryFieldProps {
  criteria: TagCriteria;
  onChange: (criteria: TagCriteria) => void;
  /** How many people match the current tags. */
  matchCount: number | null;
  placeholder?: string;
  inputStyle?: CSSProperties;
  /** Extra content under the suggestions (e.g. matching people). */
  children?: ReactNode;
  /** 'dropdown' floats under the search bar; 'inline' sits in the page (mobile sheet). */
  layout?: 'dropdown' | 'inline';
}

/** Tags-mode search: pick one or more tags, and the graph shows the people who carry them. */
export const TagQueryField = forwardRef<TagQueryFieldHandle, TagQueryFieldProps>(
  ({ criteria, onChange, matchCount, placeholder, inputStyle, children, layout = 'inline' }, ref) => {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [dictionary, setDictionary] = useState<Tag[]>(peekAllTags() ?? []);

    useImperativeHandle(ref, () => ({ close: () => setOpen(false) }));

    const chosen = useMemo(() => new Set(criteria.tagIds), [criteria.tagIds]);
    const selectedTags = dictionary.filter((t) => chosen.has(t.id));
    const suggestions = useMemo(() => {
      const q = query.trim().toLowerCase();
      return dictionary.filter((t) => !chosen.has(t.id) && (q === '' || t.label.toLowerCase().includes(q))).slice(0, 12);
    }, [dictionary, chosen, query]);

    const add = (id: string) => {
      onChange({ ...criteria, tagIds: [...criteria.tagIds, id] });
      setQuery('');
    };
    const remove = (id: string) => onChange({ ...criteria, tagIds: criteria.tagIds.filter((x) => x !== id) });

    return (
      <div style={{ position: layout === 'dropdown' ? 'static' : undefined, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          {selectedTags.map((t) => (
            <TagChip key={t.id} tag={t} onRemove={() => remove(t.id)} />
          ))}
          <input
            type="text"
            value={query}
            placeholder={placeholder ?? 'Type a tag…'}
            aria-label="Search by tag"
            onFocus={() => {
              setOpen(true);
              fetchAllTags().then(setDictionary).catch(() => undefined);
            }}
            onBlur={() => setOpen(false)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            style={{ background: 'transparent', border: 'none', outline: 'none', color: '#f0f0f0', fontSize: 14, flex: 1, minWidth: 100, ...inputStyle }}
          />
        </div>
        {selectedTags.length > 0 && (
          <div style={{ fontSize: 11, color: '#8e8e93', marginTop: 4 }}>
            {matchCount === null ? '' : `${matchCount} ${matchCount === 1 ? 'person has' : 'people have'} ${selectedTags.length > 1 ? 'all of these' : 'this tag'}`}
          </div>
        )}
        {open && suggestions.length > 0 && (
          <div onMouseDown={(e) => e.preventDefault()} style={{ marginTop: 6, maxHeight: 180, overflowY: 'auto' }}>
            {suggestions.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => add(t.id)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 4px', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#f0f0f0', fontSize: 13, cursor: 'pointer' }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        {children}
      </div>
    );
  }
);
TagQueryField.displayName = 'TagQueryField';
