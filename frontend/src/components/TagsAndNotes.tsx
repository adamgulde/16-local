import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { fetchAllTags, fetchTagsForUser, addTagToUser, removeTagFromUser } from '../services/tagService';
import type { Tag, TagAssignment } from '../services/tagService';
import { fetchNote, saveNote } from '../services/noteService';
import { dividerStyle, sectionHeaderStyle } from './cardStyles';
import { CloseIcon } from './Icons';

interface TagsAndNotesProps {
  subjectId: string;
  isCurrentUser: boolean;
}

const pillStyle = (isSelfTag: boolean, isPrivateMine: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '3px 8px',
  borderRadius: '12px',
  fontSize: '12px',
  border: isPrivateMine
    ? '1px solid rgba(192, 132, 252, 0.5)'
    : isSelfTag
    ? '1px solid #3d8bff'
    : '1px solid #3a3a40',
  background: isPrivateMine
    ? 'rgba(192, 132, 252, 0.15)'
    : isSelfTag
    ? '#2a3f5f'
    : 'transparent',
  color: isPrivateMine ? '#e9d5ff' : '#f0f0f0',
});

// Self-tags (isSelfTag) are public declarations — anyone viewing this card sees them.
// Custom tags placed on any user are private to the tagger and only shown on the logged-in user's screen.
export const TagsAndNotes = ({ subjectId, isCurrentUser }: TagsAndNotesProps) => {
  const [tags, setTags] = useState<TagAssignment[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);

  const [savedNote, setSavedNote] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [editingNote, setEditingNote] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const noteSavingRef = useRef(false);

  const [isTagSubmitting, setIsTagSubmitting] = useState(false);
  const tagSubmittingRef = useRef(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const removingIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTags([]);
    fetchTagsForUser(subjectId).then(setTags).catch(() => setTagError('Could not load tags.'));
    fetchAllTags().then(setAllTags).catch(() => {});
    setSavedNote('');
    setNoteDraft('');
    setEditingNote(false);
    if (!isCurrentUser) {
      fetchNote(subjectId)
        .then((content) => {
          setSavedNote(content);
          setNoteDraft(content);
        })
        .catch(() => {});
    }
  }, [subjectId, isCurrentUser]);

  const appliedLabels = useMemo(() => new Set(tags.map((t) => t.label.toLowerCase())), [tags]);

  const suggestions = useMemo(() => {
    const term = tagInput.trim().toLowerCase();
    if (!term) return [];
    return allTags.filter((t) => t.label.toLowerCase().includes(term) && !appliedLabels.has(t.label.toLowerCase())).slice(0, 6);
  }, [tagInput, allTags, appliedLabels]);

  const exactDictionaryMatch = allTags.some((t) => t.label.toLowerCase() === tagInput.trim().toLowerCase());
  // Any user can add custom tags; on another user, custom tags are private to the tagger
  const canAddCustom = tagInput.trim().length > 0 && !exactDictionaryMatch && !appliedLabels.has(tagInput.trim().toLowerCase());

  const handleAddDictionaryTag = async (tag: Tag) => {
    if (tagSubmittingRef.current) return;
    tagSubmittingRef.current = true;
    setIsTagSubmitting(true);
    setTagError(null);
    try {
      const created = await addTagToUser(subjectId, { tagId: tag.id });
      setTags((prev) => [...prev, created]);
      setTagInput('');
      setShowSuggestions(false);
    } catch {
      setTagError('Could not add tag.');
    } finally {
      setTimeout(() => {
        tagSubmittingRef.current = false;
        setIsTagSubmitting(false);
      }, 300);
    }
  };

  const handleAddCustomTag = async () => {
    if (tagSubmittingRef.current) return;
    const label = tagInput.trim();
    if (!label) return;
    tagSubmittingRef.current = true;
    setIsTagSubmitting(true);
    setTagError(null);
    try {
      const created = await addTagToUser(subjectId, { customLabel: label });
      setTags((prev) => [...prev, created]);
      setTagInput('');
      setShowSuggestions(false);
    } catch {
      setTagError('Could not add tag.');
    } finally {
      setTimeout(() => {
        tagSubmittingRef.current = false;
        setIsTagSubmitting(false);
      }, 300);
    }
  };

  const handleRemoveTag = async (assignmentId: string) => {
    if (removingIdsRef.current.has(assignmentId)) return;
    removingIdsRef.current.add(assignmentId);
    setRemovingIds(new Set(removingIdsRef.current));
    setTagError(null);
    try {
      await removeTagFromUser(subjectId, assignmentId);
      setTags((prev) => prev.filter((t) => t.id !== assignmentId));
    } catch {
      setTagError('Could not remove tag.');
    } finally {
      removingIdsRef.current.delete(assignmentId);
      setRemovingIds(new Set(removingIdsRef.current));
    }
  };

  const handleSaveNote = async () => {
    if (noteSavingRef.current) return;
    noteSavingRef.current = true;
    setNoteSaving(true);
    setNoteError(null);
    try {
      await saveNote(subjectId, noteDraft);
      setSavedNote(noteDraft);
      setEditingNote(false);
    } catch {
      setNoteError('Could not save note.');
    } finally {
      setTimeout(() => {
        noteSavingRef.current = false;
        setNoteSaving(false);
      }, 300);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <p style={sectionHeaderStyle}>Tags</p>
        {!isCurrentUser && (
          <span style={{ fontSize: '11px', color: '#c084fc' }}>Custom tags are private to you</span>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
        {tags.map((t) => {
          const isPrivateMine = t.isMine && !t.isSelfTag;
          return (
            <span key={t.id} style={pillStyle(t.isSelfTag, isPrivateMine)}>
              {isPrivateMine
                ? `Custom (Private): ${t.label}`
                : t.category === 'CUSTOM'
                ? `Custom: ${t.label}`
                : `${t.category}: ${t.label}`}
              {t.isMine && (
                <button
                  onClick={() => handleRemoveTag(t.id)}
                  disabled={removingIds.has(t.id)}
                  aria-label={`Remove ${t.label}`}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: isPrivateMine ? '#e9d5ff' : '#9a9a9a',
                    cursor: removingIds.has(t.id) ? 'not-allowed' : 'pointer',
                    padding: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  <CloseIcon size={12} />
                </button>
              )}
            </span>
          );
        })}
        {tags.length === 0 && <span style={{ color: '#9a9a9a', fontSize: '12px' }}>None yet</span>}
      </div>

      <div style={{ position: 'relative' }}>
        <input
          type="text"
          placeholder={isCurrentUser ? "Add a self tag (pick global or type custom)..." : "Add a private custom tag for this user..."}
          value={tagInput}
          onChange={(e) => {
            setTagInput(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setShowSuggestions(false)}
          style={{ padding: '8px 10px', width: '100%', boxSizing: 'border-box', fontSize: '16px', background: '#1c1c1e', border: '1px solid #3a3a40', color: '#fff', borderRadius: '6px' }}
        />
        {showSuggestions && (suggestions.length > 0 || canAddCustom) && (
          <div
            onMouseDown={(e) => e.preventDefault()}
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 10,
              background: '#1c1c1e',
              border: '1px solid #3a3a40',
              borderRadius: '4px',
              maxHeight: '160px',
              overflowY: 'auto',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            }}
          >
            {suggestions.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={isTagSubmitting}
                onClick={() => handleAddDictionaryTag(t)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', borderBottom: '1px solid #3a3a40', fontSize: '14px', color: isTagSubmitting ? '#6a6a70' : '#f0f0f0', cursor: isTagSubmitting ? 'not-allowed' : 'pointer' }}
              >
                <span style={{ color: '#9a9a9a', fontSize: '11px', marginRight: '6px' }}>[{t.category}]</span>
                {t.label}
              </button>
            ))}
            {canAddCustom && (
              <button
                type="button"
                disabled={isTagSubmitting}
                onClick={handleAddCustomTag}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', fontSize: '14px', color: isTagSubmitting ? '#6a6a70' : '#c084fc', cursor: isTagSubmitting ? 'not-allowed' : 'pointer' }}
              >
                {isTagSubmitting
                  ? 'Adding tag...'
                  : isCurrentUser
                  ? `+ Add custom tag: "${tagInput.trim()}"`
                  : `+ Add private custom tag: "${tagInput.trim()}" (visible only to you)`}
              </button>
            )}
          </div>
        )}
      </div>
      {tagError && <p style={{ color: '#ff6b6b', fontSize: '12px', margin: '4px 0 0' }}>{tagError}</p>}

      {!isCurrentUser && (
        <>
          <hr style={dividerStyle} />
          <div>
            <p style={sectionHeaderStyle}>Notes</p>
            {editingNote ? (
              <div>
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Private notes only you can see..."
                  rows={4}
                  style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '8px 10px', fontSize: '16px', background: '#1c1c1e', border: '1px solid #3a3a40', color: '#fff', borderRadius: '6px' }}
                />
                <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                  <button onClick={handleSaveNote} disabled={noteSaving}>
                    {noteSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    disabled={noteSaving}
                    onClick={() => {
                      setNoteDraft(savedNote);
                      setEditingNote(false);
                      setNoteError(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
                {noteError && <p style={{ color: '#ff6b6b', fontSize: '12px', margin: '4px 0 0' }}>{noteError}</p>}
              </div>
            ) : (
              <>
                <p style={{ margin: '0 0 6px', fontSize: '13px', color: savedNote ? '#f0f0f0' : '#9a9a9a', whiteSpace: 'pre-wrap' }}>
                  {savedNote || 'No private note yet.'}
                </p>
                <button onClick={() => setEditingNote(true)}>Edit Note</button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};
