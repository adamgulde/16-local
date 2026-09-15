import { useEffect, useRef, useState } from 'react';
import { updateBio } from '../services/userService';
import { sectionHeaderStyle } from './cardStyles';

interface BioSectionProps {
  subjectId: string;
  bio: string;
  isCurrentUser: boolean;
}

// Public, unlike Notes/Tags-on-others — anyone viewing this card sees it, but only the subject
// themselves can ever change it (enforced server-side on the requesting principal).
export const BioSection = ({ subjectId, bio, isCurrentUser }: BioSectionProps) => {
  const [savedBio, setSavedBio] = useState(bio);
  const [draft, setDraft] = useState(bio);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSavedBio(bio);
    setDraft(bio);
    setEditing(false);
  }, [subjectId, bio]);

  const handleSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await updateBio(subjectId, draft);
      setSavedBio(draft);
      setEditing(false);
    } finally {
      setTimeout(() => {
        savingRef.current = false;
        setSaving(false);
      }, 300);
    }
  };

  return (
    <div style={{ textAlign: 'left' }}>
      <p style={sectionHeaderStyle}>Bio</p>
      {editing ? (
        <div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Tell people a bit about yourself..."
            rows={3}
            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '6px', fontSize: '13px' }}
          />
          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
            <button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              disabled={saving}
              onClick={() => {
                setDraft(savedBio);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p style={{ margin: '0 0 6px', fontSize: '13px', color: savedBio ? '#f0f0f0' : '#9a9a9a', whiteSpace: 'pre-wrap' }}>
            {savedBio || 'No bio yet.'}
          </p>
          {isCurrentUser && <button onClick={() => setEditing(true)}>Edit Bio</button>}
        </>
      )}
    </div>
  );
};
