import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { fetchAllTags, type Tag } from '../../services/tagService';
import type { TagCriteria } from '../../services/userService';
import { CloseIcon } from '../Icons';
import { TagPicker, type TagPickerHandle } from './TagPicker';
import { CategoryIcon } from './CategoryIcon';
import { CHIP_METRICS, KIND_COLORS, chipBaseStyle, type TagDensity } from './tagTheme';

interface TagQueryFieldProps {
  criteria: TagCriteria;
  onChange: (criteria: TagCriteria) => void;
  matchCount: number | null;
  loading?: boolean;
  rows: number;
  density?: TagDensity;
  // 'dropdown' floats the picker under the nearest positioned ancestor (the search bar);
  // 'inline' renders it in flow and keeps it open (bottom sheets).
  layout: 'dropdown' | 'inline';
  placeholder: string;
  autoFocus?: boolean;
  inputStyle?: CSSProperties;
  dropdownStyle?: CSSProperties;
  // Rendered above the picker (e.g. the mode toggle on narrow screens).
  header?: ReactNode;
  // Rendered under the picker footer, e.g. the matching people.
  children?: ReactNode;
}

const tokenStyle = (density: TagDensity): CSSProperties => ({
  ...chipBaseStyle(density),
  background: KIND_COLORS.SELF.bg,
  border: `1px solid ${KIND_COLORS.SELF.border}`,
  color: KIND_COLORS.SELF.text,
  flexShrink: 0,
});

export interface TagQueryFieldHandle {
  // Closes the dropdown, e.g. once a person in the results has been picked.
  close: () => void;
}

// Tags-mode search input: chosen tags become removable tokens inside the field, and the picker
// suggests tags (not people) as you type. Results are combined with AND by default.
export const TagQueryField = forwardRef<TagQueryFieldHandle, TagQueryFieldProps>(
  (
    {
      criteria,
      onChange,
      matchCount,
      loading = false,
      rows,
      density = 'regular',
      layout,
      placeholder,
      autoFocus,
      inputStyle,
      dropdownStyle,
      header,
      children,
    },
    ref
  ) => {
    const [tags, setTags] = useState<Tag[]>([]);
    const [text, setText] = useState('');
    const [open, setOpen] = useState(layout === 'inline');
    const pickerRef = useRef<TagPickerHandle>(null);
    const m = CHIP_METRICS[density];

    useImperativeHandle(ref, () => ({
      close: () => {
        if (layout === 'dropdown') setOpen(false);
      },
    }));

    useEffect(() => {
      fetchAllTags().then(setTags).catch(() => {});
    }, []);

    const byId = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
    const selected = useMemo(() => new Set(criteria.tagIds), [criteria.tagIds]);
    const criteriaCount = criteria.tagIds.length + criteria.labels.length;

    const toggleTag = (tag: Tag) => {
      const tagIds = selected.has(tag.id) ? criteria.tagIds.filter((id) => id !== tag.id) : [...criteria.tagIds, tag.id];
      onChange({ ...criteria, tagIds });
      setText('');
    };
    const addLabel = (label: string) => {
      if (!criteria.labels.some((l) => l.toLowerCase() === label.toLowerCase())) {
        onChange({ ...criteria, labels: [...criteria.labels, label] });
      }
      setText('');
    };
    const removeLast = () => {
      if (criteria.labels.length) onChange({ ...criteria, labels: criteria.labels.slice(0, -1) });
      else if (criteria.tagIds.length) onChange({ ...criteria, tagIds: criteria.tagIds.slice(0, -1) });
    };

    const panel = (
      <div
        onMouseDown={(e) => {
          // Keep focus in the input so the panel doesn't close mid-click.
          if (layout === 'dropdown' && !(e.target instanceof HTMLInputElement)) e.preventDefault();
        }}
        style={
          layout === 'dropdown'
            ? {
                position: 'absolute',
                top: 'calc(100% + 8px)',
                left: 0,
                right: 0,
                zIndex: 30,
                padding: '10px',
                background: 'rgba(28, 28, 30, 0.97)',
                border: '1px solid #3a3a40',
                borderRadius: '10px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                ...dropdownStyle,
              }
            : { marginTop: '10px', ...dropdownStyle }
        }
      >
        {header && <div style={{ marginBottom: '8px' }}>{header}</div>}
        <TagPicker
          ref={pickerRef}
          tags={tags}
          query={text}
          appliedIds={selected}
          onPick={toggleTag}
          onText={addLabel}
          onClearQuery={() => setText('')}
          density={density}
          rows={rows}
        />
        {criteriaCount > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '8px',
              paddingTop: '8px',
              borderTop: '1px solid #2e2e34',
              fontSize: '11px',
              color: '#9a9a9a',
            }}
          >
            <span aria-live="polite" style={{ flex: 1 }}>
              {loading ? 'Searching…' : matchCount === null ? '' : `${matchCount} ${matchCount === 1 ? 'person matches' : 'people match'}`}
            </span>
            {criteriaCount > 1 && (
              <div role="radiogroup" aria-label="Match" style={{ display: 'inline-flex', border: '1px solid #3a3a40', borderRadius: '6px', overflow: 'hidden' }}>
                {[
                  { value: true, label: 'All tags' },
                  { value: false, label: 'Any tag' },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    role="radio"
                    aria-checked={criteria.matchAll === opt.value}
                    onClick={() => onChange({ ...criteria, matchAll: opt.value })}
                    style={{
                      border: 'none',
                      padding: '3px 8px',
                      fontSize: '11px',
                      background: criteria.matchAll === opt.value ? '#2a3f5f' : 'transparent',
                      color: criteria.matchAll === opt.value ? '#fff' : '#9a9aa2',
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => onChange({ ...criteria, tagIds: [], labels: [] })}
              style={{ background: 'none', border: 'none', color: '#ff8a8a', fontSize: '11px', cursor: 'pointer', padding: 0 }}
            >
              Clear
            </button>
          </div>
        )}
        {children}
      </div>
    );

    return (
      <>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px', flex: 1, minWidth: 0, ...inputStyle }}>
          {criteria.tagIds.map((id) => {
            const tag = byId.get(id);
            return (
              <span key={id} style={tokenStyle(density)} title={tag?.fullPath}>
                <CategoryIcon icon={tag?.icon} size={m.icon} color={KIND_COLORS.SELF.accent} />
                {tag?.label ?? '…'}
                <button
                  type="button"
                  aria-label={`Remove ${tag?.label ?? 'tag'}`}
                  onClick={() => onChange({ ...criteria, tagIds: criteria.tagIds.filter((t) => t !== id) })}
                  style={{ background: 'none', border: 'none', padding: 0, display: 'inline-flex', color: 'inherit', opacity: 0.7, cursor: 'pointer' }}
                >
                  <CloseIcon size={m.icon} />
                </button>
              </span>
            );
          })}
          {criteria.labels.map((label) => (
            <span key={label} style={{ ...tokenStyle(density), borderStyle: 'dashed' }} title="Any tag containing this text">
              “{label}”
              <button
                type="button"
                aria-label={`Remove ${label}`}
                onClick={() => onChange({ ...criteria, labels: criteria.labels.filter((l) => l !== label) })}
                style={{ background: 'none', border: 'none', padding: 0, display: 'inline-flex', color: 'inherit', opacity: 0.7, cursor: 'pointer' }}
              >
                <CloseIcon size={m.icon} />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={text}
            autoFocus={autoFocus}
            placeholder={criteriaCount ? '' : placeholder}
            aria-label="Search tags"
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => layout === 'dropdown' && setOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                pickerRef.current?.submitQuery();
              } else if (e.key === 'Backspace' && !text) {
                removeLast();
              } else if (e.key === 'Escape' && layout === 'dropdown') {
                setOpen(false);
              }
            }}
            style={{
              flex: 1,
              minWidth: '80px',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f0f0f0',
              fontSize: 'inherit',
              padding: 0,
            }}
          />
        </div>
        {open && panel}
      </>
    );
  }
);

TagQueryField.displayName = 'TagQueryField';
