import type { Tag } from '../services/tagService';

export interface TagIndex {
  byId: Map<string, Tag>;
  categories: Tag[];
  childrenOf: (id: string) => Tag[];
  // Ids of a node and everything beneath it.
  subtreeOf: (id: string) => Set<string>;
}

// The API returns the tree depth-first and ordered, so insertion order is display order.
export const buildTagIndex = (tags: Tag[]): TagIndex => {
  const byId = new Map(tags.map((t) => [t.id, t]));
  const children = new Map<string | null, Tag[]>();
  tags.forEach((t) => {
    const list = children.get(t.parentId) ?? [];
    list.push(t);
    children.set(t.parentId, list);
  });
  const childrenOf = (id: string) => children.get(id) ?? [];
  const subtreeOf = (id: string) => {
    const result = new Set<string>();
    const stack = [id];
    while (stack.length) {
      const next = stack.pop()!;
      if (result.has(next)) continue;
      result.add(next);
      childrenOf(next).forEach((c) => stack.push(c.id));
    }
    return result;
  };
  return { byId, categories: children.get(null) ?? [], childrenOf, subtreeOf };
};

// Ranked typeahead: label prefix, then word prefix, then substring, then path-only matches.
export const searchTags = (
  index: TagIndex,
  query: string,
  { withinId, include = () => true }: { withinId?: string | null; include?: (tag: Tag) => boolean }
): Tag[] => {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scope = withinId ? index.subtreeOf(withinId) : null;
  const scored: { tag: Tag; score: number }[] = [];
  index.byId.forEach((tag) => {
    if (!tag.selectable || (scope && !scope.has(tag.id)) || !include(tag)) return;
    const label = tag.label.toLowerCase();
    let score: number;
    if (label.startsWith(q)) score = 0;
    else if (label.split(/[\s/&-]+/).some((w) => w.startsWith(q))) score = 1;
    else if (label.includes(q)) score = 2;
    else if (tag.fullPath.toLowerCase().includes(q)) score = 3;
    else return;
    scored.push({ tag, score });
  });
  return scored
    .sort((a, b) => a.score - b.score || a.tag.level - b.tag.level || a.tag.label.localeCompare(b.tag.label))
    .map((s) => s.tag);
};

// "Jazz" is unambiguous, "Music" is not (interest vs. major) — show the parent when labels collide.
export const disambiguator = (tag: Tag, visible: Tag[], index: TagIndex): string | null => {
  const clash = visible.some((t) => t.id !== tag.id && t.label.toLowerCase() === tag.label.toLowerCase());
  if (!clash || !tag.parentId) return null;
  return index.byId.get(tag.parentId)?.label ?? null;
};
