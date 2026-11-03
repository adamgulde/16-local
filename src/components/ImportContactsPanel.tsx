import { useMemo, useRef, useState, type CSSProperties } from 'react';
import type { GraphNode } from '../services/graphService';
import type { CreateContactPayload, ImportContactsResult } from '../services/contactService';
import {
  ContactsPermissionDeniedError,
  contactSources,
  pickBrowserContacts,
  readDeviceContacts,
} from '../services/deviceContacts';
import {
  candidateDisplayName,
  findExistingCandidates,
  parseContactsFile,
  toCandidates,
  type ImportCandidate,
  type ImportSourceContact,
} from '../utils/contactImport';
import { getSafeErrorMessage } from '../utils/errors';

interface ImportContactsPanelProps {
  // The user's current graph — used to mark who's already added (the server skips them anyway).
  nodes: GraphNode[];
  onImport: (entries: CreateContactPayload[], onProgress: (done: number) => void) => Promise<ImportContactsResult>;
  onBack: () => void;
  onDone: () => void;
}

const buttonStyle: CSSProperties = {
  width: '100%',
  minHeight: 44,
  padding: '10px',
  background: '#2c2c2e',
  border: '1px solid #3a3a40',
  borderRadius: '8px',
  color: '#f0f0f0',
  fontSize: '14px',
  cursor: 'pointer',
  marginBottom: '8px',
};

const primaryStyle: CSSProperties = { ...buttonStyle, background: '#2a5f9e', border: 'none', fontWeight: 'bold', color: '#fff' };

const linkButtonStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#6aa8ff',
  fontSize: '13px',
  cursor: 'pointer',
  padding: '6px 4px',
  minHeight: 32,
};

type Phase = 'source' | 'loading' | 'review' | 'importing' | 'done';

/**
 * "Import contacts": read the address book (native app), the browser Contact Picker (Chrome on
 * Android), or a .vcf/.csv export, then let the user tick who to add. Every imported person is a
 * private placeholder — importing never links or notifies anyone, and nothing unticked leaves the
 * device.
 */
export const ImportContactsPanel = ({ nodes, onImport, onBack, onDone }: ImportContactsPanelProps) => {
  const sources = useMemo(() => contactSources(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('source');
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportContactsResult | null>(null);

  const existing = useMemo(() => findExistingCandidates(candidates, nodes), [candidates, nodes]);
  const selectable = useMemo(() => candidates.filter((c) => !existing.has(c.key)), [candidates, existing]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    const qDigits = q.replace(/\D/g, '');
    return candidates.filter(
      (c) =>
        candidateDisplayName(c).toLowerCase().includes(q) ||
        (qDigits.length >= 3 && (c.phoneNumber ?? '').replace(/\D/g, '').includes(qDigits))
    );
  }, [candidates, query]);

  const load = async (read: () => Promise<ImportSourceContact[]>, keyPrefix: string, preselect: boolean) => {
    setError(null);
    setPhase('loading');
    try {
      const found = toCandidates(await read(), keyPrefix);
      if (found.length === 0) {
        setError('No contacts with a name were found.');
        setPhase('source');
        return;
      }
      setCandidates(found);
      const already = findExistingCandidates(found, nodes);
      // The browser picker is already a selection the user made, so keep it ticked; a full
      // address book starts with nobody ticked.
      setSelected(preselect ? new Set(found.filter((c) => !already.has(c.key)).map((c) => c.key)) : new Set());
      setQuery('');
      setPhase('review');
    } catch (err) {
      setError(
        err instanceof ContactsPermissionDeniedError
          ? 'Contacts access was denied. Allow it in your phone’s Settings to import, or upload a .vcf file instead.'
          : 'Could not read contacts.'
      );
      setPhase('source');
    }
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError('That file is too large (20 MB max).');
      return;
    }
    void load(async () => parseContactsFile(file.name, await file.text()), 'file', false);
  };

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const visibleSelectable = visible.filter((c) => !existing.has(c.key));
  const allVisibleSelected = visibleSelectable.length > 0 && visibleSelectable.every((c) => selected.has(c.key));
  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of visibleSelectable) {
        if (allVisibleSelected) next.delete(c.key);
        else next.add(c.key);
      }
      return next;
    });

  const handleImport = async () => {
    const chosen = selectable.filter((c) => selected.has(c.key));
    if (chosen.length === 0) return;
    setError(null);
    setProgress(0);
    setPhase('importing');
    try {
      const res = await onImport(
        chosen.map((c) => ({
          firstName: c.firstName,
          lastName: c.lastName || undefined,
          phoneNumber: c.phoneNumber || undefined,
          about: c.about || undefined,
        })),
        setProgress
      );
      setResult(res);
      setPhase('done');
    } catch (err) {
      setError(getSafeErrorMessage(err, 'Import failed. Some people may already have been added.'));
      setPhase('review');
    }
  };

  const errorLine = error && <p style={{ color: '#ff6b6b', fontSize: '13px', margin: '0 0 10px' }}>{error}</p>;

  if (phase === 'source' || phase === 'loading') {
    const loading = phase === 'loading';
    return (
      <div>
        <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#9a9a9a' }}>
          Pick people from your contacts to add as private placeholders. Only the people you choose are
          uploaded — nobody is notified or linked.
        </p>
        {errorLine}
        {sources.device && (
          <button style={primaryStyle} disabled={loading} onClick={() => void load(readDeviceContacts, 'device', false)}>
            {loading ? 'Reading contacts…' : 'Import from phone contacts'}
          </button>
        )}
        {sources.picker && (
          <button style={primaryStyle} disabled={loading} onClick={() => void load(pickBrowserContacts, 'picker', true)}>
            Choose from phone contacts
          </button>
        )}
        <button style={sources.device || sources.picker ? buttonStyle : primaryStyle} disabled={loading} onClick={() => fileInputRef.current?.click()}>
          {loading && !sources.device ? 'Reading file…' : 'Upload a contacts file (.vcf or .csv)'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".vcf,.vcard,.csv,text/vcard,text/x-vcard,text/csv"
          style={{ display: 'none' }}
          aria-label="Contacts file"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <p style={{ margin: '4px 0 12px', fontSize: '12px', color: '#7a7a80' }}>
          Export a .vcf from iPhone/Android Contacts or Google Contacts, or a .csv from Google or Outlook.
        </p>
        <button style={linkButtonStyle} onClick={onBack}>
          ← Add one person manually
        </button>
      </div>
    );
  }

  if (phase === 'done' && result) {
    return (
      <div>
        <p style={{ fontSize: '15px', margin: '0 0 6px', color: '#f0f0f0' }}>
          Added {result.created.length} {result.created.length === 1 ? 'person' : 'people'} to your graph.
        </p>
        {(result.skippedDuplicates > 0 || result.skippedInvalid > 0) && (
          <p style={{ fontSize: '13px', margin: '0 0 12px', color: '#9a9a9a' }}>
            {result.skippedDuplicates > 0 && `${result.skippedDuplicates} already there. `}
            {result.skippedInvalid > 0 && `${result.skippedInvalid} skipped (no name).`}
          </p>
        )}
        <button style={primaryStyle} onClick={onDone}>
          Done
        </button>
      </div>
    );
  }

  const importing = phase === 'importing';
  const selectedCount = selectable.filter((c) => selected.has(c.key)).length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${candidates.length} contacts`}
        aria-label="Search contacts"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '8px 10px',
          marginBottom: '6px',
          background: '#2c2c2e',
          border: '1px solid #3a3a40',
          borderRadius: '6px',
          color: '#fff',
          fontSize: '16px',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <button style={linkButtonStyle} onClick={toggleAllVisible} disabled={importing || visibleSelectable.length === 0}>
          {allVisibleSelected ? 'Deselect all' : `Select all${query ? ' matches' : ''}`}
        </button>
        <span style={{ fontSize: '12px', color: '#9a9a9a' }}>
          {selectedCount} selected{existing.size > 0 ? ` · ${existing.size} already added` : ''}
        </span>
      </div>
      <ul
        style={{ listStyle: 'none', margin: '0 0 10px', padding: 0, overflowY: 'auto', maxHeight: '42dvh', border: '1px solid #2c2c30', borderRadius: '8px' }}
      >
        {visible.map((c) => {
          const already = existing.has(c.key);
          return (
            <li key={c.key} style={{ borderBottom: '1px solid #232326' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 10px',
                  minHeight: 44,
                  boxSizing: 'border-box',
                  cursor: already ? 'default' : 'pointer',
                  opacity: already ? 0.5 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={already || selected.has(c.key)}
                  disabled={already || importing}
                  onChange={() => toggle(c.key)}
                  style={{ width: 18, height: 18, flexShrink: 0 }}
                />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: '14px', color: '#f0f0f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {candidateDisplayName(c)}
                  </span>
                  <span style={{ display: 'block', fontSize: '12px', color: '#8e8e93', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {already ? 'Already in your graph' : [c.phoneNumber, c.about].filter(Boolean).join(' · ') || 'No phone number'}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
        {visible.length === 0 && <li style={{ padding: '12px', fontSize: '13px', color: '#8e8e93' }}>No matches.</li>}
      </ul>
      {errorLine}
      <button style={{ ...primaryStyle, opacity: selectedCount === 0 ? 0.5 : 1 }} disabled={importing || selectedCount === 0} onClick={() => void handleImport()}>
        {importing ? `Importing… ${progress}/${selectedCount}` : `Import ${selectedCount} ${selectedCount === 1 ? 'person' : 'people'}`}
      </button>
      <button style={linkButtonStyle} disabled={importing} onClick={() => setPhase('source')}>
        ← Choose a different source
      </button>
    </div>
  );
};
