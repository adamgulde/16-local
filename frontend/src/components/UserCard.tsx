import { useState, type CSSProperties } from 'react';
import type { User } from '../services/userService';
import { fullName } from '../services/userService';
import { BioSection } from './BioSection';
import { TagsAndNotes } from './TagsAndNotes';
import { dividerStyle, sectionHeaderStyle } from './cardStyles';
import { CloseIcon, DisconnectIcon } from './Icons';
import { formatPhoneNumberDisplay } from '../utils/phoneUtils';

interface UserCardProps {
  user: User;
  relationshipNames: string[];
  onClose: () => void;
  onSendRequest?: () => void;
  showSendRequest?: boolean;
  onFindPath?: () => void;
  showFindPath?: boolean;
  onDisconnect?: () => void;
  showDisconnect?: boolean;
  onSelectNode: (nodeId: string) => void;
  isCurrentUser: boolean;
}

const primaryButtonStyle: CSSProperties = {
  background: '#2a5f9e',
  border: '1px solid #3d8bff',
  color: 'white',
  fontWeight: 'bold',
};

// Name, then Bio, then your own tags/notes on this person, then the — potentially long — public
// connections list (capped with its own scroll so it can never push everything above it out of
// view), with the primary action last: by the time you'd click Send Request/Find Path, you've
// already seen everything about this person that would inform whether to.
export const UserCard = ({
  user,
  relationshipNames,
  onClose,
  onSendRequest,
  showSendRequest,
  onFindPath,
  showFindPath,
  onDisconnect,
  showDisconnect,
  onSelectNode,
  isCurrentUser,
}: UserCardProps) => {
  const [copied, setCopied] = useState(false);

  return (
    <div className="user-card" style={{ padding: '16px', background: '#1c1c1e', border: '1px solid #3a3a40', borderRadius: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0 }}>
            {fullName(user)}
            {isCurrentUser && ' (you)'}
          </h2>
          {user.phoneNumber && <p style={{ margin: '4px 0 0', color: '#9a9a9a', fontSize: '13px' }}>{formatPhoneNumberDisplay(user.phoneNumber)}</p>}
          {isCurrentUser && user.inviteCode && (
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', background: '#2c2c2e', padding: '4px 8px', borderRadius: '6px', border: '1px solid #3a3a40' }}>
              <span style={{ fontSize: '11px', color: '#9a9a9a' }}>Invite:</span>
              <code style={{ fontSize: '12px', color: '#6ab0ff', fontWeight: 'bold', letterSpacing: '1px' }}>{user.inviteCode}</code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(user.inviteCode!);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                style={{ fontSize: '11px', padding: '2px 6px', background: copied ? '#2e7d32' : '#3a3a40', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ minWidth: 32, minHeight: 32, background: 'none', border: 'none', color: '#9a9a9a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <CloseIcon size={18} />
        </button>
      </div>

      <hr style={dividerStyle} />

      <BioSection subjectId={user.id} bio={user.bio} isCurrentUser={isCurrentUser} />

      <hr style={dividerStyle} />

      <TagsAndNotes subjectId={user.id} isCurrentUser={isCurrentUser} />

      <hr style={dividerStyle} />

      <p style={sectionHeaderStyle}>Connections ({user.relationships.length})</p>
      <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        {user.relationships.map((relId, index) => (
          <button
            key={relId}
            onClick={() => onSelectNode(relId)}
            style={{ background: 'none', border: 'none', color: '#6ab0ff', cursor: 'pointer', textDecoration: 'underline', padding: '2px 0', textAlign: 'left' }}
          >
            {relationshipNames[index]}
          </button>
        ))}
        {user.relationships.length === 0 && <span style={{ color: '#9a9a9a' }}>None yet</span>}
      </div>

      {(showSendRequest || showFindPath || showDisconnect) && (
        <>
          <hr style={dividerStyle} />
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {showSendRequest && (
              <button onClick={onSendRequest} style={primaryButtonStyle}>
                Send Connection Request
              </button>
            )}
            {showFindPath && (
              <button onClick={onFindPath} style={primaryButtonStyle}>
                Find Path
              </button>
            )}
            {showDisconnect && (
              <button
                onClick={onDisconnect}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(211, 47, 47, 0.15)',
                  border: '1px solid #d32f2f',
                  color: '#ff6b6b',
                  borderRadius: '4px',
                  padding: '6px 12px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                <DisconnectIcon size={16} /> Disconnect
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};
