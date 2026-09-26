import type { SearchMode } from '../../services/userService';

const MODES: { value: SearchMode; label: string }[] = [
  { value: 'names', label: 'Names' },
  { value: 'tags', label: 'Tags' },
  { value: 'bios', label: 'Bios' },
  { value: 'notes', label: 'Notes' },
];

interface SearchModeToggleProps {
  mode: SearchMode;
  onChange: (mode: SearchMode) => void;
  size?: 'sm' | 'md';
}

// A segmented radio group: exactly one field is searched at a time.
export const SearchModeToggle = ({ mode, onChange, size = 'sm' }: SearchModeToggleProps) => {
  const md = size === 'md';
  return (
    <div
      role="radiogroup"
      aria-label="Search in"
      style={{
        display: 'inline-flex',
        flexShrink: 0,
        padding: '2px',
        gap: '2px',
        borderRadius: '8px',
        background: '#18181b',
        border: '1px solid #2e2e34',
      }}
    >
      {MODES.map((m) => {
        const active = m.value === mode;
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(m.value)}
            style={{
              border: 'none',
              borderRadius: '6px',
              padding: md ? '7px 12px' : '3px 8px',
              minHeight: md ? 34 : undefined,
              flex: md ? 1 : undefined,
              fontSize: md ? '13px' : '11px',
              fontWeight: active ? 600 : 500,
              background: active ? '#2a3f5f' : 'transparent',
              color: active ? '#ffffff' : '#9a9aa2',
              cursor: 'pointer',
            }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
};
