import { describe, expect, it } from 'vitest';
import { closenessLabel, formatCloseness, parseCloseness } from './closeness';

describe('closeness labels', () => {
  it('keeps the five original estimates at their rescaled points', () => {
    expect(closenessLabel(1)).toBe('Distant');
    expect(closenessLabel(3.25)).toBe('Acquaintance');
    expect(closenessLabel(5.5)).toBe('Friend');
    expect(closenessLabel(7.75)).toBe('Close');
    expect(closenessLabel(10)).toBe('Inner circle');
  });

  it('gives every value in 1–10 the nearest estimate', () => {
    expect(closenessLabel(2)).toBe('Distant');
    expect(closenessLabel(4)).toBe('Acquaintance');
    expect(closenessLabel(4.6)).toBe('Friend');
    expect(closenessLabel(9.9)).toBe('Inner circle');
  });
});

describe('closeness text', () => {
  it('shows whole numbers without decimals and trims trailing zeros', () => {
    expect(formatCloseness(7)).toBe('7');
    expect(formatCloseness(7.5)).toBe('7.5');
    expect(formatCloseness(7.25)).toBe('7.25');
  });

  it('parses decimals in range and rejects everything else', () => {
    expect(parseCloseness(' 6.75 ')).toBe(6.75);
    expect(parseCloseness('10')).toBe(10);
    expect(parseCloseness('')).toBeNull();
    expect(parseCloseness('0.5')).toBeNull();
    expect(parseCloseness('11')).toBeNull();
    expect(parseCloseness('abc')).toBeNull();
  });
});
