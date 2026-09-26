import type { CSSProperties } from 'react';
import type { TagKind } from '../../services/tagService';

// Colour answers "whose tag is this?"; the icon answers "what kind of tag?". Keeping the two
// channels separate is what lets nine categories and three ownership kinds stay readable.
export const KIND_COLORS: Record<TagKind, { bg: string; border: string; text: string; accent: string; name: string }> = {
  SELF: { bg: 'rgba(61, 139, 255, 0.16)', border: 'rgba(61, 139, 255, 0.45)', text: '#d6e6ff', accent: '#6ab0ff', name: 'Self-assigned' },
  CUSTOM: { bg: 'rgba(45, 212, 191, 0.14)', border: 'rgba(45, 212, 191, 0.45)', text: '#ccfbf1', accent: '#2dd4bf', name: 'Custom' },
  PRIVATE: { bg: 'rgba(192, 132, 252, 0.15)', border: 'rgba(192, 132, 252, 0.5)', text: '#f3e8ff', accent: '#c084fc', name: 'Private' },
};

export type TagDensity = 'regular' | 'compact';

export const CHIP_METRICS: Record<TagDensity, { height: number; fontSize: number; padX: number; icon: number; gap: number }> = {
  regular: { height: 20, fontSize: 11, padX: 7, icon: 11, gap: 4 },
  compact: { height: 18, fontSize: 10.5, padX: 6, icon: 10, gap: 4 },
};

// Rows of chips visible before the "+N more" hint: enough to browse, never a wall of tags.
export const pickerRows = (density: TagDensity, isMobile: boolean): number =>
  density === 'compact' ? (isMobile ? 3 : 5) : isMobile ? 4 : 7;

export const chipBaseStyle = (density: TagDensity): CSSProperties => {
  const m = CHIP_METRICS[density];
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    height: `${m.height}px`,
    padding: `0 ${m.padX}px`,
    borderRadius: `${m.height / 2}px`,
    fontSize: `${m.fontSize}px`,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    maxWidth: '100%',
    boxSizing: 'border-box',
  };
};

export const kindChipStyle = (kind: TagKind, density: TagDensity): CSSProperties => ({
  ...chipBaseStyle(density),
  background: KIND_COLORS[kind].bg,
  border: `1px solid ${KIND_COLORS[kind].border}`,
  color: KIND_COLORS[kind].text,
});

// Unapplied options inside the picker: neutral, so applied tags (kind-coloured) stand out.
export const optionChipStyle = (density: TagDensity, active = false): CSSProperties => ({
  ...chipBaseStyle(density),
  background: active ? 'rgba(61, 139, 255, 0.2)' : '#232327',
  border: `1px solid ${active ? '#3d8bff' : '#34343a'}`,
  color: active ? '#ffffff' : '#d4d4d8',
  cursor: 'pointer',
});
