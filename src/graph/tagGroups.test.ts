import { describe, expect, it } from 'vitest';
import { convexHull, tagGroupForce } from './rendering';
import { GROUP_TAG_LIMIT, tagGroupsOf } from './mapping';
import type { Graph, GraphNode } from '../services/graphService';

const person = (id: string, tagIds: string[]): GraphNode => ({
  id,
  kind: 'PLACEHOLDER',
  firstName: id,
  lastName: '',
  about: '',
  phoneNumber: null,
  tags: tagIds.map((t) => ({ id: t, label: t.toUpperCase() })),
  note: '',
  strength: 5.5,
  knownPersonally: true,
  lastInteractedAt: null,
  editable: true,
});
const self: GraphNode = { ...person('self', []), kind: 'SELF' };
const graphOf = (...people: GraphNode[]): Graph => ({ nodes: [self, ...people], edges: [] });

describe('tagGroupsOf', () => {
  it('makes a group for any tag at least two people share, and not for single people', () => {
    const { groups, effective } = tagGroupsOf(graphOf(person('a', ['jazz']), person('b', ['jazz', 'chess']), person('c', ['chess'])));
    expect(groups.map((g) => g.id).sort()).toEqual(['chess', 'jazz']);
    expect(effective.get('a')).toEqual(['jazz']);
  });

  it('keeps only the most common tags when a person has more than the limit', () => {
    // "big" is on everyone, "mid" on three people, "rare" on two, "solo" on one.
    const people = [
      person('a', ['big', 'mid', 'rare', 'solo']),
      person('b', ['big', 'mid', 'rare']),
      person('c', ['big', 'mid']),
      person('d', ['big']),
    ];
    expect(GROUP_TAG_LIMIT).toBe(3);
    const { effective, groups } = tagGroupsOf(graphOf(...people));
    expect(effective.get('a')).toEqual(['big', 'mid', 'rare']); // "solo" is dropped
    expect(groups.map((g) => g.id)).not.toContain('solo');
    expect(groups.map((g) => g.id).sort()).toEqual(['big', 'mid', 'rare']);
  });
});

describe('tagGroupForce', () => {
  it('pulls people who share a tag toward each other', () => {
    const nodes = [
      { id: 'a', tagIds: ['x'], x: -100, y: 0, vx: 0, vy: 0 },
      { id: 'b', tagIds: ['x'], x: 100, y: 0, vx: 0, vy: 0 },
    ];
    const force = tagGroupForce();
    force.initialize(nodes);
    force(1);
    expect(nodes[0].vx).toBeGreaterThan(0);
    expect(nodes[1].vx).toBeLessThan(0);
  });

  it('leaves people with no shared tag alone', () => {
    const nodes = [
      { id: 'a', tagIds: ['x'], x: -100, y: 0, vx: 0, vy: 0 },
      { id: 'b', tagIds: ['y'], x: 100, y: 0, vx: 0, vy: 0 },
      { id: 'c', tagIds: [], x: 0, y: 50, vx: 0, vy: 0 },
    ];
    const force = tagGroupForce();
    force.initialize(nodes);
    force(1);
    expect(nodes.map((n) => n.vx)).toEqual([0, 0, 0]);
  });
});

describe('convexHull', () => {
  it('returns only the outside corners', () => {
    const hull = convexHull([[0, 0], [10, 0], [10, 10], [0, 10], [5, 5]]);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual([5, 5]);
  });

  it('handles two points', () => {
    expect(convexHull([[0, 0], [3, 4]])).toHaveLength(2);
  });
});

describe('group separation', () => {
  const grouped = (id: string, tagIds: string[], x: number, y: number) => ({ id, tagIds, x, y, vx: 0, vy: 0 });

  it('pushes two groups with nobody in common apart when their areas overlap', () => {
    // A is centred at 0, B at 15 to the right: close enough that their areas overlap.
    const nodes = [
      grouped('a1', ['A'], -10, 0),
      grouped('a2', ['A'], 10, 0),
      grouped('b1', ['B'], 5, -10),
      grouped('b2', ['B'], 25, 10),
    ];
    const force = tagGroupForce();
    force.initialize(nodes);
    force(1);
    // Pulls cancel within each group, so the net sideways velocity is the push: A moves left, B right.
    const sumA = nodes.slice(0, 2).reduce((s, n) => s + n.vx, 0);
    const sumB = nodes.slice(2).reduce((s, n) => s + n.vx, 0);
    expect(sumA).toBeLessThan(0);
    expect(sumB).toBeGreaterThan(0);
  });

  it('leaves two groups alone when they share a person', () => {
    const shared = grouped('s', ['A', 'B'], 0, 0);
    const nodes = [grouped('a1', ['A'], -10, 0), shared, grouped('b1', ['B'], 10, 0)];
    const force = tagGroupForce();
    force.initialize(nodes);
    force(1);
    // The only forces are the pulls toward each group's centre, which don't push groups apart.
    expect(nodes[0].vx).toBeGreaterThan(0);
    expect(nodes[2].vx).toBeLessThan(0);
  });
});
