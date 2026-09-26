import { useState, type CSSProperties } from 'react';
import type { SelfProfile, Share, SharesResponse } from '../services/shareService';

interface SharingSettingsPanelProps {
  shares: SharesResponse;
  selfProfile: SelfProfile | null;
  onEditShare: (share: Share) => void;
  onOpenOtherGraph: (share: Share) => void;
  onRemoveOtherGraph: (shareId: string) => void;
  onUpdatePrivacy: (value: boolean) => void;
  isBusy: (key: string) => boolean;
}

const smallButtonStyle: CSSProperties = {
  padding: '5px 10px',
  minHeight: 32,
  borderRadius: '6px',
  border: '1px solid #3a3a40',
  background: '#232326',
  color: '#c0c0c6',
  fontSize: '12px',
  cursor: 'pointer',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 0',
  borderBottom: '1px solid #2c2c2e',
};

// F5 entry point ("Edit what {viewer} sees"), F6 ("Other's graphs"), and F7 (privacy toggle +
// invite code) all live in Settings, per the brief.
export const SharingSettingsPanel = ({
  shares,
  selfProfile,
  onEditShare,
  onOpenOtherGraph,
  onRemoveOtherGraph,
  onUpdatePrivacy,
  isBusy,
}: SharingSettingsPanelProps) => {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    if (!selfProfile?.inviteCode) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const inviteLink = `${origin}/register?invite=${encodeURIComponent(selfProfile.inviteCode)}`;
    const shareText = `Join my private network with my invite code: ${selfProfile.inviteCode}\n${inviteLink}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Invite', text: shareText, url: inviteLink });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div>
      <p style={{ margin: '0 0 6px', fontSize: '12px', fontWeight: 'bold', color: '#c0c0c6' }}>Shared by me</p>
      {shares.sharedByMe.length === 0 && <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#8e8e93' }}>You aren't sharing your graph with anyone.</p>}
      {shares.sharedByMe.map((s) => (
        <div key={s.id} style={rowStyle}>
          <span style={{ fontSize: '13px' }}>{s.viewerName}</span>
          <button type="button" onClick={() => onEditShare(s)} style={smallButtonStyle}>
            Edit what {s.viewerName} sees
          </button>
        </div>
      ))}

      <p style={{ margin: '14px 0 6px', fontSize: '12px', fontWeight: 'bold', color: '#c0c0c6' }}>Shared with me (other's graphs)</p>
      {shares.sharedWithMe.length === 0 && <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#8e8e93' }}>No one has shared their graph with you yet.</p>}
      {shares.sharedWithMe.map((s) => (
        <div key={s.id} style={rowStyle}>
          <span style={{ fontSize: '13px' }}>{s.sharerName}</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="button" onClick={() => onOpenOtherGraph(s)} style={smallButtonStyle}>
              View
            </button>
            <button
              type="button"
              disabled={isBusy(`remove-share-${s.id}`)}
              onClick={() => onRemoveOtherGraph(s.id)}
              style={{ ...smallButtonStyle, borderColor: '#d32f2f', color: '#ff6b6b' }}
            >
              Remove
            </button>
          </div>
        </div>
      ))}

      <hr style={{ margin: '14px 0', border: 'none', borderTop: '1px solid #2c2c2e' }} />

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px', marginBottom: '10px' }}>
        <input
          type="checkbox"
          checked={selfProfile?.discoverableInSharedGraphs ?? false}
          disabled={isBusy('update-privacy')}
          onChange={(e) => onUpdatePrivacy(e.target.checked)}
          style={{ marginTop: '2px' }}
        />
        <span>
          Show me when my connections share their graph.
          <br />
          <span style={{ color: '#8e8e93' }}>Off (default): you appear as "Hidden User" in graphs your connections share with others.</span>
        </span>
      </label>

      {selfProfile?.inviteCode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#2c2c2e', padding: '6px 8px', borderRadius: '6px', border: '1px solid #3a3a40' }}>
          <span style={{ fontSize: '11px', color: '#9a9a9a' }}>Invite:</span>
          <code style={{ fontSize: '12px', color: '#6ab0ff', fontWeight: 'bold', letterSpacing: '1px', flex: 1 }}>{selfProfile.inviteCode}</code>
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
  );
};
