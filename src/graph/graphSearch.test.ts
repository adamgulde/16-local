import { describe, expect, it } from 'vitest';
import type { Graph, GraphNode } from '../services/graphService';
import { buildTagIndex } from '../utils/tagTree';
import type { Tag } from '../services/tagService';
import { findPathBFS, searchGraphNodes } from './graphSearch';

const base: Omit<GraphNode, 'id' | 'kind' | 'firstName' | 'lastName'> = {
  about: '',
  phoneNumber: null,
  tags: [],
  note: '',
  profile: null,
  linkedUserId: null,
  source: null,
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
    { source: 'self', target: 'a', kind: 'DIRECT', shareId: null },
    { source: 'a', target: 'b', kind: 'LINK', shareId: null },
    { source: 'b', target: 'c', kind: 'DIRECT', shareId: null },
    { source: 'a', target: 'd', kind: 'DIRECT', shareId: null },
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

  it('tags mode: matches a tag inside the selected subtree', () => {
    const dictionary: Tag[] = [
      { id: 'music', category: 'Interests', label: 'Music', parentId: null, level: 1, icon: null, displayOrder: 0, fullPath: 'Interests', hasChildren: true, selectable: false, selfOnly: false },
      { id: 'jazz', category: 'Interests', label: 'Jazz', parentId: 'music', level: 2, icon: null, displayOrder: 0, fullPath: 'Interests › Jazz', hasChildren: false, selectable: true, selfOnly: false },
    ];
    const index = buildTagIndex(dictionary);
    const tagged: Graph = {
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.id === 'b'
          ? { ...n, tags: [{ id: 'assign-1', category: 'Interests', label: 'Jazz', isSelfTag: false, isMine: true, kind: 'CUSTOM' as const, tagId: 'jazz', parentId: 'music', level: 2, icon: null, fullPath: 'Interests › Jazz' }] }
          : n
      ),
    };

    const hits = searchGraphNodes(tagged, 'tags', '', { tagIds: ['music'], labels: [], matchAll: true }, index);
    expect(hits.map((n) => n.id)).toEqual(['b']);
  });
});
