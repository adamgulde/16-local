import { useLayoutEffect, type RefObject } from 'react';
import type { NodeObject, LinkObject, ForceGraphMethods } from 'react-force-graph-2d';
import type { ForceGraphData, ForceGraphLink, ForceGraphNode } from './mapping';
import { STRENGTH_MAX, STRENGTH_MIN } from '../data/types';

// The extra properties LinkObject merges alongside the resolved source/target node refs.
export type LinkExtra = Pick<ForceGraphLink, 'kind'>;

export type GNode = NodeObject<ForceGraphNode>;
export type GLink = LinkObject<ForceGraphNode, LinkExtra>;
export type DisplayLink = ForceGraphLink;

export const nodeRefId = (ref: string | number | GNode | undefined): string => {
  if (ref == null) return '';
  return typeof ref === 'object' ? String(ref.id) : String(ref);
};

// Below this globalScale (zoomed out far enough that labels are unreadable clutter anyway), node
// labels are skipped — text shaping is the real bottleneck once 100+ nodes are on screen.
export const LABEL_VISIBILITY_SCALE = 0.6;

export const SELF_COLOR = '#3d8bff';
export const PLACEHOLDER_COLOR = '#9ca3af';

export const colorForNode = (node: Pick<ForceGraphNode, 'kind'>): string =>
  node.kind === 'SELF' ? SELF_COLOR : PLACEHOLDER_COLOR;

const CHARGE = -60;

// Pull toward the centre of a group of people with identical tags. Strong enough to bunch them up, weak
// enough that charge and links still win where a person's other tags pull them elsewhere.
export const GROUP_STRENGTH = 0.35;

// Link length from your relationship strength (1–5): a strong contact sits close to you, a distant
// one further out. Links between two of your contacts (LINK) use a fixed, medium length.
const DIRECT_DISTANCE_FAR = 90; // closeness 1 (distant)
const DIRECT_DISTANCE_NEAR = 15; // closeness 10 (inner circle)
const LINK_EDGE_DISTANCE = 45;

/** Target length for a link, in graph units. Exported for tests. */
export const linkDistanceFor = (link: GLink): number => {
  if (link.kind !== 'DIRECT') return LINK_EDGE_DISTANCE;
  // DIRECT links run from you (SELF) to a contact; the contact is the non-SELF end.
  const target = typeof link.target === 'object' ? (link.target as GNode) : null;
  const strength = Math.min(STRENGTH_MAX, Math.max(STRENGTH_MIN, target?.strength ?? 5.5));
  const t = (strength - STRENGTH_MIN) / (STRENGTH_MAX - STRENGTH_MIN);
  return DIRECT_DISTANCE_FAR - t * (DIRECT_DISTANCE_FAR - DIRECT_DISTANCE_NEAR);
};

// The layout is computed synchronously before the first frame is drawn and never animates:
// d3's default cooling (alpha 1 → 0.001) takes 300 ticks, and cooldownTicks={0} stops the
// engine right after, so the graph first appears already at rest. Spread into ForceGraph2D.
export const STATIC_LAYOUT = { warmupTicks: 300, cooldownTicks: 0 } as const;

interface GroupNode {
  id: string;
  tagIds: string[];
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

/**
 * Pulls everyone who shares a tag toward that tag's centre. Each tag's centroid is recomputed every
 * tick, so the pull follows people as they move. A person's pulls are limited upstream (see
 * tagGroupsOf), so this only sees the tags they're grouped by.
 */
export const tagGroupForce = () => {
  let nodes: GroupNode[] = [];
  const force = (alpha: number) => {
    const members = new Map<string, GroupNode[]>();
    for (const n of nodes) {
      if (n.x == null || n.y == null) continue;
      for (const id of n.tagIds ?? []) {
        const list = members.get(id) ?? [];
        list.push(n);
        members.set(id, list);
      }
    }
    for (const list of members.values()) {
      if (list.length < 2) continue;
      let cx = 0;
      let cy = 0;
      for (const m of list) {
        cx += m.x!;
        cy += m.y!;
      }
      cx /= list.length;
      cy /= list.length;
      for (const m of list) {
        m.vx = (m.vx ?? 0) + (cx - m.x!) * GROUP_STRENGTH * alpha;
        m.vy = (m.vy ?? 0) + (cy - m.y!) * GROUP_STRENGTH * alpha;
      }
    }
  };
  force.initialize = (n: GroupNode[]) => {
    nodes = n;
  };
  return force;
};

type Point = [number, number];

/** Convex hull (Andrew's monotone chain), counter-clockwise. Two points give the segment between them. */
export const convexHull = (points: Point[]): Point[] => {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length <= 2) return pts;
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
};

const GROUP_PALETTE = ['#f5a524', '#22c55e', '#a855f7', '#38bdf8', '#f43f5e', '#eab308', '#14b8a6', '#fb7185', '#60a5fa', '#c084fc'];

/**
 * Draws one soft polygon behind each tag group, around everyone who carries that tag, with the tag
 * name above it. Drawn before nodes and links, in graph coordinates.
 */
export const drawTagPolygons = (ctx: CanvasRenderingContext2D, globalScale: number, data: ForceGraphData) => {
  data.groups.forEach((group, gi) => {
    const points: Point[] = [];
    for (const n of data.nodes) {
      if (n.x != null && n.y != null && n.tagIds.includes(group.id)) points.push([n.x, n.y]);
    }
    if (points.length < 2) return;

    const hull = convexHull(points);
    const pad = 24 / globalScale; // a constant on-screen margin around the people
    const color = GROUP_PALETTE[gi % GROUP_PALETTE.length];

    ctx.save();
    ctx.beginPath();
    hull.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = color;
    ctx.fill();
    // A wide, round-joined stroke of the same outline gives the margin around the people.
    ctx.globalAlpha = 0.1;
    ctx.lineJoin = 'round';
    ctx.lineWidth = pad * 2;
    ctx.strokeStyle = color;
    ctx.stroke();

    const top = Math.min(...hull.map((p) => p[1]));
    const cx = hull.reduce((sum, p) => sum + p[0], 0) / hull.length;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = color;
    ctx.font = `${12 / globalScale}px Sans-Serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(group.label, cx, top - pad - 2 / globalScale);
    ctx.restore();
  });
};

/**
 * Wires the physics for every renderer: charge, link lengths (closeness), and tag groups. Whenever the
 * graph changes, the simulation is restarted from where people are now, so edits move the layout.
 */
export const useGraphPhysics = (
  fgRef: RefObject<ForceGraphMethods<GNode, GLink> | undefined>,
  data: ForceGraphData,
  ready: boolean
) => {
  const links = data.links;
  // A layout effect, not a passive one: force-graph runs its warmup in a debounced digest after
  // receiving new graphData, and the forces must be in place before that or the static layout
  // is computed with d3's defaults.
  useLayoutEffect(() => {
    fgRef.current?.d3Force('charge')?.strength(CHARGE);

    const degree = new Map<string, number>();
    links.forEach((l) => {
      degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
      degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
    });

    fgRef.current
      ?.d3Force('link')
      ?.distance((link: GLink) => linkDistanceFor(link))
      .strength((link: GLink) => {
        const s = degree.get(nodeRefId(link.source as string | GNode)) ?? 1;
        const t = degree.get(nodeRefId(link.target as string | GNode)) ?? 1;
        return 1 / Math.min(s, t);
      });

    fgRef.current?.d3Force('tagGroups', tagGroupForce());

    // Once the first layout has settled, restart the simulation so this change animates from the
    // current positions instead of waiting for the next interaction.
    if (ready) fgRef.current?.d3ReheatSimulation();
  }, [data, links, ready, fgRef]);
};

export const drawGrid = (ctx: CanvasRenderingContext2D, globalScale: number) => {
  ctx.save();
  const matrix = ctx.getTransform();
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const x0 = (0 - matrix.e) / matrix.a;
  const x1 = (w - matrix.e) / matrix.a;
  const y0 = (0 - matrix.f) / matrix.d;
  const y1 = (h - matrix.f) / matrix.d;
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);

  let step = 100;
  if (globalScale < 0.2) step = 500;
  else if (globalScale < 0.5) step = 200;
  else if (globalScale > 2) step = 50;

  const startX = Math.floor(minX / step) * step;
  const endX = Math.ceil(maxX / step) * step;
  const startY = Math.floor(minY / step) * step;
  const endY = Math.ceil(maxY / step) * step;

  // Subtle coordinate grid lines
  ctx.lineWidth = 1 / globalScale;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.beginPath();
  for (let x = startX; x <= endX; x += step) {
    ctx.moveTo(x, minY);
    ctx.lineTo(x, maxY);
  }
  for (let y = startY; y <= endY; y += step) {
    ctx.moveTo(minX, y);
    ctx.lineTo(maxX, y);
  }
  ctx.stroke();

  // Subtle intersection coordinate dots
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  const dotRadius = 1.6 / globalScale;
  for (let x = startX; x <= endX; x += step) {
    for (let y = startY; y <= endY; y += step) {
      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
  ctx.restore();
};

interface NodeCanvasOptions {
  highlightNodes: Set<string>;
  activePath: string[] | null;
  filterNodes?: Set<string> | null;
  /** Nodes picked in multi-select; drawn with a ring. */
  selectedIds?: ReadonlySet<string> | null;
}

/** Node draw logic shared by every renderer: dimming, kind colour, zoom-scaled radius. Every node is
 * a filled circle; multi-selected nodes get a white ring. */
export const drawNode = (
  node: GNode,
  ctx: CanvasRenderingContext2D,
  globalScale: number,
  { highlightNodes, activePath, filterNodes = null, selectedIds = null }: NodeCanvasOptions
) => {
  const idStr = String(node.id);
  const isHighlighted = highlightNodes.has(idStr);
  const isFilteredOut = filterNodes !== null && !filterNodes.has(idStr) && node.kind !== 'SELF';
  const dimmed = (activePath !== null && !isHighlighted) || isFilteredOut;
  const nodeColor = colorForNode(node);
  const radius = (isHighlighted ? 12 : 8) / globalScale;

  ctx.globalAlpha = dimmed ? 0.15 : 1;
  ctx.beginPath();
  // Radius in screen pixels, not world units, so nodes keep a constant on-screen size at any zoom.
  ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI, false);
  ctx.fillStyle = isHighlighted ? 'red' : nodeColor;
  ctx.fill();
  if (selectedIds?.has(idStr)) {
    ctx.beginPath();
    ctx.arc(node.x!, node.y!, radius + 4 / globalScale, 0, 2 * Math.PI, false);
    ctx.lineWidth = 2 / globalScale;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }

  // Skip labels if dimmed, or once zoomed out far enough that they'd be unreadable clutter
  if (!dimmed && (isHighlighted || globalScale > LABEL_VISIBILITY_SCALE)) {
    const fontSize = 10 / globalScale;
    ctx.font = `${fontSize}px Sans-Serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = isHighlighted ? 'red' : '#f0f0f0';
    ctx.fillText(node.name, node.x!, node.y! + radius + 1 / globalScale);
  }
  ctx.globalAlpha = 1;
};

// Click/tap hit-testing runs against a separate offscreen canvas. Paint a larger circle here so a
// tap that lands near a node (not dead-on its visible dot) still registers.
const CLICK_TARGET_RADIUS = 16;

export const paintNodePointerArea = (
  node: GNode,
  color: string,
  ctx: CanvasRenderingContext2D,
  globalScale: number
) => {
  const radius = CLICK_TARGET_RADIUS / globalScale;
  ctx.beginPath();
  ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI, false);
  ctx.fillStyle = color;
  ctx.fill();
};

interface LinkColorOptions {
  highlightLinks: Set<string>;
  activePath: string[] | null;
  filterNodes?: Set<string> | null;
}

/** Link colour: highlight, dimming, and a look per edge kind (DIRECT solid, LINK dashed). */
export const linkColorFor = (
  link: GLink,
  { highlightLinks, activePath, filterNodes = null }: LinkColorOptions
): string => {
  const sourceId = nodeRefId(link.source as string | GNode);
  const targetId = nodeRefId(link.target as string | GNode);
  const isHighlighted = highlightLinks.has(`${sourceId}-${targetId}`) || highlightLinks.has(`${targetId}-${sourceId}`);
  if (isHighlighted) return 'red';

  const isFilteredOut = filterNodes !== null && (!filterNodes.has(sourceId) || !filterNodes.has(targetId));
  const dimmed = activePath !== null || isFilteredOut;
  return `rgba(200, 210, 220, ${dimmed ? 0.08 : 0.8})`;
};


// Drawn 'after' the default line, only for links on the currently-open path. The link's
// source/target order is arbitrary, so pathLinkTarget records the true forward node per hop and
// the arrow follows the path's direction.
export const drawPathArrow = (
  link: GLink,
  ctx: CanvasRenderingContext2D,
  globalScale: number,
  pathLinkTarget: Map<string, string>
) => {
  if (pathLinkTarget.size === 0) return;
  const sourceNode = link.source as GNode;
  const targetNode = link.target as GNode;
  if (typeof sourceNode !== 'object' || typeof targetNode !== 'object') return;
  const sourceId = String(sourceNode.id);
  const targetId = String(targetNode.id);
  const key = [sourceId, targetId].sort().join('-');
  const forwardToId = pathLinkTarget.get(key);
  if (!forwardToId) return;
  const [fromNode, toNode] = forwardToId === targetId ? [sourceNode, targetNode] : [targetNode, sourceNode];
  if (fromNode.x == null || fromNode.y == null || toNode.x == null || toNode.y == null) return;

  const angle = Math.atan2(toNode.y - fromNode.y, toNode.x - fromNode.x);
  const midX = (fromNode.x + toNode.x) / 2;
  const midY = (fromNode.y + toNode.y) / 2;
  const arrowLength = 8 / globalScale;
  const arrowWidth = 5 / globalScale;

  ctx.save();
  ctx.translate(midX, midY);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(arrowLength / 2, 0);
  ctx.lineTo(-arrowLength / 2, arrowWidth / 2);
  ctx.lineTo(-arrowLength / 2, -arrowWidth / 2);
  ctx.closePath();
  ctx.fillStyle = 'red';
  ctx.fill();
  ctx.restore();
};
