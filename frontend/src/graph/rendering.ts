import { useEffect, type RefObject } from 'react';
import type { NodeObject, LinkObject, ForceGraphMethods } from 'react-force-graph-2d';
import type { Node, Link, User } from '../services/userService';

export interface LinkExtra {
  pending?: boolean;
}

export type GNode = NodeObject<Node>;
export type GLink = LinkObject<Node, LinkExtra>;
export type DisplayLink = Link & LinkExtra;

export const nodeRefId = (ref: string | number | GNode | undefined): string => {
  if (ref == null) return '';
  return typeof ref === 'object' ? String(ref.id) : String(ref);
};

// Below this globalScale (i.e. zoomed out far enough that labels would be unreadable clutter
// anyway), skip drawing node labels entirely — text shaping/fillText is the actual bottleneck
// once there are 100+ nodes on screen, far more than the circles themselves.
export const LABEL_VISIBILITY_SCALE = 0.6;

// Node color reflects degree of separation from the current user, not raw connection count:
// direct connections (degree 1) are green, fading toward white by degree 10 and beyond (or if
// unreachable). The current user's own node is colored separately by each renderer.
export const DEGREE_FADE_MAX = 10;
export const CURRENT_USER_COLOR = '#3d8bff';

export const colorForDistance = (distance: number | undefined): string => {
  if (distance === undefined || distance < 1) return 'rgb(255, 255, 255)';
  const t = Math.min(distance - 1, DEGREE_FADE_MAX - 1) / (DEGREE_FADE_MAX - 1);
  const r = Math.round(0 + 255 * t);
  const g = Math.round(170 + 85 * t);
  const b = Math.round(0 + 255 * t);
  return `rgb(${r}, ${g}, ${b})`;
};

// BFS distance from the current user, over confirmed connections only (pending requests don't
// count as a real degree of separation) — drives the green-to-white node coloring and the
// per-node repulsion below.
export const computeDistanceFromMe = (users: User[], currentUserId: string): Map<string, number> => {
  const dist = new Map<string, number>();
  dist.set(currentUserId, 0);
  const byId = new Map(users.map((u) => [u.id, u]));
  const queue = [currentUserId];
  while (queue.length > 0) {
    const curId = queue.shift()!;
    const d = dist.get(curId)!;
    const cur = byId.get(curId);
    if (!cur) continue;
    cur.relationships.forEach((relId) => {
      if (!dist.has(relId)) {
        dist.set(relId, d + 1);
        queue.push(relId);
      }
    });
  }
  return dist;
};

// Per-node repulsion grows with BFS distance from the current user, so distant shells push
// further apart than close ones — a true pairwise "repel harder the further apart these two
// specific nodes are" would need a custom O(n²) force, giving up forceManyBody's Barnes-Hut
// optimization (and the framerate work that fixed the zoomed-out lag), so this reuses the same
// per-node distanceFromMe map that already drives node color instead.
const CHARGE_BASE = -100;
const CHARGE_DEGREE_STEP = 30;
const LINK_DISTANCE = 20;

/** Wires the charge/link forces to distanceFromMe — identical physics for every renderer. */
export const useGraphPhysics = (
  fgRef: RefObject<ForceGraphMethods<GNode, GLink> | undefined>,
  links: DisplayLink[],
  distanceFromMe: Map<string, number>
) => {
  useEffect(() => {
    fgRef.current?.d3Force('charge')?.strength((node: GNode) => {
      const distance = distanceFromMe.get(String(node.id)) ?? DEGREE_FADE_MAX;
      return CHARGE_BASE - CHARGE_DEGREE_STEP * Math.min(distance, DEGREE_FADE_MAX);
    });

    // Confirmed-link degree per node, so strength can replicate d3-force's own default
    // (1 / min(sourceDegree, targetDegree)) instead of a flat value — a flat strength=1
    // overrides that degree-normalization and lets high-degree "hub" nodes get pulled in far
    // tighter than intended, slowly collapsing the whole graph over a long simulation run
    // (didn't show up in short test windows, only after minutes of real running time).
    const degree = new Map<string, number>();
    links.forEach((l) => {
      if (l.pending) return;
      degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
      degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
    });

    // Pending connections are drawn (see linkColor/linkLineDash below) but must not actually
    // pull the two people together — a strength of 0 makes forceLink treat that link as purely
    // decorative, contributing no attraction, unlike a confirmed connection.
    fgRef.current
      ?.d3Force('link')
      ?.distance(LINK_DISTANCE)
      .strength((link: GLink) => {
        if (link.pending) return 0;
        const s = degree.get(nodeRefId(link.source as string | GNode)) ?? 1;
        const t = degree.get(nodeRefId(link.target as string | GNode)) ?? 1;
        return 1 / Math.min(s, t);
      });
  }, [links, distanceFromMe, fgRef]);
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
  currentUserId: string;
  distanceFromMe: Map<string, number>;
  highlightNodes: Set<string>;
  activePath: string[] | null;
  maxDistance?: number;
  filterNodes?: Set<string> | null;
}

/** Identical node draw logic for every renderer — dimming, degree color, zoom-scaled radius. */
export const drawNode = (
  node: GNode,
  ctx: CanvasRenderingContext2D,
  globalScale: number,
  { currentUserId, distanceFromMe, highlightNodes, activePath, maxDistance = Infinity, filterNodes = null }: NodeCanvasOptions
) => {
  const idStr = String(node.id);
  const isHighlighted = highlightNodes.has(idStr);
  const isMe = node.id === currentUserId;
  const dist = isMe ? 0 : distanceFromMe.get(idStr);
  const isBeyondDistance = maxDistance !== Infinity && (dist === undefined || dist > maxDistance);
  const isFilteredOut = filterNodes !== null && !filterNodes.has(idStr) && !isMe;
  // When a path is open, everything not on that path fades.
  // When maxDistance is set, nodes beyond maxDistance fade out.
  // When a tag filter is active, non-matching nodes fade out.
  const dimmed = (activePath !== null && !isHighlighted) || (isBeyondDistance && !isHighlighted) || isFilteredOut;
  const nodeColor = isMe ? CURRENT_USER_COLOR : colorForDistance(dist);
  const radius = (isHighlighted ? 12 : 8) / globalScale;

  ctx.globalAlpha = dimmed ? 0.15 : 1;
  ctx.beginPath();
  // Radius given in screen pixels, not world units, so nodes stay a constant on-screen size at
  // any zoom level instead of ballooning to fill the screen when zoomToFit lands on a tightly-
  // clustered set.
  ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI, false);
  ctx.fillStyle = isHighlighted ? 'red' : nodeColor;
  ctx.fill();

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

// Click/tap hit-testing runs against a separate offscreen canvas painted by this callback, not
// against whatever nodeCanvasObject actually drew — left unset, force-graph derives a hit shape
// from the visible draw, but that ties clickability to the same tiny on-screen radius (~8px)
// that keeps nodes readable at any zoom. That radius is precise but punishing to hit exactly,
// especially zoomed out with many nodes crowded together, or on a touch screen. Paint a larger
// circle here instead, so a click/tap that lands near a node (not dead-on its visible dot)
// still registers — identical for every renderer.
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
  maxDistance?: number;
  distanceFromMe?: Map<string, number>;
  filterNodes?: Set<string> | null;
}

/** Identical link color logic for every renderer — highlight, dimming, pending vs. confirmed. */
export const linkColorFor = (
  link: GLink,
  { highlightLinks, activePath, maxDistance = Infinity, distanceFromMe, filterNodes = null }: LinkColorOptions
): string => {
  const sourceId = nodeRefId(link.source as string | GNode);
  const targetId = nodeRefId(link.target as string | GNode);
  const isHighlighted = highlightLinks.has(`${sourceId}-${targetId}`) || highlightLinks.has(`${targetId}-${sourceId}`);
  if (isHighlighted) return 'red';

  let isBeyondDistance = false;
  if (maxDistance !== Infinity && distanceFromMe) {
    const sDist = distanceFromMe.get(sourceId);
    const tDist = distanceFromMe.get(targetId);
    if (sDist === undefined || sDist > maxDistance || tDist === undefined || tDist > maxDistance) {
      isBeyondDistance = true;
    }
  }

  const isFilteredOut = filterNodes !== null && (!filterNodes.has(sourceId) || !filterNodes.has(targetId));
  const dimmed = activePath !== null || isBeyondDistance || isFilteredOut;
  const base: [number, number, number] = link.pending ? [102, 102, 102] : [200, 210, 220];
  return `rgba(${base[0]}, ${base[1]}, ${base[2]}, ${dimmed ? 0.08 : 0.8})`;
};

export const linkLineDashFor = (link: GLink): number[] | null => (link.pending ? [4, 4] : null);

// Drawn 'after' the default line, only for links on the currently-open path — the underlying
// link's source/target order is arbitrary (whichever user's relationship transformToGraphData
// happened to iterate first), so a built-in linkDirectionalArrow* prop can't be trusted to point
// the right way; pathLinkTarget instead records the true forward node (in path-traversal order)
// per hop, keyed by the unordered pair, so the arrow is drawn along the path's actual direction
// regardless of which end the link data calls "source".
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
