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
  /** Identifies people with identical tag sets (sorted tag ids joined). Empty when untagged. */
  tagKey: string;
  val: number;
}

export interface ForceGraphLink {
  source: string;
  target: string;
  kind: GraphEdgeKind;
}

export interface ForceGraphData {
  nodes: ForceGraphNode[];
  links: ForceGraphLink[];
}

export const contactFullName = (n: Pick<GraphNode, 'firstName' | 'lastName'>): string =>
  `${n.firstName} ${n.lastName}`.trim();

const NODE_VAL_SELF = 8;
const NODE_VAL_DEFAULT = 5;

/** Same tags, same key: two people with exactly the same tags get the same key. */
export const tagKeyFor = (tags: { id: string }[]): string =>
  tags.map((t) => t.id).sort().join('|');

/**
 * Builds the force-graph data for a graph. Pass the previous data so people who are still here keep
 * their positions: the layout then moves from where it was instead of starting again.
 */
export const graphToForceGraphData = (graph: Graph, previous?: ForceGraphData): ForceGraphData => {
  const before = new Map((previous?.nodes ?? []).map((n) => [n.id, n]));
  return {
    nodes: graph.nodes.map((n) => {
      const old = before.get(n.id) as (ForceGraphNode & { x?: number; y?: number }) | undefined;
      const node: ForceGraphNode & { x?: number; y?: number } = {
        id: n.id,
        kind: n.kind,
        name: contactFullName(n),
        phoneNumber: n.phoneNumber,
        editable: n.editable,
        strength: n.strength,
        tagKey: tagKeyFor(n.tags),
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
