import { STRENGTH_MAX, STRENGTH_MIN, isStrength } from '../data/types';

// The original five estimates (Distant … Inner circle), rescaled onto 1–10. The old values were
// 1, 2, 3, 4, 5 on an even spread, so they map to 1, 3.25, 5.5, 7.75, 10.
export const CLOSENESS_ANCHORS: readonly { value: number; label: string }[] = [
  { value: 1, label: 'Distant' },
  { value: 3.25, label: 'Acquaintance' },
  { value: 5.5, label: 'Friend' },
  { value: 7.75, label: 'Close' },
  { value: 10, label: 'Inner circle' },
];

/** The label of the nearest estimate, so every value in 1–10 has one. */
export const closenessLabel = (value: number): string => {
  let best = CLOSENESS_ANCHORS[0];
  for (const a of CLOSENESS_ANCHORS) {
    if (Math.abs(a.value - value) < Math.abs(best.value - value)) best = a;
  }
  return best.label;
};

/** Whole numbers show without decimals; other values show up to two decimal places. */
export const formatCloseness = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');

/** Parses typed input. Returns null for blank, non-numeric, or out-of-range text. */
export const parseCloseness = (text: string): number | null => {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return isStrength(n) ? n : null;
};

export { STRENGTH_MAX, STRENGTH_MIN };
