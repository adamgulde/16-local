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

export const graphToForceGraphData = (graph: Graph): ForceGraphData => ({
  nodes: graph.nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
    name: contactFullName(n),
    phoneNumber: n.phoneNumber,
    editable: n.editable,
    strength: n.strength,
    val: n.kind === 'SELF' ? NODE_VAL_SELF : NODE_VAL_DEFAULT,
  })),
  links: graph.edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind })),
});
