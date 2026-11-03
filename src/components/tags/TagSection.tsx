import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Tag, TagsUpdate } from '../../services/tagService';
import { addTagToUser, fetchAllTags, peekAllTags, removeTagFromUser } from '../../services/tagService';
import { getSafeErrorMessage } from '../../utils/errors';
import { TagChip } from './TagChip';
import { sectionHeaderStyle } from '../cardStyles';

interface TagSectionProps {
  subjectId: string;
  tags: Tag[];
  onTagsChange: (update: TagsUpdate) => void;
  disabled?: boolean;
}

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  background: '#2c2c2e',
  border: '1px solid #3a3a40',
  borderRadius: 6,
  color: '#fff',
  fontSize: 14,
};

/** The tags on one person. Type to find an existing tag or create a new one for everyone. */
export const TagSection = ({ subjectId, tags, onTagsChange, disabled = false }: TagSectionProps) => {
  const [dictionary, setDictionary] = useState<Tag[]>(peekAllTags() ?? []);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchAllTags().then(setDictionary).catch(() => undefined);
  }, [subjectId]);

  const applied = useMemo(() => new Set(tags.map((t) => t.id)), [tags]);
  const trimmed = query.trim();
  const suggestions = useMemo(() => {
    const q = trimmed.toLowerCase();
    return dictionary.filter((t) => !applied.has(t.id) && (q === '' || t.label.toLowerCase().includes(q))).slice(0, 8);
  }, [dictionary, applied, trimmed]);
  const exactExists = dictionary.some((t) => t.label.toLowerCase() === trimmed.toLowerCase());

  const run = async (action: () => Promise<Tag[]>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      onTagsChange(() => next);
      setQuery('');
      fetchAllTags().then(setDictionary).catch(() => undefined);
    } catch (err) {
      setError(getSafeErrorMessage(err, 'Could not change tags.'));
    } finally {
      setBusy(false);
    }
  };

  const addByLabel = () => {
    if (!trimmed) return;
    void run(() => addTagToUser(subjectId, { label: trimmed }));
  };

  return (
    <div>
      <p style={sectionHeaderStyle}>Tags</p>
      {tags.length === 0 ? (
        <span style={{ color: '#8e8e93', fontSize: 12 }}>No tags yet.</span>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tags.map((t) => (
            <TagChip
              key={t.id}
              tag={t}
              disabled={disabled || busy}
              onRemove={() => void run(async () => {
                await removeTagFromUser(subjectId, t.id);
                return tags.filter((x) => x.id !== t.id);
              })}
            />
          ))}
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        <input
          type="text"
          value={query}
          disabled={disabled || busy}
          placeholder="Add a tag…"
          aria-label="Add a tag"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (suggestions.length > 0 && suggestions[0].label.toLowerCase() === trimmed.toLowerCase()) {
                void run(() => addTagToUser(subjectId, { tagId: suggestions[0].id }));
              } else {
                addByLabel();
              }
            }
          }}
          style={inputStyle}
        />
        {suggestions.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={disabled || busy}
            onClick={() => void run(() => addTagToUser(subjectId, { tagId: t.id }))}
            style={{ display: 'block', width: '100%', minHeight: 36, textAlign: 'left', padding: '6px 4px', background: 'none', border: 'none', borderBottom: '1px solid #2c2c2e', color: '#dfe6ee', fontSize: 13, cursor: 'pointer' }}
          >
            {t.label}
          </button>
        ))}
        {trimmed && !exactExists && (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={addByLabel}
            style={{ display: 'block', width: '100%', minHeight: 36, textAlign: 'left', padding: '6px 4px', background: 'none', border: 'none', color: '#6ab0ff', fontSize: 13, cursor: 'pointer' }}
          >
            Create “{trimmed}”
          </button>
        )}
        {error && <p style={{ color: '#ff6b6b', fontSize: 12, margin: '6px 0 0' }}>{error}</p>}
      </div>
    </div>
  );
};
