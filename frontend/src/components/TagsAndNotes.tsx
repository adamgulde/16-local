import { useEffect, useRef, useState } from 'react';
import { dividerStyle, sectionHeaderStyle } from './cardStyles';
import { TagSection } from './tags/TagSection';
import type { TagAssignment, TagsUpdate } from '../services/tagService';

interface TagsAndNotesProps {
  subjectId: string;
  isCurrentUser: boolean;
  tags?: TagAssignment[] | null;
  onTagsChange?: (update: TagsUpdate) => void;
  // The contact's note, as loaded with the graph ("" if none) — a contact's note only ever
  // arrives on its `GraphNode` (PLAN.md §3); there's no separate fetch-by-id endpoint.
  note?: string | null;
  // Called when the note is saved, so the caller's copy of the node stays in sync.
  onNoteChange?: (note: string) => void;
  // '/api/users' (default) or '/api/contacts' — see TagSection.
  endpointBase?: string;
  // Saves the note — the contact editor (ContactCard, F3) passes `PUT /api/contacts/{id}/note`.
  onSaveNote?: (subjectId: string, content: string) => Promise<void>;
}

export const TagsAndNotes = ({
  subjectId,
  isCurrentUser,
  tags,
  onTagsChange,
  note,
  onNoteChange,
  endpointBase,
  onSaveNote,
}: TagsAndNotesProps) => {
  const savedNoteValue = note ?? '';
  const [noteError, setNoteError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(savedNoteValue);
  const [noteDraft, setNoteDraft] = useState(savedNoteValue);
  const [editingNote, setEditingNote] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const noteSavingRef = useRef(false);

  useEffect(() => {
    setSavedNote(savedNoteValue);
    setNoteDraft(savedNoteValue);
    setEditingNote(false);
  }, [subjectId, savedNoteValue]);

  const handleSaveNote = async () => {
    if (noteSavingRef.current) return;
    noteSavingRef.current = true;
    setNoteSaving(true);
    setNoteError(null);
    try {
      if (!onSaveNote) throw new Error('No save handler provided for this note.');
      await onSaveNote(subjectId, noteDraft);
      setSavedNote(noteDraft);
      setEditingNote(false);
      onNoteChange?.(noteDraft);
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
      <TagSection
        key={subjectId}
        subjectId={subjectId}
        isCurrentUser={isCurrentUser}
        tags={tags}
        onTagsChange={onTagsChange}
        endpointBase={endpointBase}
      />

      {/* Private Notes Section (on other users only) */}
      {!isCurrentUser && (
        <>
          <hr style={dividerStyle} />
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <p style={sectionHeaderStyle}>Private Notes</p>
              <span style={{ fontSize: '11px', color: '#9a9a9f' }}>Only visible to you</span>
            </div>
            {editingNote ? (
              <div>
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Add private thoughts, meeting details, follow-ups..."
                  rows={4}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                    padding: '8px 10px',
                    fontSize: '14px',
                    background: '#1c1c1e',
                    border: '1px solid #3a3a40',
                    color: '#fff',
                    borderRadius: '6px',
                  }}
                />
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  <button
                    onClick={handleSaveNote}
                    disabled={noteSaving}
                    style={{
                      padding: '6px 14px',
                      background: '#2b3f5c',
                      border: '1px solid #3d8bff',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontSize: '13px',
                      cursor: noteSaving ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {noteSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    disabled={noteSaving}
                    onClick={() => {
                      setNoteDraft(savedNote);
                      setEditingNote(false);
                      setNoteError(null);
                    }}
                    style={{
                      padding: '6px 14px',
                      background: 'transparent',
                      border: '1px solid #3a3a40',
                      borderRadius: '6px',
                      color: '#b0b0ba',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
                {noteError && <p style={{ color: '#ff6b6b', fontSize: '12px', margin: '4px 0 0' }}>{noteError}</p>}
              </div>
            ) : (
              <>
                <p
                  style={{
                    margin: '0 0 8px',
                    fontSize: '13px',
                    color: savedNote ? '#f0f0f0' : '#8e8e93',
                    whiteSpace: 'pre-wrap',
                    background: savedNote ? '#18181b' : 'transparent',
                    padding: savedNote ? '8px 10px' : '0',
                    borderRadius: '6px',
                    border: savedNote ? '1px solid #2c2c30' : 'none',
                  }}
                >
                  {savedNote || 'No private note added yet.'}
                </p>
                <button
                  onClick={() => setEditingNote(true)}
                  style={{
                    padding: '5px 12px',
                    background: '#232326',
                    border: '1px solid #3a3a40',
                    borderRadius: '6px',
                    color: '#c0c0c6',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  {savedNote ? 'Edit Note' : '+ Add Note'}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};
