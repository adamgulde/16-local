import type { Graph, GraphEdgeKind, GraphNode, NodeKind, Strength } from '../services/graphService';

// force-graph-2d's own node/link shape, carrying just what the renderers need to draw a node by
// kind (see rendering.ts) without reaching back into the full GraphNode on every frame.
export interface ForceGraphNode {
  id: string;
  kind: NodeKind;
  name: string;
  phoneNumber: string | null;
  editable: boolean;
  strength: Strength;
  /** The tags this person pulls on (see tagGroupsOf): at most GROUP_TAG_LIMIT, most common first. */
  tagIds: string[];
  val: number;
  /** Current position, written by the simulation. Absent until it has placed the node. */
  x?: number;
  y?: number;
}

export interface ForceGraphLink {
  source: string;
  target: string;
  kind: GraphEdgeKind;
}

/** A tag that groups people. Drawn as a background polygon and pulls its members together. */
export interface TagGroup {
  id: string;
  label: string;
}

export interface ForceGraphData {
  nodes: ForceGraphNode[];
  links: ForceGraphLink[];
  groups: TagGroup[];
}

/** A person with more tags than this only pulls on the tags shared by the most people. */
export const GROUP_TAG_LIMIT = 3;

/**
 * Works out which tags group people. Each person keeps their GROUP_TAG_LIMIT most common tags across
 * the graph (ties broken by name). A group exists for any tag that at least two people keep.
 */
export const tagGroupsOf = (graph: Graph): { effective: Map<string, string[]>; groups: TagGroup[] } => {
  const people = graph.nodes.filter((n) => n.kind !== 'SELF');
  const counts = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const p of people) {
    for (const t of p.tags) {
      counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
      labels.set(t.id, t.label);
    }
  }

  const effective = new Map<string, string[]>();
  const memberCount = new Map<string, number>();
  for (const p of people) {
    const top = [...p.tags]
      .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.label.localeCompare(b.label))
      .slice(0, GROUP_TAG_LIMIT)
      .map((t) => t.id);
    effective.set(p.id, top);
    for (const id of top) memberCount.set(id, (memberCount.get(id) ?? 0) + 1);
  }

  const groups = [...memberCount.entries()]
    .filter(([, n]) => n >= 2)
    .map(([id]) => ({ id, label: labels.get(id) ?? '' }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return { effective, groups };
};

export const contactFullName = (n: Pick<GraphNode, 'firstName' | 'lastName'>): string =>
  `${n.firstName} ${n.lastName}`.trim();

const NODE_VAL_SELF = 8;
const NODE_VAL_DEFAULT = 5;

/**
 * Builds the force-graph data for a graph. Pass the previous data so people who are still here keep
 * their positions: the layout then moves from where it was instead of starting again.
 */
export const graphToForceGraphData = (graph: Graph, previous?: ForceGraphData): ForceGraphData => {
  const before = new Map((previous?.nodes ?? []).map((n) => [n.id, n]));
  const { effective, groups } = tagGroupsOf(graph);
  return {
    groups,
    nodes: graph.nodes.map((n) => {
      const old = before.get(n.id) as (ForceGraphNode & { x?: number; y?: number }) | undefined;
      const node: ForceGraphNode & { x?: number; y?: number } = {
        id: n.id,
        kind: n.kind,
        name: contactFullName(n),
        phoneNumber: n.phoneNumber,
        editable: n.editable,
        strength: n.strength,
        tagIds: effective.get(n.id) ?? [],
        val: n.kind === 'SELF' ? NODE_VAL_SELF : NODE_VAL_DEFAULT,
      };
      if (old?.x != null && old.y != null) {
        node.x = old.x;
        node.y = old.y;
      }
      return node;
    }),
    links: graph.edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind })),
  };
};
