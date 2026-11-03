// Port of TagTaxonomy.Snapshot: in-memory tree over the tags table, answering path, ancestry,
// subtree and single-select questions without querying per tag.

export interface TagRow {
  id: string;
  category: string;
  label: string;
  parent_id: string | null;
  level: number;
  icon: string | null;
  display_order: number;
  self_only: number;
  single_select: number;
}

export interface TagNode {
  id: string;
  label: string;
  parentId: string | null;
  level: number;
  icon: string | null;
  displayOrder: number;
  singleSelect: boolean;
}

export const PATH_SEPARATOR = ' › ';
/** Category shown for a custom tag with no dictionary anchor (matches the server). */
export const UNCATEGORIZED = 'Custom';

export class Taxonomy {
  private readonly byId = new Map<string, TagNode>();
  private readonly children = new Map<string | null, TagNode[]>();
  readonly ordered: TagNode[] = [];

  constructor(rows: TagRow[]) {
    for (const r of rows) {
      const node: TagNode = {
        id: r.id,
        label: r.label,
        parentId: r.parent_id,
        level: r.level,
        icon: r.icon,
        displayOrder: r.display_order,
        singleSelect: r.single_select === 1,
      };
      this.byId.set(node.id, node);
    }
    const order = (a: TagNode, b: TagNode) => a.displayOrder - b.displayOrder || a.label.localeCompare(b.label);
    for (const n of this.byId.values()) {
      const list = this.children.get(n.parentId) ?? [];
      list.push(n);
      this.children.set(n.parentId, list);
    }
    for (const list of this.children.values()) list.sort(order);
    // Depth-first: each category followed by its subtree.
    const walk = (parent: string | null) => {
      for (const n of this.children.get(parent) ?? []) {
        this.ordered.push(n);
        walk(n.id);
      }
    };
    walk(null);
  }

  get(id: string | null | undefined): TagNode | undefined {
    return id == null ? undefined : this.byId.get(id);
  }

  hasChildren(id: string): boolean {
    return (this.children.get(id)?.length ?? 0) > 0;
  }

  childrenOf(id: string): TagNode[] {
    return this.children.get(id) ?? [];
  }

  /** Self first, then each ancestor up to the category. */
  lineage(id: string): TagNode[] {
    const out: TagNode[] = [];
    let n = this.get(id);
    while (n) {
      out.push(n);
      n = n.parentId ? this.get(n.parentId) : undefined;
    }
    return out;
  }

  root(id: string): TagNode | undefined {
    const l = this.lineage(id);
    return l[l.length - 1];
  }

  path(id: string): string {
    return this.lineage(id)
      .reverse()
      .map((n) => n.label)
      .join(PATH_SEPARATOR);
  }

  /** Categories (level 1) and single-select group headers are not tags themselves. */
  isSelectable(node: TagNode): boolean {
    return node.level > 1 && !node.singleSelect;
  }

  /** Nearest single-select ancestor-or-self: its subtree holds at most one assignment. */
  singleSelectGroup(id: string): TagNode | undefined {
    return this.lineage(id).find((n) => n.singleSelect);
  }

  subtree(id: string): Set<string> {
    const out = new Set<string>();
    if (!this.byId.has(id)) return out;
    const stack = [id];
    while (stack.length) {
      const next = stack.pop()!;
      if (out.has(next)) continue;
      out.add(next);
      for (const c of this.childrenOf(next)) stack.push(c.id);
    }
    return out;
  }
}
