import { useState, type CSSProperties } from 'react';
import type { GraphNode } from '../services/graphService';
import type { SendShareRequestPayload, ShareRequest, ShareRequestsResponse } from '../services/shareService';
import { contactFullName } from '../graph/mapping';
import { formatRelativeTime } from '../services/userService';

interface ShareRequestsPanelProps {
  shareRequests: ShareRequestsResponse;
  // Your own PLACEHOLDER contacts — offered as "this is my placeholder for them" when sending.
  placeholders: GraphNode[];
  onSend: (payload: SendShareRequestPayload) => void;
  onRespond: (id: string, payload: { connect: boolean; allowView: boolean }) => void;
  onCancel: (id: string) => void;
  isBusy: (key: string) => boolean;
}

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  marginBottom: '8px',
  background: '#2c2c2e',
  border: '1px solid #3a3a40',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '13px',
};

const rowStyle: CSSProperties = {
  padding: '8px 0',
  borderBottom: '1px solid #2c2c2e',
};

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

// F4: send a share request (phone or invite code, optional placeholder pick), then the incoming
// and outgoing lists. Replaces the old connection-request UI (PLAN.md §5 F4).
export const ShareRequestsPanel = ({ shareRequests, placeholders, onSend, onRespond, onCancel, isBusy }: ShareRequestsPanelProps) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [placeholderContactId, setPlaceholderContactId] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, { connect: boolean; allowView: boolean }>>({});

  const checksFor = (id: string) => checks[id] ?? { connect: false, allowView: false };
  const setCheck = (id: string, key: 'connect' | 'allowView', value: boolean) =>
    setChecks((prev) => ({ ...prev, [id]: { ...checksFor(id), [key]: value } }));

  const handleSend = () => {
    const phone = phoneNumber.trim();
    const code = inviteCode.trim();
    if (!phone && !code) {
      setError('Enter a phone number or invite code.');
      return;
    }
    setError(null);
    onSend({
      phoneNumber: phone || undefined,
      inviteCode: code || undefined,
      placeholderContactId: placeholderContactId || undefined,
    });
    setPhoneNumber('');
    setInviteCode('');
    setPlaceholderContactId('');
    setSent(true);
  };

  const incoming = shareRequests.incoming.filter((r) => r.status === 'PENDING');
  const outgoing = shareRequests.outgoing;

  return (
    <div>
      <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 'bold', color: '#c0c0c6' }}>Send a share request</p>
      <input
        value={phoneNumber}
        onChange={(e) => setPhoneNumber(e.target.value)}
        placeholder="Phone number"
        style={inputStyle}
      />
      <input
        value={inviteCode}
        onChange={(e) => setInviteCode(e.target.value)}
        placeholder="…or invite code"
        style={inputStyle}
      />
      {placeholders.length > 0 && (
        <select
          value={placeholderContactId}
          onChange={(e) => setPlaceholderContactId(e.target.value)}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          <option value="">This person isn't already one of my contacts</option>
          {placeholders.map((p) => (
            <option key={p.id} value={p.id}>
              This is my placeholder for {contactFullName(p)}
            </option>
          ))}
        </select>
      )}
      {error && <p style={{ color: '#ff6b6b', fontSize: '12px', margin: '0 0 8px' }}>{error}</p>}
      <button
        type="button"
        onClick={handleSend}
        disabled={isBusy('send-share-request')}
        style={{
          width: '100%',
          padding: '8px',
          minHeight: 40,
          background: '#2a5f9e',
          border: '1px solid #3d8bff',
          borderRadius: '6px',
          color: '#fff',
          fontWeight: 'bold',
          fontSize: '13px',
          cursor: isBusy('send-share-request') ? 'not-allowed' : 'pointer',
        }}
      >
        Send request
      </button>
      {/* Neutral confirmation, always the same regardless of whether it matched an account —
          no enumeration (PLAN.md §1.7 / S2). */}
      {sent && (
        <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#6ab0ff' }}>
          If they're on the app, they'll get your request. Otherwise, send them your invite link.
        </p>
      )}

      <hr style={{ margin: '14px 0', border: 'none', borderTop: '1px solid #2c2c2e' }} />

      <p style={{ margin: '0 0 6px', fontSize: '12px', fontWeight: 'bold', color: '#c0c0c6' }}>Incoming ({incoming.length})</p>
      {incoming.length === 0 && <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#8e8e93' }}>No pending requests.</p>}
      {incoming.map((r: ShareRequest) => {
        const check = checksFor(r.id);
        return (
          <div key={r.id} style={rowStyle}>
            <p style={{ margin: '0 0 4px', fontSize: '13px' }}>{r.counterpartName ?? 'Someone'}</p>
            <p style={{ margin: '0 0 6px', fontSize: '11px', color: '#8e8e93' }}>{formatRelativeTime(r.createdAt)}</p>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', marginBottom: '4px' }}>
              <input type="checkbox" checked={check.connect} onChange={(e) => setCheck(r.id, 'connect', e.target.checked)} />
              Connect with them
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', marginBottom: '8px' }}>
              <input type="checkbox" checked={check.allowView} onChange={(e) => setCheck(r.id, 'allowView', e.target.checked)} />
              Let them view my graph
            </label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                disabled={isBusy(`respond-${r.id}`) || (!check.connect && !check.allowView)}
                onClick={() => onRespond(r.id, check)}
                style={{ ...smallButtonStyle, background: '#1e3a5f', borderColor: '#2b5278', color: '#fff' }}
              >
                Accept
              </button>
              <button
                type="button"
                disabled={isBusy(`respond-${r.id}`)}
                onClick={() => onRespond(r.id, { connect: false, allowView: false })}
                style={smallButtonStyle}
              >
                Decline
              </button>
            </div>
          </div>
        );
      })}

      <p style={{ margin: '14px 0 6px', fontSize: '12px', fontWeight: 'bold', color: '#c0c0c6' }}>Outgoing ({outgoing.length})</p>
      {outgoing.length === 0 && <p style={{ margin: 0, fontSize: '12px', color: '#8e8e93' }}>No pending requests.</p>}
      {outgoing.map((r) => (
        <div key={r.id} style={{ ...rowStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ margin: 0, fontSize: '13px' }}>{r.counterpartName ?? 'Pending…'}</p>
            <p style={{ margin: 0, fontSize: '11px', color: '#8e8e93' }}>{r.status}</p>
            {/* The sender's own placeholder they offered — safe to show while still PENDING,
                it's their own data, not anything about the recipient (PLAN.md §3 amendment). */}
            {r.placeholderName && (
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#6ab0ff' }}>You attached: {r.placeholderName}</p>
            )}
          </div>
          {r.status === 'PENDING' && (
            <button type="button" disabled={isBusy(`cancel-request-${r.id}`)} onClick={() => onCancel(r.id)} style={smallButtonStyle}>
              Cancel
            </button>
          )}
        </div>
      ))}
    </div>
  );
};
