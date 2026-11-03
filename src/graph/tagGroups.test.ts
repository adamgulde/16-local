import { describe, expect, it } from 'vitest';
import { tagGroupForce } from './rendering';
import { tagKeyFor } from './mapping';

type N = { id: string; tagKey: string; x?: number; y?: number; vx?: number; vy?: number };

const runOnce = (nodes: N[]) => {
  const force = tagGroupForce();
  force.initialize(nodes);
  force(1);
};

describe('tagKeyFor', () => {
  it('is the same for the same tags in any order, and different for different sets', () => {
    expect(tagKeyFor([{ id: 'a' }, { id: 'b' }])).toBe(tagKeyFor([{ id: 'b' }, { id: 'a' }]));
    expect(tagKeyFor([{ id: 'a' }])).not.toBe(tagKeyFor([{ id: 'a' }, { id: 'b' }]));
    expect(tagKeyFor([])).toBe('');
  });
});

describe('tagGroupForce', () => {
  it('pulls people with identical tags toward each other', () => {
    const nodes: N[] = [
      { id: 'a', tagKey: 'x', x: -100, y: 0, vx: 0, vy: 0 },
      { id: 'b', tagKey: 'x', x: 100, y: 0, vx: 0, vy: 0 },
    ];
    runOnce(nodes);
    expect(nodes[0].vx).toBeGreaterThan(0); // a moves right, toward b
    expect(nodes[1].vx).toBeLessThan(0); // b moves left, toward a
  });

  it('leaves people with different tag sets, and untagged people, alone', () => {
    const nodes: N[] = [
      { id: 'a', tagKey: 'x', x: -100, y: 0, vx: 0, vy: 0 },
      { id: 'b', tagKey: 'y', x: 100, y: 0, vx: 0, vy: 0 },
      { id: 'c', tagKey: '', x: 0, y: 50, vx: 0, vy: 0 },
    ];
    runOnce(nodes);
    expect(nodes.map((n) => n.vx)).toEqual([0, 0, 0]);
    expect(nodes[2].vy).toBe(0);
  });
});
