import { describe, expect, it } from 'vitest';
import type { Graph, GraphNode } from '../services/graphService';
import { findPathBFS, searchGraphNodes } from './graphSearch';

const base: Omit<GraphNode, 'id' | 'kind' | 'firstName' | 'lastName'> = {
  about: '',
  phoneNumber: null,
  tags: [],
  note: '',
  strength: 3 as const,
  knownPersonally: true,
  lastInteractedAt: null,
  editable: true,
};

// self - a - b - c   (chain)
//        \- d         (a also links to d)
// e is disconnected
const graph: Graph = {
  nodes: [
    { ...base, id: 'self', kind: 'SELF', firstName: 'You', lastName: '' },
    { ...base, id: 'a', kind: 'PLACEHOLDER', firstName: 'Ann', lastName: 'Apple', about: 'Loves jazz music', note: 'Met at work' },
    { ...base, id: 'b', kind: 'PLACEHOLDER', firstName: 'Bob', lastName: 'Baker' },
    { ...base, id: 'c', kind: 'PLACEHOLDER', firstName: 'Cara', lastName: 'Cole' },
    { ...base, id: 'd', kind: 'PLACEHOLDER', firstName: 'Dan', lastName: 'Dee' },
    { ...base, id: 'e', kind: 'PLACEHOLDER', firstName: 'Eve', lastName: 'Estes' },
  ],
  edges: [
    { source: 'self', target: 'a', kind: 'DIRECT' },
    { source: 'a', target: 'b', kind: 'LINK' },
    { source: 'b', target: 'c', kind: 'DIRECT' },
    { source: 'a', target: 'd', kind: 'DIRECT' },
  ],
};

describe('findPathBFS', () => {
  it('finds the shortest hop path across mixed edge kinds', () => {
    expect(findPathBFS(graph, 'self', 'c')).toEqual(['self', 'a', 'b', 'c']);
  });

  it('returns [] when there is no path', () => {
    expect(findPathBFS(graph, 'self', 'e')).toEqual([]);
  });

  it('returns [id] for the same node', () => {
    expect(findPathBFS(graph, 'a', 'a')).toEqual(['a']);
  });

  it('returns [] for an unknown id', () => {
    expect(findPathBFS(graph, 'self', 'nope')).toEqual([]);
  });
});

describe('searchGraphNodes', () => {
  it('names mode: case-insensitive substring over full name', () => {
    const hits = searchGraphNodes(graph, 'names', 'ann ap');
    expect(hits.map((n) => n.id)).toEqual(['a']);
  });

  it('about mode', () => {
    expect(searchGraphNodes(graph, 'about', 'jazz').map((n) => n.id)).toEqual(['a']);
  });

  it('notes mode', () => {
    expect(searchGraphNodes(graph, 'notes', 'met at').map((n) => n.id)).toEqual(['a']);
  });

  it('empty term yields no matches', () => {
    expect(searchGraphNodes(graph, 'names', '   ')).toEqual([]);
  });

  it('tags mode: matches people who carry the chosen tag', () => {
    const tagged: Graph = {
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === 'b' ? { ...n, tags: [{ id: 'jazz', label: 'Jazz' }] } : n)),
    };
    const hits = searchGraphNodes(tagged, 'tags', '', { tagIds: ['jazz'], matchAll: true });
    expect(hits.map((n) => n.id)).toEqual(['b']);
  });

  it('tags mode: "all of" needs every chosen tag, "any of" needs one', () => {
    const tagged: Graph = {
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.id === 'a' ? { ...n, tags: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }] }
        : n.id === 'b' ? { ...n, tags: [{ id: 'x', label: 'X' }] }
        : n
      ),
    };
    expect(searchGraphNodes(tagged, 'tags', '', { tagIds: ['x', 'y'], matchAll: true }).map((n) => n.id)).toEqual(['a']);
    expect(searchGraphNodes(tagged, 'tags', '', { tagIds: ['x', 'y'], matchAll: false }).map((n) => n.id).sort()).toEqual(['a', 'b']);
  });
});
