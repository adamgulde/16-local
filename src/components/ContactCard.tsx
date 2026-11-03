import { useEffect, useState, type CSSProperties } from 'react';
import type { GraphNode, SelfProfile } from '../services/graphService';
import type { UpdateContactPayload } from '../services/contactService';
import type { TagsUpdate } from '../services/tagService';
import { contactFullName } from '../graph/mapping';
import { TagsAndNotes } from './TagsAndNotes';
import { dividerStyle, sectionHeaderStyle } from './cardStyles';
import { CloseIcon, DisconnectIcon } from './Icons';
import { formatPhoneNumberDisplay, formatPhoneNumber } from '../utils/phoneUtils';
import { ClosenessControl } from './ClosenessControl';

interface ContactCardProps {
  node: GraphNode;
  onClose: () => void;
  onUpdate: (payload: UpdateContactPayload) => void;
  // Only invoked for the SELF node.
  onUpdateSelf?: (payload: Partial<SelfProfile>) => void;
  onDelete: () => void;
  /** Starts link mode for this person: the search panel, and taps on the graph link people. */
  onStartLink: () => void;
  onTagsChange: (update: TagsUpdate) => void;
  onNoteChange: (note: string) => void;
  onSaveNote: (id: string, content: string) => Promise<void>;
  onFindPath: () => void;
  busy?: boolean;
  compact?: boolean;
  style?: CSSProperties;
}

const SELF_BIO_MAX_LENGTH = 2000;

const primaryButtonStyle: CSSProperties = {
  background: '#2a5f9e',
  border: '1px solid #3d8bff',
  color: 'white',
  fontWeight: 'bold',
  padding: '8px 16px',
  minHeight: 44,
  borderRadius: '8px',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  touchAction: 'manipulation',
};

const secondaryButtonStyle: CSSProperties = {
  background: '#232326',
  border: '1px solid #3a3a40',
  color: '#c0c0c6',
  padding: '6px 12px',
  minHeight: 36,
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '12px',
};

const inputStyle: CSSProperties = {
  padding: '6px 8px',
  background: '#2c2c2e',
  border: '1px solid #3a3a40',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '13px',
};

export const ContactCard = ({
  node,
  onClose,
  onUpdate,
  onUpdateSelf,
  onDelete,
  onStartLink,
  onTagsChange,
  onNoteChange,
  onSaveNote,
  onFindPath,
  busy = false,
  compact = false,
  style,
}: ContactCardProps) => {
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(node.firstName);
  const [lastName, setLastName] = useState(node.lastName);
  const [about, setAbout] = useState(node.about);
  const [phoneNumber, setPhoneNumber] = useState(node.phoneNumber ?? '');

  useEffect(() => {
    // Reset the draft fields whenever a different node is selected. Keyed on id only, so a save on
    // the same node doesn't overwrite whatever is being typed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFirstName(node.firstName);
    setLastName(node.lastName);
    setAbout(node.about);
    setPhoneNumber(node.phoneNumber ?? '');
    setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  const isSelf = node.kind === 'SELF';
  const name = contactFullName(node);

  const handleSaveFields = () => {
    if (isSelf) {
      const payload: Partial<SelfProfile> = {};
      if (firstName.trim() !== node.firstName) payload.firstName = firstName.trim();
      if (lastName.trim() !== node.lastName) payload.lastName = lastName.trim();
      if (about !== node.about) payload.about = about;
      if (Object.keys(payload).length > 0) onUpdateSelf?.(payload);
      setEditing(false);
      return;
    }
    const payload: UpdateContactPayload = {};
    if (firstName.trim() !== node.firstName) payload.firstName = firstName.trim();
    if (lastName.trim() !== node.lastName) payload.lastName = lastName.trim();
    if (about !== node.about) payload.about = about;
    const resolvedPhone = phoneNumber.trim() ? formatPhoneNumber(phoneNumber) : '';
    if (resolvedPhone !== (node.phoneNumber ?? '')) payload.phoneNumber = resolvedPhone || undefined;
    if (Object.keys(payload).length > 0) onUpdate(payload);
    setEditing(false);
  };

  return (
    <div className="contact-card" style={{ padding: compact ? '12px' : '16px', background: '#1c1c1e', border: '1px solid #3a3a40', borderRadius: '8px', ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: compact ? '18px' : '22px' }}>
            {name || 'Unnamed'}
            {isSelf && ' (you)'}
          </h2>
          {node.phoneNumber && !editing && (
            <p style={{ margin: '4px 0 0', color: '#9a9a9a', fontSize: '12px' }}>{formatPhoneNumberDisplay(node.phoneNumber)}</p>
          )}
        </div>
        <button onClick={onClose} aria-label="Close" style={{ minWidth: 40, minHeight: 40, background: 'none', border: 'none', color: '#9a9a9a', cursor: 'pointer' }}>
          <CloseIcon size={18} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '12px' }}>
        {!isSelf && (
          <button onClick={onFindPath} style={primaryButtonStyle}>
            Find Path
          </button>
        )}
        {!editing && (
          <button onClick={() => setEditing(true)} style={secondaryButtonStyle}>
            Edit
          </button>
        )}
        {!isSelf && (
          <button onClick={onStartLink} disabled={busy} style={secondaryButtonStyle}>
            Link to…
          </button>
        )}
        {!isSelf && (
          <button
            onClick={() => {
              if (window.confirm(`Delete ${name || 'this contact'}? This cannot be undone.`)) onDelete();
            }}
            disabled={busy}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(211, 47, 47, 0.15)',
              border: '1px solid #d32f2f',
              color: '#ff6b6b',
              borderRadius: '6px',
              padding: '6px 12px',
              minHeight: 36,
              fontSize: '12px',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            <DisconnectIcon size={14} /> Delete
          </button>
        )}
      </div>

      {!isSelf && (
        <>
          <hr style={dividerStyle} />
          <p style={sectionHeaderStyle}>Closeness</p>
          <ClosenessControl value={node.strength} disabled={busy} onCommit={(value) => onUpdate({ strength: value })} />
        </>
      )}

      {editing ? (
        <div>
          <p style={sectionHeaderStyle}>Edit</p>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" style={{ ...inputStyle, flex: 1 }} />
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" style={{ ...inputStyle, flex: 1 }} />
          </div>
          <textarea
            value={about}
            onChange={(e) => setAbout(e.target.value.slice(0, isSelf ? SELF_BIO_MAX_LENGTH : undefined))}
            placeholder={isSelf ? 'Your bio…' : 'About this person…'}
            rows={3}
            maxLength={isSelf ? SELF_BIO_MAX_LENGTH : undefined}
            style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', resize: 'vertical', marginBottom: isSelf ? '2px' : '8px' }}
          />
          {isSelf && (
            <p style={{ margin: '0 0 8px', fontSize: '11px', color: about.length >= SELF_BIO_MAX_LENGTH ? '#ff6b6b' : '#8e8e93', textAlign: 'right' }}>
              {about.length}/{SELF_BIO_MAX_LENGTH}
            </p>
          )}
          {!isSelf && (
            <input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
              placeholder="+1 ___-___-____"
              style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', marginBottom: '8px' }}
            />
          )}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={handleSaveFields} disabled={busy} style={primaryButtonStyle}>
              Save
            </button>
            <button
              onClick={() => {
                setFirstName(node.firstName);
                setLastName(node.lastName);
                setAbout(node.about);
                setPhoneNumber(node.phoneNumber ?? '');
                setEditing(false);
              }}
              style={secondaryButtonStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p style={sectionHeaderStyle}>{isSelf ? 'Bio' : 'About'}</p>
          <p style={{ margin: 0, fontSize: '13px', color: node.about ? '#f0f0f0' : '#9a9a9a', whiteSpace: 'pre-wrap' }}>
            {node.about || 'Nothing written yet.'}
          </p>
        </div>
      )}

      {!isSelf && (
        <>
          <hr style={dividerStyle} />
          <TagsAndNotes
            subjectId={node.id}
            isCurrentUser={false}
            tags={node.tags}
            onTagsChange={onTagsChange}
            note={node.note}
            onNoteChange={onNoteChange}
            onSaveNote={onSaveNote}
          />
        </>
      )}
    </div>
  );
};
