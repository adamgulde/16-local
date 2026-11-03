import { useState, type CSSProperties } from 'react';
import type { CreateContactPayload, ImportContactsResult } from '../services/contactService';
import type { GraphNode } from '../services/graphService';
import { contactSources } from '../services/deviceContacts';
import { ImportContactsPanel } from './ImportContactsPanel';
import { formatPhoneNumber } from '../utils/phoneUtils';
import { CloseIcon } from './Icons';
import { sectionHeaderStyle } from './cardStyles';

interface AddPersonFormProps {
  onSubmit: (payload: CreateContactPayload) => void;
  onClose: () => void;
  busy?: boolean;
  compact?: boolean;
  style?: CSSProperties;
  // Bulk import from the address book / a .vcf or .csv. Omit to hide the option.
  onImportContacts?: (entries: CreateContactPayload[], onProgress: (done: number) => void) => Promise<ImportContactsResult>;
  // The current graph, so the importer can mark who's already added.
  nodes?: GraphNode[];
}

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  marginBottom: '10px',
  background: '#2c2c2e',
  border: '1px solid #3a3a40',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '14px',
};

// "Add person" (PLAN.md §5 F3): creates a placeholder contact — no account required. Opened from
// a HUD button (desktop) or its mobile equivalent.
export const AddPersonForm = ({
  onSubmit,
  onClose,
  busy = false,
  compact = false,
  style,
  onImportContacts,
  nodes = [],
}: AddPersonFormProps) => {
  const [mode, setMode] = useState<'manual' | 'import'>('manual');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [about, setAbout] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = firstName.trim();
    if (!trimmed) {
      setError('First name is required.');
      return;
    }
    setError('');
    onSubmit({
      firstName: trimmed,
      lastName: lastName.trim() || undefined,
      about: about.trim() || undefined,
      phoneNumber: phoneNumber.trim() || undefined,
    });
  };

  return (
    <div style={{ padding: compact ? '12px' : '16px', background: '#1c1c1e', border: '1px solid #3a3a40', borderRadius: '8px', ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h2 style={{ margin: 0, fontSize: compact ? '16px' : '18px' }}>{mode === 'import' ? 'Import Contacts' : 'Add Person'}</h2>
        <button onClick={onClose} aria-label="Close" style={{ minWidth: 40, minHeight: 40, background: 'none', border: 'none', color: '#9a9a9a', cursor: 'pointer' }}>
          <CloseIcon size={18} />
        </button>
      </div>
      {mode === 'import' && onImportContacts ? (
        <ImportContactsPanel nodes={nodes} onImport={onImportContacts} onBack={() => setMode('manual')} onDone={onClose} />
      ) : (
      <>
      {onImportContacts && (
        <button
          type="button"
          onClick={() => setMode('import')}
          style={{
            width: '100%',
            minHeight: 44,
            padding: '10px',
            marginBottom: '12px',
            background: '#232a36',
            border: '1px solid #3d8bff',
            borderRadius: '6px',
            color: '#dce8ff',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          {contactSources().device ? 'Import from phone contacts' : 'Import contacts'}
        </button>
      )}
      <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#9a9a9a' }}>
        A private placeholder on your own graph — no account needed. You can link them to a real
        account later if a share request connects you.
      </p>
      <form onSubmit={handleSubmit}>
        <label style={{ ...sectionHeaderStyle, fontSize: '12px' }}>First name</label>
        <input autoFocus value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" style={inputStyle} />
        <label style={{ ...sectionHeaderStyle, fontSize: '12px' }}>Last name</label>
        <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name (optional)" style={inputStyle} />
        <label style={{ ...sectionHeaderStyle, fontSize: '12px' }}>About</label>
        <textarea
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          placeholder="How you know them (optional)"
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
        <label style={{ ...sectionHeaderStyle, fontSize: '12px' }}>Phone</label>
        <input
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
          placeholder="+1 ___-___-____ (optional)"
          style={inputStyle}
        />
        {error && <p style={{ color: '#ff6b6b', fontSize: '12px', margin: '0 0 8px' }}>{error}</p>}
        <button
          type="submit"
          disabled={busy}
          style={{
            width: '100%',
            padding: '10px',
            background: '#2a5f9e',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: busy ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            minHeight: 44,
          }}
        >
          {busy ? 'Adding…' : 'Add Person'}
        </button>
      </form>
      </>
      )}
    </div>
  );
};
