import type { CSSProperties } from 'react';
import type { ShareModeState } from '../graph/useGraphController';
import type { UpdateSharePayload } from '../services/shareService';

interface ShareModePanelProps {
  shareMode: ShareModeState;
  onToggleFlag: (key: keyof UpdateSharePayload, value: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
  onRevoke: () => void;
  isBusy: (key: string) => boolean;
  style?: CSSProperties;
}

const FLAGS: { key: keyof UpdateSharePayload; label: string }[] = [
  { key: 'shareAbout', label: 'About' },
  { key: 'shareTags', label: 'Tags' },
  { key: 'shareNotes', label: 'Notes' },
  { key: 'sharePhone', label: 'Phone' },
];

// F5: the floating panel that stays open while a share is in "edit visibility" mode — tapping any
// of your own contacts on the graph toggles it shared <-> hidden (see toggleShareModeContact /
// applyShareModePreview); this panel only handles the per-field flags and Save/Cancel/Revoke.
export const ShareModePanel = ({ shareMode, onToggleFlag, onSave, onCancel, onRevoke, isBusy, style }: ShareModePanelProps) => {
  const saving = isBusy('save-share-mode');
  const revoking = isBusy(`revoke-share-${shareMode.shareId}`);
  return (
    <div style={{ padding: '14px', ...style }}>
      <p style={{ margin: '0 0 4px', fontWeight: 'bold', fontSize: '14px' }}>Editing what {shareMode.viewerName} sees</p>
      <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#9a9a9a' }}>
        Tap a contact on the graph to hide or show it. Locked contacts (grey, can't be tapped) are
        registered people who haven't opted in to appear in shared graphs.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
        {FLAGS.map(({ key, label }) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <input
              type="checkbox"
              checked={Boolean(shareMode.flags[key])}
              onChange={(e) => onToggleFlag(key, e.target.checked)}
            />
            Share {label.toLowerCase()} of visible contacts
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          style={{ padding: '8px 16px', minHeight: 40, background: '#2a5f9e', border: '1px solid #3d8bff', borderRadius: '6px', color: '#fff', fontWeight: 'bold', fontSize: '13px', cursor: saving ? 'not-allowed' : 'pointer' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{ padding: '8px 16px', minHeight: 40, background: '#232326', border: '1px solid #3a3a40', borderRadius: '6px', color: '#c0c0c6', fontSize: '13px', cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={revoking}
          onClick={() => {
            if (window.confirm(`Stop sharing your graph with ${shareMode.viewerName}?`)) onRevoke();
          }}
          style={{ marginLeft: 'auto', padding: '8px 16px', minHeight: 40, background: 'rgba(211, 47, 47, 0.15)', border: '1px solid #d32f2f', borderRadius: '6px', color: '#ff6b6b', fontSize: '13px', cursor: revoking ? 'not-allowed' : 'pointer' }}
        >
          Revoke share
        </button>
      </div>
    </div>
  );
};
