import type { Graph, GraphEdgeKind, GraphNode, NodeKind } from '../services/graphService';

// force-graph-2d's own node/link shape, carrying just what the renderers need to draw a node by
// kind (see rendering.ts) without reaching back into the full GraphNode on every frame.
export interface ForceGraphNode {
  id: string;
  kind: NodeKind;
  name: string;
  phoneNumber: string | null;
  editable: boolean;
  // Set only when this node arrived via a share overlay (GraphNode.source != null) — drives the
  // "via {sharerName}" badge. Independent of `kind`: a SHARED node can still be REGISTERED,
  // PLACEHOLDER, or HIDDEN underneath.
  sharerName: string | null;
  val: number;
}

export interface ForceGraphLink {
  source: string;
  target: string;
  kind: GraphEdgeKind;
  shareId: string | null;
}

export interface ForceGraphData {
  nodes: ForceGraphNode[];
  links: ForceGraphLink[];
}

export const contactFullName = (n: Pick<GraphNode, 'firstName' | 'lastName'>): string =>
  `${n.firstName} ${n.lastName}`.trim();

// The label a graph view should show under a node: "Hidden User" needs no sharer suffix (it
// reveals nothing extra), everything else that arrived via a share gets a "via {sharerName}" tag.
export const displayLabelFor = (n: Pick<GraphNode, 'firstName' | 'lastName' | 'kind' | 'source'>): string => {
  const name = contactFullName(n);
  if (n.kind === 'HIDDEN' || !n.source) return name;
  return `${name} (via ${n.source.sharerName})`;
};

const NODE_VAL_SELF = 8;
const NODE_VAL_DEFAULT = 5;

export const graphToForceGraphData = (graph: Graph): ForceGraphData => ({
  nodes: graph.nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
    name: displayLabelFor(n),
    phoneNumber: n.phoneNumber,
    editable: n.editable,
    sharerName: n.source?.sharerName ?? null,
    val: n.kind === 'SELF' ? NODE_VAL_SELF : NODE_VAL_DEFAULT,
  })),
  links: graph.edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind, shareId: e.shareId })),
});

// While editing a share's visibility (PLAN.md §5 F5), a contact toggled hidden — or a REGISTERED
// contact whose own user hasn't opted in (`lockedContactIds`, always hidden, can't be un-hidden)
// — previews as a grey "Hidden User" on the graph, reusing the existing HIDDEN kind styling
// (colorForNode/drawNode in rendering.ts) rather than adding a new visual state.
//
// This used to build a whole new `ForceGraphData` (cloning the hidden/locked node objects). That
// broke the graph: react-force-graph/d3-force resolve a link's `source`/`target` to the actual
// node *object* the first time they see it, and only re-resolve by id when the field is still a
// bare string — so handing it a clone with the same id but a new object identity left the link
// pointing at the stale, no-longer-simulated original object while the (cloned) visible node was
// treated as brand new and re-laid-out from scratch. Handing ForceGraph2D *any* structurally new
// `graphData` object also makes it reheat and re-run the whole simulation (see STATIC_LAYOUT),
// even when every node kept its id and position — so entering/leaving/toggling share mode must
// never change what object is passed as `graphData` at all. Instead, this only computes *which*
// node ids should be drawn as "Hidden User" — callers keep feeding ForceGraph2D the one stable
// `forceGraphData` object always, and pass this id set to `drawNode` purely for rendering.
export const applyShareModePreview = (
  data: ForceGraphData,
  hidden: ReadonlySet<string>,
  locked: ReadonlySet<string>
): Set<string> => {
  const nodeIds = new Set(data.nodes.map((n) => n.id));
  const preview = new Set<string>();
  hidden.forEach((id) => nodeIds.has(id) && preview.add(id));
  locked.forEach((id) => nodeIds.has(id) && preview.add(id));
  return preview;
};
