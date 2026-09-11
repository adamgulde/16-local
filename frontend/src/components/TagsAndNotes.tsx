import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { fetchAllTags, fetchTagsForUser, addTagToUser, removeTagFromUser } from '../services/tagService';
import type { Tag, TagAssignment } from '../services/tagService';
import { fetchNote, saveNote } from '../services/noteService';
import { dividerStyle, sectionHeaderStyle } from './cardStyles';
import { CloseIcon } from './Icons';

interface TagsAndNotesProps {
  subjectId: string;
  isCurrentUser: boolean;
}

const pillStyle = (filled: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '3px 8px',
  borderRadius: '12px',
  fontSize: '12px',
  border: '1px solid #3a3a40',
  background: filled ? '#2a3f5f' : 'transparent',
  color: '#f0f0f0',
});

// Self-tags (isSelfTag) are public declarations — anyone viewing this card sees them, filled
// in. Users can only tag themselves (both dictionary tags and custom user-generated tags).
export const TagsAndNotes = ({ subjectId, isCurrentUser }: TagsAndNotesProps) => {
  const [tags, setTags] = useState<TagAssignment[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);

  const [savedNote, setSavedNote] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [editingNote, setEditingNote] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);

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
  // Users can only tag themselves: allow custom tags if user is current user
  const canAddCustom = isCurrentUser && tagInput.trim().length > 0 && !exactDictionaryMatch && !appliedLabels.has(tagInput.trim().toLowerCase());

  const handleAddDictionaryTag = async (tag: Tag) => {
    setTagError(null);
    try {
      const created = await addTagToUser(subjectId, { tagId: tag.id });
      setTags((prev) => [...prev, created]);
      setTagInput('');
      setShowSuggestions(false);
    } catch {
      setTagError('Could not add tag.');
    }
  };

  const handleAddCustomTag = async () => {
    const label = tagInput.trim();
    if (!label) return;
    setTagError(null);
    try {
      const created = await addTagToUser(subjectId, { customLabel: label });
      setTags((prev) => [...prev, created]);
      setTagInput('');
      setShowSuggestions(false);
    } catch {
      setTagError('Could not add tag.');
    }
  };

  const handleRemoveTag = async (assignmentId: string) => {
    setTagError(null);
    try {
      await removeTagFromUser(subjectId, assignmentId);
      setTags((prev) => prev.filter((t) => t.id !== assignmentId));
    } catch {
      setTagError('Could not remove tag.');
    }
  };

  const handleSaveNote = async () => {
    setNoteSaving(true);
    try {
      await saveNote(subjectId, noteDraft);
      setSavedNote(noteDraft);
      setEditingNote(false);
    } finally {
      setNoteSaving(false);
    }
  };

  return (
    <div>
      <p style={sectionHeaderStyle}>Tags</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
        {tags.map((t) => (
          <span key={t.id} style={pillStyle(t.isSelfTag)}>
            {t.category === 'CUSTOM' ? `Custom: ${t.label}` : `${t.category}: ${t.label}`}
            {isCurrentUser && (
              <button
                onClick={() => handleRemoveTag(t.id)}
                aria-label={`Remove ${t.label}`}
                style={{ background: 'none', border: 'none', color: '#9a9a9a', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center' }}
              >
                <CloseIcon size={12} />
              </button>
            )}
          </span>
        ))}
        {tags.length === 0 && <span style={{ color: '#9a9a9a', fontSize: '12px' }}>None yet</span>}
      </div>

      {isCurrentUser && (
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Add a self tag (pick global or type custom)..."
            value={tagInput}
            onChange={(e) => {
              setTagInput(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setShowSuggestions(false)}
            style={{ padding: '6px', width: '100%', boxSizing: 'border-box', fontSize: '13px' }}
          />
          {showSuggestions && (suggestions.length > 0 || canAddCustom) && (
            <div
              onMouseDown={(e) => e.preventDefault()}
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 5,
                background: '#1c1c1e',
                border: '1px solid #3a3a40',
                borderRadius: '4px',
                maxHeight: '160px',
                overflowY: 'auto',
              }}
            >
              {suggestions.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleAddDictionaryTag(t)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', background: 'none', border: 'none', borderBottom: '1px solid #3a3a40', fontSize: '13px', color: '#f0f0f0' }}
                >
                  <span style={{ color: '#9a9a9a', fontSize: '11px', marginRight: '6px' }}>[{t.category}]</span>
                  {t.label}
                </button>
              ))}
              {canAddCustom && (
                <button
                  type="button"
                  onClick={handleAddCustomTag}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', background: 'none', border: 'none', fontSize: '13px', color: '#6ab0ff' }}
                >
                  + Add user-generated tag: "{tagInput.trim()}"
                </button>
              )}
            </div>
          )}
        </div>
      )}
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
                  style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '6px', fontSize: '13px' }}
                />
                <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                  <button onClick={handleSaveNote} disabled={noteSaving}>
                    {noteSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setNoteDraft(savedNote);
                      setEditingNote(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
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
