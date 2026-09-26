import { useEffect, useMemo, useRef, useState } from 'react';
import { getSafeErrorMessage } from '../../services/apiClient';
import {
  addTagToUser,
  fetchAllTags,
  fetchTagsForUser,
  peekAllTags,
  removeTagFromUser,
  type Tag,
  type TagAssignment,
  type TagKind,
  type TagsUpdate,
} from '../../services/tagService';
import { useIsMobile } from '../../hooks/useIsMobile';
import { sectionHeaderStyle } from '../cardStyles';
import { LockIcon, PlusIcon, SearchIcon } from '../Icons';
import { TagChip } from './TagChip';
import { TagPicker, type TagPickerHandle } from './TagPicker';
import { CategoryIcon } from './CategoryIcon';
import { KIND_COLORS, pickerRows } from './tagTheme';

interface TagSectionProps {
  subjectId: string;
  isCurrentUser: boolean;
  // The graph views load everyone's tags with the directory and own them: pass both. Without
  // them (the columns view) the section fetches and keeps this person's tags itself.
  tags?: TagAssignment[] | null;
  onTagsChange?: (update: TagsUpdate) => void;
}

const LEGEND: TagKind[] = ['SELF', 'CUSTOM', 'PRIVATE'];

// Applied tags grouped by category (icon per row), plus a collapsible compact picker with the
// same behaviour as tag search. On your own card you self-tag (public); on anyone else's card
// every tag you add is private to you, and sensitive self-only categories are hidden.
export const TagSection = ({ subjectId, isCurrentUser, tags, onTagsChange }: TagSectionProps) => {
  const isMobile = useIsMobile();
  const preloaded = tags != null && onTagsChange != null;
  const [ownTags, setOwnTags] = useState<TagAssignment[]>([]);
  const assignments = preloaded ? tags : ownTags;
  const updateTags: (update: TagsUpdate) => void = preloaded ? onTagsChange : setOwnTags;
  const [dictionary, setDictionary] = useState<Tag[]>(() => peekAllTags() ?? []);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const pickerRef = useRef<TagPickerHandle>(null);

  // Mounted with key={subjectId}, so switching people starts from fresh state.
  useEffect(() => {
    if (!preloaded) {
      fetchTagsForUser(subjectId).then(setOwnTags).catch(() => setError('Could not load tags.'));
    }
    fetchAllTags().then(setDictionary).catch(() => {});
  }, [subjectId, preloaded]);

  const categoryOrder = useMemo(
    () => new Map(dictionary.filter((t) => t.level === 1).map((t, i) => [t.label, i])),
    [dictionary]
  );

  // Public tags first (grouped by category in taxonomy order), then your private ones.
  const groups = useMemo(() => {
    const byCategory = new Map<string, TagAssignment[]>();
    assignments
      .filter((a) => a.kind !== 'PRIVATE')
      .forEach((a) => byCategory.set(a.category, [...(byCategory.get(a.category) ?? []), a]));
    return [...byCategory.entries()].sort(
      ([a], [b]) => (categoryOrder.get(a) ?? 99) - (categoryOrder.get(b) ?? 99) || a.localeCompare(b)
    );
  }, [assignments, categoryOrder]);
  const privateTags = assignments.filter((a) => a.kind === 'PRIVATE');

  // What the viewer themselves has applied here — the picker shows these checked and a second
  // tap removes them.
  const mine = useMemo(() => assignments.filter((a) => a.isMine), [assignments]);
  const appliedIds = useMemo(() => new Set(mine.map((a) => a.tagId).filter((id): id is string => !!id)), [mine]);

  const run = async (action: () => Promise<void>, fallback: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(getSafeErrorMessage(err, fallback));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handlePick = (tag: Tag) => {
    const existing = mine.find((a) => a.tagId === tag.id);
    if (existing) {
      handleRemove(existing.id);
      return;
    }
    run(async () => {
      const next = await addTagToUser(subjectId, { tagId: tag.id });
      setQuery('');
      updateTags(() => next);
    }, 'Could not add tag.');
  };

  const handleCreateCustom = (label: string, parent: Tag | null) =>
    run(async () => {
      const next = await addTagToUser(subjectId, { customLabel: label, parentTagId: parent?.id ?? null });
      setQuery('');
      updateTags(() => next);
    }, 'Could not add tag.');

  const handleRemove = (assignmentId: string) => {
    if (removingIds.has(assignmentId)) return;
    setRemovingIds((prev) => new Set(prev).add(assignmentId));
    setError(null);
    removeTagFromUser(subjectId, assignmentId)
      .then(() => updateTags((prev) => prev.filter((a) => a.id !== assignmentId)))
      .catch((err) => setError(getSafeErrorMessage(err, 'Could not remove tag.')))
      .finally(() =>
        setRemovingIds((prev) => {
          const next = new Set(prev);
          next.delete(assignmentId);
          return next;
        })
      );
  };

  const iconFor = (category: string) => dictionary.find((t) => t.level === 1 && t.label === category)?.icon ?? null;
  const rowLabelStyle = { display: 'inline-flex', width: '18px', justifyContent: 'center', paddingTop: '4px', flexShrink: 0 } as const;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <p style={{ ...sectionHeaderStyle, margin: 0 }}>Tags</p>
        <button
          type="button"
          onClick={() => {
            setEditing((v) => !v);
            setQuery('');
          }}
          aria-expanded={editing}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 8px',
            fontSize: '11px',
            borderRadius: '6px',
            border: '1px solid #3a3a40',
            background: editing ? '#2a3f5f' : '#232326',
            color: editing ? '#fff' : '#c0c0c6',
            cursor: 'pointer',
          }}
        >
          {editing ? 'Done' : (
            <>
              <PlusIcon size={11} /> {isCurrentUser ? 'Add tags' : 'Add private tag'}
            </>
          )}
        </button>
      </div>

      {/* Applied tags, one row per category */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {groups.map(([category, items]) => (
          <div key={category} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
            <span style={rowLabelStyle} title={category}>
              <CategoryIcon icon={iconFor(category)} size={12} color="#8e8e93" />
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', minWidth: 0 }}>
              {items.map((a) => (
                <TagChip
                  key={a.id}
                  tag={a}
                  onRemove={editing && a.isMine ? () => handleRemove(a.id) : undefined}
                  removing={removingIds.has(a.id)}
                />
              ))}
            </div>
          </div>
        ))}
        {privateTags.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
            <span style={rowLabelStyle} title="Only visible to you">
              <LockIcon size={12} color={KIND_COLORS.PRIVATE.accent} />
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', minWidth: 0 }}>
              {privateTags.map((a) => (
                <TagChip
                  key={a.id}
                  tag={a}
                  onRemove={editing ? () => handleRemove(a.id) : undefined}
                  removing={removingIds.has(a.id)}
                />
              ))}
            </div>
          </div>
        )}
        {assignments.length === 0 && (
          <span style={{ color: '#8e8e93', fontSize: '12px' }}>
            {isCurrentUser ? 'No tags yet — add a few so people can find you.' : 'No tags yet.'}
          </span>
        )}
      </div>

      {editing && (
        <div style={{ marginTop: '10px', padding: '8px', borderRadius: '8px', background: '#18181b', border: '1px solid #2d2d32' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 8px',
              marginBottom: '8px',
              borderRadius: '6px',
              background: '#1c1c1e',
              border: '1px solid #3a3a40',
            }}
          >
            <SearchIcon size={13} color="#6a6a70" />
            <input
              type="text"
              value={query}
              autoFocus={!isMobile}
              placeholder={isCurrentUser ? 'Find a tag, or type your own…' : 'Find a tag or write a private one…'}
              aria-label="Find or create a tag"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  pickerRef.current?.submitQuery();
                }
              }}
              style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '12px' }}
            />
          </div>
          <TagPicker
            ref={pickerRef}
            tags={dictionary}
            query={query}
            appliedIds={appliedIds}
            onPick={handlePick}
            onCreateCustom={handleCreateCustom}
            onClearQuery={() => setQuery('')}
            customNeedsParent={isCurrentUser}
            excludeSelfOnly={!isCurrentUser}
            density="compact"
            rows={pickerRows('compact', isMobile)}
            disabled={busy}
          />
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px', fontSize: '10px', color: '#8e8e93', flexWrap: 'wrap' }}>
            {LEGEND.filter((k) => isCurrentUser ? k !== 'PRIVATE' : true).map((k) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: KIND_COLORS[k].accent }} />
                {KIND_COLORS[k].name}
              </span>
            ))}
            {!isCurrentUser && <span>· Tags you add here are only visible to you</span>}
          </div>
        </div>
      )}

      {error && <p style={{ color: '#ff6b6b', fontSize: '12px', margin: '6px 0 0' }}>{error}</p>}
    </div>
  );
};
