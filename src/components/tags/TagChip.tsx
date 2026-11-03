import type { CSSProperties } from 'react';
import type { Tag } from '../../services/tagService';

interface TagChipProps {
  tag: Tag;
  onRemove?: () => void;
  disabled?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

const base: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  maxWidth: '100%',
  padding: '3px 8px',
  borderRadius: 999,
  fontSize: 12,
  lineHeight: 1.4,
  border: '1px solid #3d8bff',
  background: 'rgba(61, 139, 255, 0.15)',
  color: '#cfe3ff',
};

/** A tag shown on a person or in a list. Pass onRemove to show the × button. */
export const TagChip = ({ tag, onRemove, disabled = false, selected = false, onClick }: TagChipProps) => (
  <span
    style={{ ...base, ...(selected ? { background: '#3d8bff', color: '#fff' } : {}) }}
    onClick={onClick}
    role={onClick ? 'button' : undefined}
  >
    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tag.label}</span>
    {onRemove && (
      <button
        type="button"
        aria-label={`Remove ${tag.label}`}
        disabled={disabled}
        onClick={onRemove}
        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0 0 0 2px', fontSize: 14, lineHeight: 1 }}
      >
        ×
      </button>
    )}
  </span>
);
