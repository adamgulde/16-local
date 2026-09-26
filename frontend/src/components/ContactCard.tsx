import { useEffect, useState, type CSSProperties } from 'react';
import type { GraphNode } from '../services/graphService';
import type { UpdateContactPayload } from '../services/contactService';
import type { UpdateSelfProfilePayload } from '../services/shareService';
import type { TagsUpdate } from '../services/tagService';
import { contactFullName } from '../graph/mapping';
import { TagsAndNotes } from './TagsAndNotes';
import { TagChip } from './tags/TagChip';
import { dividerStyle, sectionHeaderStyle } from './cardStyles';
import { CloseIcon, DisconnectIcon } from './Icons';
import { formatPhoneNumberDisplay, formatPhoneNumber } from '../utils/phoneUtils';

// The graph's node-detail card (PLAN.md §5 F3) — also reused as the columns view's inspector
// panel (MillerColumnsView). Operates on a GraphNode/contact, never the old global User.
interface ContactCardProps {
  node: GraphNode;
  ownContacts: GraphNode[];
  linkedIds: Set<string>;
  onClose: () => void;
  onUpdate: (payload: UpdateContactPayload) => void;
  // Only invoked for the SELF node — PATCH /api/users/me, not /api/contacts (PLAN.md §3).
  onUpdateSelf?: (payload: UpdateSelfProfilePayload) => void;
  onDelete: () => void;
  onLink: (otherId: string) => void;
  onUnlink: (otherId: string) => void;
  onTagsChange: (update: TagsUpdate) => void;
  onNoteChange: (note: string) => void;
  onSaveNote: (id: string, content: string) => Promise<void>;
  onFindPath: () => void;
  busy?: boolean;
  compact?: boolean;
  style?: CSSProperties;
}

// Self bio max length (PLAN.md §3 amendment 2026-09-26) — `users.bio` is a DB `varchar(2000)`
// column; contact `about` has no such limit (backend `Contact.about` is a `text` column).
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

export const ContactCard = ({
  node,
  ownContacts,
  linkedIds,
  onClose,
  onUpdate,
  onUpdateSelf,
  onDelete,
  onLink,
  onUnlink,
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
  const [showLinkPicker, setShowLinkPicker] = useState(false);

  useEffect(() => {
    // Resets the draft fields whenever a different node is selected.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFirstName(node.firstName);
    setLastName(node.lastName);
    setAbout(node.about);
    setPhoneNumber(node.phoneNumber ?? '');
    setEditing(false);
    setShowLinkPicker(false);
    // Deliberately keyed on node.id only — a value change on the same node (e.g. after a save)
    // shouldn't clobber whatever the person is mid-typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  const isSelf = node.kind === 'SELF';
  const isHidden = node.kind === 'HIDDEN';
  // Own contacts and SELF are both editable per the contract; SELF edits go to
  // `PATCH /api/users/me` instead of `/api/contacts/{id}` (see onUpdateSelf/handleSaveFields).
  const canEditFields = node.editable;

  if (isHidden) {
    return (
      <div className="contact-card" style={{ padding: compact ? '12px' : '16px', background: '#1c1c1e', border: '1px solid #3a3a40', borderRadius: '8px', ...style }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: compact ? '18px' : '22px', color: '#9a9a9a' }}>Hidden User</h2>
          <button onClick={onClose} aria-label="Close" style={{ minWidth: 40, minHeight: 40, background: 'none', border: 'none', color: '#9a9a9a', cursor: 'pointer' }}>
            <CloseIcon size={18} />
          </button>
        </div>
        <p style={{ color: '#8e8e93', fontSize: '13px', marginTop: '10px' }}>
          This person exists in the shared graph, but the sharer has chosen not to reveal them.
        </p>
      </div>
    );
  }

  const name = contactFullName(node);

  const handleSaveFields = () => {
    if (isSelf) {
      const payload: UpdateSelfProfilePayload = {};
      if (firstName.trim() !== node.firstName) payload.firstName = firstName.trim();
      if (lastName.trim() !== node.lastName) payload.lastName = lastName.trim();
      if (about !== node.about) payload.bio = about;
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

  const linkableContacts = ownContacts.filter((c) => c.id !== node.id && !linkedIds.has(c.id));
  const linkedContacts = ownContacts.filter((c) => linkedIds.has(c.id));

  return (
    <div className="contact-card" style={{ padding: compact ? '12px' : '16px', background: '#1c1c1e', border: '1px solid #3a3a40', borderRadius: '8px', ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: compact ? '18px' : '22px' }}>
            {name}
            {isSelf && ' (you)'}
          </h2>
          {node.source && (
            <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#e0a94c' }}>via {node.source.sharerName}</p>
          )}
          {node.phoneNumber && !editing && canEditFields && (
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
        {canEditFields && !editing && (
          <button onClick={() => setEditing(true)} style={secondaryButtonStyle}>
            Edit
          </button>
        )}
        {canEditFields && !isSelf && (
          <button
            onClick={() => setShowLinkPicker((v) => !v)}
            style={{ ...secondaryButtonStyle, borderColor: showLinkPicker ? '#3d8bff' : '#3a3a40' }}
          >
            Link to…
          </button>
        )}
        {canEditFields && !isSelf && (
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

      {showLinkPicker && canEditFields && !isSelf && (
        <div style={{ marginTop: '10px', padding: '8px', background: '#18181b', border: '1px solid #2d2d32', borderRadius: '8px' }}>
          {linkedContacts.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <p style={{ ...sectionHeaderStyle, fontSize: '12px' }}>Linked</p>
              {linkedContacts.map((c) => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                  <span style={{ fontSize: '13px' }}>{contactFullName(c)}</span>
                  <button onClick={() => onUnlink(c.id)} disabled={busy} style={secondaryButtonStyle}>
                    Unlink
                  </button>
                </div>
              ))}
            </div>
          )}
          <p style={{ ...sectionHeaderStyle, fontSize: '12px' }}>Link to another contact</p>
          {linkableContacts.length === 0 ? (
            <span style={{ color: '#8e8e93', fontSize: '12px' }}>No other contacts to link.</span>
          ) : (
            linkableContacts.map((c) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                <span style={{ fontSize: '13px' }}>{contactFullName(c)}</span>
                <button onClick={() => onLink(c.id)} disabled={busy} style={secondaryButtonStyle}>
                  Link
                </button>
              </div>
            ))
          )}
        </div>
      )}

      <hr style={dividerStyle} />

      {canEditFields && editing ? (
        <div>
          <p style={sectionHeaderStyle}>Edit</p>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              style={{ flex: 1, padding: '6px 8px', background: '#2c2c2e', border: '1px solid #3a3a40', borderRadius: '6px', color: '#fff', fontSize: '13px' }}
            />
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              style={{ flex: 1, padding: '6px 8px', background: '#2c2c2e', border: '1px solid #3a3a40', borderRadius: '6px', color: '#fff', fontSize: '13px' }}
            />
          </div>
          <textarea
            value={about}
            onChange={(e) => setAbout(e.target.value.slice(0, isSelf ? SELF_BIO_MAX_LENGTH : undefined))}
            placeholder={isSelf ? 'Your bio…' : 'About this person…'}
            rows={3}
            maxLength={isSelf ? SELF_BIO_MAX_LENGTH : undefined}
            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '6px 8px', marginBottom: isSelf ? '2px' : '8px', background: '#2c2c2e', border: '1px solid #3a3a40', borderRadius: '6px', color: '#fff', fontSize: '13px' }}
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
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', marginBottom: '8px', background: '#2c2c2e', border: '1px solid #3a3a40', borderRadius: '6px', color: '#fff', fontSize: '13px' }}
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

      {node.profile && (
        <>
          <hr style={dividerStyle} />
          <p style={sectionHeaderStyle}>{node.source ? 'Their profile' : 'Self bio'}</p>
          <p style={{ margin: '0 0 8px', fontSize: '13px', color: node.profile.bio ? '#f0f0f0' : '#9a9a9a' }}>
            {node.profile.bio || 'No bio shared.'}
          </p>
          {node.profile.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {node.profile.tags.map((t) => (
                <TagChip key={t.id} tag={t} />
              ))}
            </div>
          )}
        </>
      )}

      {isSelf ? (
        <>
          <hr style={dividerStyle} />
          {/* Self-tags are your own public profile tags (`/api/users/me/tags`) — a separate
              side-channel from a contact's tags, so subjectId is "me", not this node's id. */}
          <TagsAndNotes subjectId="me" isCurrentUser />
        </>
      ) : !canEditFields ? (
        // Read-only card for a shared/received contact — never the owner's own editor. Every
        // field the share could have included gets its own section, consistently: shown or not
        // shared alike, each with a one-line "not shared" fallback (matching the About/Bio block
        // above, which already always renders with a "Nothing written yet." fallback) rather than
        // silently dropping some sections but not others.
        <>
          <hr style={dividerStyle} />
          <p style={sectionHeaderStyle}>Tags</p>
          {node.tags.length === 0 ? (
            <span style={{ color: '#8e8e93', fontSize: '12px' }}>No tags shared.</span>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {node.tags.map((t) => (
                <TagChip key={t.id} tag={t} />
              ))}
            </div>
          )}

          <hr style={dividerStyle} />
          <p style={sectionHeaderStyle}>Note</p>
          <p style={{ margin: 0, fontSize: '13px', color: node.note ? '#f0f0f0' : '#8e8e93', whiteSpace: 'pre-wrap' }}>
            {node.note || 'No note shared.'}
          </p>

          <hr style={dividerStyle} />
          <p style={sectionHeaderStyle}>Phone</p>
          <p style={{ margin: 0, fontSize: '13px', color: node.phoneNumber ? '#f0f0f0' : '#8e8e93' }}>
            {node.phoneNumber ? formatPhoneNumberDisplay(node.phoneNumber) : 'No phone shared.'}
          </p>
        </>
      ) : (
        <>
          <hr style={dividerStyle} />
          <TagsAndNotes
            subjectId={node.id}
            isCurrentUser={false}
            tags={node.tags}
            onTagsChange={onTagsChange}
            note={node.note}
            onNoteChange={onNoteChange}
            endpointBase="/api/contacts"
            onSaveNote={onSaveNote}
          />
        </>
      )}
    </div>
  );
};
