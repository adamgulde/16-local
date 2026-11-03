import { describe, expect, it } from 'vitest';
import type { Graph } from '../services/graphService';
import { graphToForceGraphData, contactFullName } from './mapping';
import { linkDistanceFor, type GLink } from './rendering';

const graph: Graph = {
  nodes: [
    { id: 'self', kind: 'SELF', firstName: 'Me', lastName: '', about: '', phoneNumber: null, tags: [], note: '', strength: 5, knownPersonally: true, lastInteractedAt: null, editable: true },
    { id: 'a', kind: 'PLACEHOLDER', firstName: 'Ann', lastName: 'Apple', about: '', phoneNumber: '+1 555-000-0001', tags: [], note: '', strength: 4, knownPersonally: true, lastInteractedAt: null, editable: true },
  ],
  edges: [
    { source: 'self', target: 'a', kind: 'DIRECT' },
    { source: 'a', target: 'a', kind: 'LINK' },
  ],
};

describe('graphToForceGraphData', () => {
  it('maps every node and edge, carrying kind, name, strength and phone', () => {
    const data = graphToForceGraphData(graph);
    expect(data.nodes.map((n) => [n.id, n.kind, n.name, n.strength])).toEqual([
      ['self', 'SELF', 'Me', 5],
      ['a', 'PLACEHOLDER', 'Ann Apple', 4],
    ]);
    expect(data.nodes[1].phoneNumber).toBe('+1 555-000-0001');
    expect(data.links).toEqual([
      { source: 'self', target: 'a', kind: 'DIRECT' },
      { source: 'a', target: 'a', kind: 'LINK' },
    ]);
  });
});

describe('contactFullName', () => {
  it('trims the outer whitespace and joins names, skipping an empty last name', () => {
    expect(contactFullName({ firstName: 'Ann', lastName: '' })).toBe('Ann');
    expect(contactFullName({ firstName: ' Ann ', lastName: 'Apple ' })).toBe('Ann  Apple');
  });
});

describe('linkDistanceFor', () => {
  const direct = (strength: number): GLink =>
    ({ kind: 'DIRECT', source: { id: 'self' }, target: { id: 'a', strength } } as unknown as GLink);

  it('places stronger contacts closer to you', () => {
    expect(linkDistanceFor(direct(10))).toBeLessThan(linkDistanceFor(direct(5.5)));
    expect(linkDistanceFor(direct(5.5))).toBeLessThan(linkDistanceFor(direct(1)));
  });

  it('falls back to a medium distance when the target is not resolved yet', () => {
    const unresolved = { kind: 'DIRECT', source: 'self', target: 'a' } as unknown as GLink;
    expect(linkDistanceFor(unresolved)).toBe(linkDistanceFor(direct(5.5)));
  });

  it('uses a fixed distance for links between two contacts', () => {
    const link = { kind: 'LINK', source: { id: 'a', strength: 5 }, target: { id: 'b', strength: 1 } } as unknown as GLink;
    expect(linkDistanceFor(link)).toBe(45);
  });
});

describe('graphToForceGraphData keeps positions', () => {
  it('copies the last known position onto people who are still in the graph', () => {
    const before = graphToForceGraphData(graph);
    (before.nodes[1] as { x?: number; y?: number }).x = 42;
    (before.nodes[1] as { x?: number; y?: number }).y = -7;
    const after = graphToForceGraphData(graph, before);
    expect(after.nodes[1]).toMatchObject({ id: 'a', x: 42, y: -7 });
    expect(after.nodes[1]).not.toBe(before.nodes[1]);
  });

  it('leaves new people without a position so the layout places them', () => {
    const before = graphToForceGraphData({ nodes: [graph.nodes[0]], edges: [] });
    const after = graphToForceGraphData(graph, before);
    expect((after.nodes[1] as { x?: number }).x).toBeUndefined();
  });
});
