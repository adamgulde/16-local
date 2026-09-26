import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { TagAssignment } from '../../services/tagService';
import { CloseIcon, LockIcon } from '../Icons';
import { CategoryIcon } from './CategoryIcon';
import { CHIP_METRICS, KIND_COLORS, kindChipStyle, type TagDensity } from './tagTheme';

interface TagChipProps {
  tag: TagAssignment;
  density?: TagDensity;
  onRemove?: () => void;
  removing?: boolean;
}

// An applied tag. The full path lives in the tooltip so the chip itself stays one short label.
export const TagChip = ({ tag, density = 'regular', onRemove, removing }: TagChipProps) => {
  const colors = KIND_COLORS[tag.kind];
  const m = CHIP_METRICS[density];
  return (
    <span style={{ ...kindChipStyle(tag.kind, density), opacity: removing ? 0.5 : 1 }} title={`${tag.fullPath} · ${colors.name}`}>
      {tag.kind === 'PRIVATE' ? (
        <LockIcon size={m.icon} color={colors.accent} aria-label="Private" />
      ) : (
        <CategoryIcon icon={tag.icon} size={m.icon} color={colors.accent} />
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{tag.label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          aria-label={`Remove ${tag.label}`}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            marginRight: '-2px',
            display: 'inline-flex',
            color: colors.text,
            opacity: 0.7,
            cursor: removing ? 'not-allowed' : 'pointer',
          }}
        >
          <CloseIcon size={m.icon} />
        </button>
      )}
    </span>
  );
};

interface ChipGridProps {
  rows: number;
  density: TagDensity;
  children: ReactNode;
  // Re-measure when the rendered set changes.
  measureKey: string;
  moreHint?: string;
}

// Wraps chips left-to-right inside its parent's width and caps them at `rows` lines, reporting
// how many were cut off instead of scrolling — the picker never grows into a wall of tags.
export const ChipGrid = ({ rows, density, children, measureKey, moreHint = 'type to narrow' }: ChipGridProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(0);
  const m = CHIP_METRICS[density];
  const maxHeight = rows * m.height + (rows - 1) * m.gap;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const top = el.getBoundingClientRect().top;
      let count = 0;
      Array.from(el.children).forEach((child) => {
        if (child.getBoundingClientRect().top - top >= maxHeight) count += 1;
      });
      setHidden(count);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measureKey, maxHeight]);

  return (
    <>
      <div ref={ref} style={{ display: 'flex', flexWrap: 'wrap', gap: `${m.gap}px`, maxHeight, overflow: 'hidden' }}>
        {children}
      </div>
      {hidden > 0 && (
        <div style={{ fontSize: '10.5px', color: '#8e8e93', marginTop: '4px' }}>
          +{hidden} more — {moreHint}
        </div>
      )}
    </>
  );
};
