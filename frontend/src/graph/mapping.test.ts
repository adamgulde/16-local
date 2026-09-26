import { describe, expect, it } from 'vitest';
import type { Graph, GraphNode } from '../services/graphService';
import { applyShareModePreview, contactFullName, displayLabelFor, graphToForceGraphData } from './mapping';

const baseNode: Omit<GraphNode, 'id' | 'kind' | 'firstName' | 'lastName'> = {
  about: '',
  phoneNumber: null,
  tags: [],
  note: '',
  profile: null,
  linkedUserId: null,
  source: null,
  editable: true,
};

describe('graphToForceGraphData', () => {
  it('maps nodes and edges 1:1, carrying kind/editable/sharer metadata', () => {
    const graph: Graph = {
      nodes: [
        { ...baseNode, id: 'self', kind: 'SELF', firstName: 'You', lastName: '' },
        { ...baseNode, id: 'c1', kind: 'PLACEHOLDER', firstName: 'Dana', lastName: 'Price', phoneNumber: '+15551234567' },
        {
          ...baseNode,
          id: 'c2',
          kind: 'REGISTERED',
          firstName: 'Casey',
          lastName: 'Nguyen',
          editable: false,
          source: { shareId: 'share-1', sharerUserId: 'u-sam', sharerName: 'Sam Rivera' },
        },
      ],
      edges: [
        { source: 'self', target: 'c1', kind: 'DIRECT', shareId: null },
        { source: 'self', target: 'c2', kind: 'SHARED', shareId: 'share-1' },
      ],
    };

    const data = graphToForceGraphData(graph);

    expect(data.nodes).toHaveLength(3);
    expect(data.links).toHaveLength(2);

    const self = data.nodes.find((n) => n.id === 'self')!;
    expect(self.kind).toBe('SELF');
    expect(self.val).toBeGreaterThan(data.nodes.find((n) => n.id === 'c1')!.val);

    const c1 = data.nodes.find((n) => n.id === 'c1')!;
    expect(c1.name).toBe('Dana Price');
    expect(c1.phoneNumber).toBe('+15551234567');
    expect(c1.editable).toBe(true);
    expect(c1.sharerName).toBeNull();

    const c2 = data.nodes.find((n) => n.id === 'c2')!;
    expect(c2.editable).toBe(false);
    expect(c2.sharerName).toBe('Sam Rivera');
    expect(c2.name).toBe('Casey Nguyen (via Sam Rivera)');

    expect(data.links).toEqual([
      { source: 'self', target: 'c1', kind: 'DIRECT', shareId: null },
      { source: 'self', target: 'c2', kind: 'SHARED', shareId: 'share-1' },
    ]);
  });
});

describe('contactFullName', () => {
  it('trims a missing last name', () => {
    expect(contactFullName({ firstName: 'You', lastName: '' })).toBe('You');
  });
});

describe('applyShareModePreview', () => {
  const graph: Graph = {
    nodes: [
      { ...baseNode, id: 'self', kind: 'SELF', firstName: 'Blake', lastName: 'Rivera' },
      { ...baseNode, id: 'c1', kind: 'PLACEHOLDER', firstName: 'Jordan', lastName: 'Park' },
      { ...baseNode, id: 'c2', kind: 'REGISTERED', firstName: 'Casey', lastName: 'Moore', linkedUserId: 'u-casey' },
      { ...baseNode, id: 'c3', kind: 'REGISTERED', firstName: 'Avery', lastName: 'Stone', linkedUserId: 'u-avery' },
    ],
    edges: [
      { source: 'self', target: 'c1', kind: 'DIRECT', shareId: null },
      { source: 'self', target: 'c2', kind: 'DIRECT', shareId: null },
      { source: 'self', target: 'c3', kind: 'DIRECT', shareId: null },
    ],
  };
  const data = graphToForceGraphData(graph);
  // A layout would have already stamped x/y (and possibly fx/fy) directly onto these node
  // objects before a preview is ever computed — simulate that here.
  data.nodes.forEach((n, i) => {
    (n as unknown as { x: number; y: number }).x = i * 10;
    (n as unknown as { x: number; y: number }).y = i * 20;
  });

  it('never returns a new nodes/links structure — same node object identity and positions', () => {
    const before = data.nodes.map((n) => ({ ...n }));
    applyShareModePreview(data, new Set(['c1']), new Set(['c2']));
    // The function must not mutate or replace anything on `data` itself.
    expect(data.nodes).toEqual(before);
    data.nodes.forEach((n, i) => {
      expect((n as unknown as { x: number }).x).toBe(i * 10);
      expect((n as unknown as { y: number }).y).toBe(i * 20);
    });
  });

  it('returns exactly the hidden ∪ locked ids that exist among the nodes', () => {
    const preview = applyShareModePreview(data, new Set(['c1']), new Set(['c2', 'c3']));
    expect(preview).toEqual(new Set(['c1', 'c2', 'c3']));
  });

  it('drops hidden/locked ids that no longer correspond to a node', () => {
    const preview = applyShareModePreview(data, new Set(['c1', 'ghost']), new Set());
    expect(preview).toEqual(new Set(['c1']));
  });

  it('every link endpoint id still exists in the (unchanged) node set after computing a preview', () => {
    applyShareModePreview(data, new Set(['c1']), new Set(['c2']));
    const nodeIds = new Set(data.nodes.map((n) => n.id));
    data.links.forEach((l) => {
      expect(nodeIds.has(l.source)).toBe(true);
      expect(nodeIds.has(l.target)).toBe(true);
    });
  });
});

describe('displayLabelFor', () => {
  it('never adds a sharer suffix for a HIDDEN node', () => {
    const hidden: GraphNode = { ...baseNode, id: 'h1', kind: 'HIDDEN', firstName: 'Hidden', lastName: 'User', source: { shareId: 's', sharerUserId: 'u', sharerName: 'Sam' } };
    expect(displayLabelFor(hidden)).toBe('Hidden User');
  });

  it('adds "via {sharerName}" for a shared, non-hidden node', () => {
    const shared: GraphNode = { ...baseNode, id: 'c2', kind: 'PLACEHOLDER', firstName: 'Casey', lastName: 'Nguyen', source: { shareId: 's', sharerUserId: 'u', sharerName: 'Sam Rivera' } };
    expect(displayLabelFor(shared)).toBe('Casey Nguyen (via Sam Rivera)');
  });

  it('plain name for your own contact', () => {
    const mine: GraphNode = { ...baseNode, id: 'c1', kind: 'PLACEHOLDER', firstName: 'Dana', lastName: 'Price' };
    expect(displayLabelFor(mine)).toBe('Dana Price');
  });
});
