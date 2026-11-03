import type { Graph, GraphNode } from '../services/graphService';
import { contactFullName } from './mapping';

export type GraphSearchMode = 'names' | 'tags' | 'about' | 'notes';

/** Tag filter for tags-mode search: the chosen tags, matched with "all of" or "any of". */
export interface TagCriteria {
  tagIds: string[];
  matchAll: boolean;
}

// The "nothing picked yet" tags-mode criteria — shared by the tag picker and the graph controller.
export const EMPTY_TAG_CRITERIA: TagCriteria = { tagIds: [], matchAll: true };

export const GRAPH_SEARCH_MODES: { value: GraphSearchMode; label: string }[] = [
  { value: 'names', label: 'Names' },
  { value: 'tags', label: 'Tags' },
  { value: 'about', label: 'About' },
  { value: 'notes', label: 'Notes' },
];

export const GRAPH_SEARCH_PLACEHOLDERS: Record<GraphSearchMode, string> = {
  names: 'Search your contacts by name…',
  tags: 'Type a tag or pick a category…',
  about: 'Search what you wrote about them…',
  notes: 'Search your private notes…',
};

// Undirected adjacency over every edge kind (DIRECT, LINK) — client-side find-path and
// neighbor highlighting both traverse the graph exactly as drawn, regardless of edge kind.
export const buildAdjacency = (graph: Graph): Map<string, Set<string>> => {
  const adjacency = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a)!.add(b);
  };
  graph.edges.forEach((e) => {
    add(e.source, e.target);
    add(e.target, e.source);
  });
  return adjacency;
};

// Shortest path between two nodes, breadth-first over the loaded graph only (no network call —
// see PLAN.md §3: "Search and find-path become client-side over the loaded Graph"). Returns []
// when there is no path (including when either id isn't in the graph).
export const findPathBFS = (graph: Graph, fromId: string, toId: string): string[] => {
  if (fromId === toId) return graph.nodes.some((n) => n.id === fromId) ? [fromId] : [];
  const adjacency = buildAdjacency(graph);
  if (!adjacency.has(fromId) || !adjacency.has(toId)) return [];

  const visited = new Set<string>([fromId]);
  const parent = new Map<string, string>();
  const queue: string[] = [fromId];
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    if (cur === toId) break;
    for (const next of adjacency.get(cur) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      parent.set(next, cur);
      queue.push(next);
    }
  }
  if (!visited.has(toId)) return [];

  const path: string[] = [toId];
  let cur = toId;
  while (cur !== fromId) {
    const prev = parent.get(cur);
    if (!prev) return [];
    path.push(prev);
    cur = prev;
  }
  return path.reverse();
};

// Names/about/notes: a plain case-insensitive substring match, capped so a huge graph never
// floods the suggestion dropdown. Tags: a person matches when they carry the chosen tags.
export const searchGraphNodes = (graph: Graph, mode: GraphSearchMode, term: string, tagCriteria?: TagCriteria): GraphNode[] => {
  if (mode === 'tags') {
    if (!tagCriteria || tagCriteria.tagIds.length === 0) return [];
    const wanted = tagCriteria.tagIds;
    return graph.nodes.filter((n) => {
      const have = new Set(n.tags.map((t) => t.id));
      return tagCriteria.matchAll ? wanted.every((id) => have.has(id)) : wanted.some((id) => have.has(id));
    });
  }

  const q = term.trim().toLowerCase();
  if (!q) return [];
  const field = (n: GraphNode): string => {
    switch (mode) {
      case 'about':
        return n.about;
      case 'notes':
        return n.note;
      case 'names':
      default:
        return contactFullName(n);
    }
  };
  return graph.nodes.filter((n) => field(n).toLowerCase().includes(q));
};
