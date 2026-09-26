import { useState, type CSSProperties } from 'react';
import type { User } from '../services/userService';
import type { TagsUpdate } from '../services/tagService';
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
  isRequestPending?: boolean;
  isSendingRequest?: boolean;
  hasIncomingRequest?: boolean;
  onAcceptRequest?: () => void;
  isAcceptingRequest?: boolean;
  onFindPath?: () => void;
  showFindPath?: boolean;
  onDisconnect?: () => void;
  showDisconnect?: boolean;
  isDisconnecting?: boolean;
  onSelectNode: (nodeId: string) => void;
  isCurrentUser: boolean;
  onBioUpdated?: (newBio: string) => void;
  // From views that load everyone's tags with the directory and keep user.tags current.
  onTagsChange?: (update: TagsUpdate) => void;
  // From views that preload notes with the directory.
  onNoteChange?: (note: string) => void;
  compact?: boolean;
  style?: CSSProperties;
}

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

// Profile card: Name, Phone, and Primary Actions (Find Path, Connect/Disconnect) are placed
// prominently at the top so they are never hidden or pushed offscreen by long connection lists.
export const UserCard = ({
  user,
  relationshipNames,
  onClose,
  onSendRequest,
  showSendRequest,
  isRequestPending,
  isSendingRequest,
  hasIncomingRequest,
  onAcceptRequest,
  isAcceptingRequest,
  onFindPath,
  showFindPath,
  onDisconnect,
  showDisconnect,
  isDisconnecting,
  onSelectNode,
  isCurrentUser,
  onBioUpdated,
  onTagsChange,
  onNoteChange,
  compact = false,
  style,
}: UserCardProps) => {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    if (!user.inviteCode) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const inviteLink = `${origin}/register?invite=${encodeURIComponent(user.inviteCode)}`;
    const shareText = `Find the ConnectionsBetween.US with my invite code: ${user.inviteCode}\n${inviteLink}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'ConnectionsBetween.US',
          text: `Find the ConnectionsBetween.US with my invite code: ${user.inviteCode}`,
          url: inviteLink,
        });
        return;
      } catch {
        // Fallback to clipboard if share dialog dismissed
      }
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className="user-card"
      style={{
        padding: compact ? '12px' : '16px',
        background: '#1c1c1e',
        border: '1px solid #3a3a40',
        borderRadius: '8px',
        ...style,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: compact ? '18px' : '22px' }}>
            {fullName(user)}
            {isCurrentUser && ' (you)'}
          </h2>
          {user.phoneNumber && <p style={{ margin: '4px 0 0', color: '#9a9a9a', fontSize: '12px' }}>{formatPhoneNumberDisplay(user.phoneNumber)}</p>}
          {isCurrentUser && user.inviteCode && (
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', background: '#2c2c2e', padding: '4px 8px', borderRadius: '6px', border: '1px solid #3a3a40' }}>
              <span style={{ fontSize: '11px', color: '#9a9a9a' }}>Invite:</span>
              <code style={{ fontSize: '12px', color: '#6ab0ff', fontWeight: 'bold', letterSpacing: '1px' }}>{user.inviteCode}</code>
              <button
                type="button"
                onClick={handleShare}
                style={{ fontSize: '11px', padding: '2px 8px', background: copied ? '#2e7d32' : '#3d8bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 500 }}
              >
                {copied ? 'Copied!' : 'Share'}
              </button>
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ minWidth: 40, minHeight: 40, background: 'none', border: 'none', color: '#9a9a9a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <CloseIcon size={18} />
        </button>
      </div>

      {/* Primary Actions placed prominently at the top */}
      {(showSendRequest || showFindPath || showDisconnect) && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '12px' }}>
          {showFindPath && (
            <button onClick={onFindPath} style={primaryButtonStyle}>
              Find Path
            </button>
          )}
          {showSendRequest && (
            hasIncomingRequest ? (
              <button
                type="button"
                onClick={isAcceptingRequest ? undefined : onAcceptRequest}
                disabled={isAcceptingRequest}
                style={{
                  ...primaryButtonStyle,
                  background: isAcceptingRequest ? '#2c2c2e' : '#2e7d32',
                  borderColor: isAcceptingRequest ? '#3a3a40' : '#4caf50',
                  color: isAcceptingRequest ? '#9a9a9a' : '#fff',
                  cursor: isAcceptingRequest ? 'not-allowed' : 'pointer',
                }}
              >
                {isAcceptingRequest ? 'Accepting...' : 'Accept Request'}
              </button>
            ) : (
              <button
                type="button"
                onClick={isRequestPending || isSendingRequest ? undefined : onSendRequest}
                disabled={isRequestPending || isSendingRequest}
                style={{
                  ...primaryButtonStyle,
                  background: isRequestPending || isSendingRequest ? '#2c2c2e' : '#1e3a5f',
                  borderColor: isRequestPending || isSendingRequest ? '#3a3a40' : '#2b5278',
                  color: isRequestPending || isSendingRequest ? '#9a9a9a' : '#fff',
                  cursor: isRequestPending || isSendingRequest ? 'not-allowed' : 'pointer',
                }}
              >
                {isSendingRequest ? 'Sending Request...' : isRequestPending ? 'Request Sent' : 'Send Connection Request'}
              </button>
            )
          )}
          {showDisconnect && (
            <button
              onClick={isDisconnecting ? undefined : onDisconnect}
              disabled={isDisconnecting}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(211, 47, 47, 0.15)',
                border: '1px solid #d32f2f',
                color: '#ff6b6b',
                borderRadius: '8px',
                padding: '8px 16px',
                minHeight: 44,
                fontSize: '13px',
                cursor: isDisconnecting ? 'not-allowed' : 'pointer',
                fontWeight: 500,
                touchAction: 'manipulation',
              }}
            >
              {isDisconnecting ? 'Disconnecting...' : (<><DisconnectIcon size={16} /> Disconnect</>)}
            </button>
          )}
        </div>
      )}

      <hr style={dividerStyle} />

      <BioSection subjectId={user.id} bio={user.bio} isCurrentUser={isCurrentUser} onBioUpdated={onBioUpdated} />

      <hr style={dividerStyle} />

      <TagsAndNotes
        subjectId={user.id}
        isCurrentUser={isCurrentUser}
        tags={user.tags}
        onTagsChange={onTagsChange}
        note={user.note}
        onNoteChange={onNoteChange}
      />

      <hr style={dividerStyle} />

      <p style={sectionHeaderStyle}>Connections ({user.relationships.length})</p>
      <div style={{ maxHeight: compact ? '120px' : '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        {user.relationships.map((relId, index) => (
          <button
            key={relId}
            onClick={() => onSelectNode(relId)}
            style={{ background: 'none', border: 'none', color: '#6ab0ff', cursor: 'pointer', textDecoration: 'underline', padding: compact ? '4px 0' : '6px 0', minHeight: compact ? 30 : 36, textAlign: 'left', fontSize: compact ? '13px' : '14px' }}
          >
            {relationshipNames[index]}
          </button>
        ))}
        {user.relationships.length === 0 && <span style={{ color: '#9a9a9a' }}>None yet</span>}
      </div>
    </div>
  );
};
