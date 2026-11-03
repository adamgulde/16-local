import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_COLOR, SELF_COLOR, UNKNOWN_COLOR, colorForNode, linkColorFor, type GLink } from './rendering';

const link = (kind: 'DIRECT' | 'LINK'): GLink => ({ kind, source: 'a', target: 'b' }) as unknown as GLink;
const none = { highlightLinks: new Set<string>(), activePath: null };

describe('node colour', () => {
  it('dims people you do not know personally, and keeps the others and you as before', () => {
    expect(colorForNode({ kind: 'SELF', direct: true })).toBe(SELF_COLOR);
    expect(colorForNode({ kind: 'PLACEHOLDER', direct: true })).toBe(PLACEHOLDER_COLOR);
    expect(colorForNode({ kind: 'PLACEHOLDER', direct: false })).toBe(UNKNOWN_COLOR);
  });
});

describe('link visibility', () => {
  it('hides direct links to you unless they are highlighted', () => {
    expect(linkColorFor(link('DIRECT'), none)).toBe('rgba(0, 0, 0, 0)');
    expect(linkColorFor(link('DIRECT'), { ...none, highlightLinks: new Set(['a-b']) })).toBe('red');
  });

  it('still draws links between two contacts', () => {
    expect(linkColorFor(link('LINK'), none)).toMatch(/^rgba\(200, 210, 220/);
  });
});
