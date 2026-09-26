import { useLayoutEffect, type RefObject } from 'react';
import type { NodeObject, LinkObject, ForceGraphMethods } from 'react-force-graph-2d';
import type { ForceGraphLink, ForceGraphNode } from './mapping';

// The extra properties LinkObject merges alongside the resolved source/target node refs.
export type LinkExtra = Pick<ForceGraphLink, 'kind' | 'shareId'>;

export type GNode = NodeObject<ForceGraphNode>;
export type GLink = LinkObject<ForceGraphNode, LinkExtra>;
export type DisplayLink = ForceGraphLink;

export const nodeRefId = (ref: string | number | GNode | undefined): string => {
  if (ref == null) return '';
  return typeof ref === 'object' ? String(ref.id) : String(ref);
};

// Below this globalScale (i.e. zoomed out far enough that labels would be unreadable clutter
// anyway), skip drawing node labels entirely — text shaping/fillText is the actual bottleneck
// once there are 100+ nodes on screen, far more than the circles themselves.
export const LABEL_VISIBILITY_SCALE = 0.6;

// Node color reflects kind (PLAN.md §5 F2), not degree of separation — the private graph has no
// meaningful notion of "how many hops from me" once hidden/shared overlays are in the mix.
export const SELF_COLOR = '#3d8bff';
export const REGISTERED_COLOR = '#22c55e';
export const PLACEHOLDER_COLOR = '#9ca3af';
export const HIDDEN_COLOR = '#5a5a60';
export const SHARED_TINT = '#e0a94c';

export const colorForNode = (node: Pick<ForceGraphNode, 'kind' | 'sharerName'>): string => {
  if (node.kind === 'HIDDEN') return HIDDEN_COLOR;
  if (node.sharerName) return SHARED_TINT;
  if (node.kind === 'SELF') return SELF_COLOR;
  if (node.kind === 'REGISTERED') return REGISTERED_COLOR;
  return PLACEHOLDER_COLOR;
};

const CHARGE = -60;
const LINK_DISTANCE = 30;

// The layout is computed synchronously before the first frame is drawn and never animates:
// d3's default cooling (alpha 1 → 0.001) takes 300 ticks, and cooldownTicks={0} stops the
// engine right after, so the graph first appears already at rest. Spread into ForceGraph2D.
export const STATIC_LAYOUT = { warmupTicks: 300, cooldownTicks: 0 } as const;

/** Wires the charge/link forces — identical physics for every renderer. Private graphs are small
 * (contacts, not a whole directory), so a flat charge/link strength is enough; no more per-node
 * "distance from me" repulsion, which had no equivalent once hidden/shared nodes exist. */
export const useGraphPhysics = (
  fgRef: RefObject<ForceGraphMethods<GNode, GLink> | undefined>,
  links: DisplayLink[]
) => {
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
      ?.distance(LINK_DISTANCE)
      .strength((link: GLink) => {
        const s = degree.get(nodeRefId(link.source as string | GNode)) ?? 1;
        const t = degree.get(nodeRefId(link.target as string | GNode)) ?? 1;
        return 1 / Math.min(s, t);
      });
  }, [links, fgRef]);
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
  // F5 interactive share mode: ids that should *draw* as "Hidden User" while the sharer is
  // previewing what a viewer would see. Deliberately just a display override, never a different
  // `node.kind`/`node.name` and never a different `graphData` object — see applyShareModePreview
  // in mapping.ts for why (STATIC_LAYOUT must never re-run just to preview a toggle).
  previewHiddenIds?: ReadonlySet<string> | null;
}

/** Identical node draw logic for every renderer — dimming, kind color/outline, zoom-scaled radius,
 * per PLAN.md §5 F2: SELF distinct, PLACEHOLDER dashed outline, REGISTERED solid, HIDDEN grey
 * "Hidden User", SHARED tinted (name already carries the "via {sharer}" suffix — see mapping.ts). */
export const drawNode = (
  node: GNode,
  ctx: CanvasRenderingContext2D,
  globalScale: number,
  { highlightNodes, activePath, filterNodes = null, previewHiddenIds = null }: NodeCanvasOptions
) => {
  const idStr = String(node.id);
  const isHighlighted = highlightNodes.has(idStr);
  const isFilteredOut = filterNodes !== null && !filterNodes.has(idStr) && node.kind !== 'SELF';
  const dimmed = (activePath !== null && !isHighlighted) || isFilteredOut;
  const isPreviewHidden = previewHiddenIds?.has(idStr) ?? false;
  const displayKind = isPreviewHidden ? 'HIDDEN' : node.kind;
  const displayName = isPreviewHidden ? 'Hidden User' : node.name;
  const nodeColor = isPreviewHidden ? HIDDEN_COLOR : colorForNode(node);
  const radius = (isHighlighted ? 12 : 8) / globalScale;

  ctx.globalAlpha = dimmed ? 0.15 : 1;
  ctx.beginPath();
  // Radius given in screen pixels, not world units, so nodes stay a constant on-screen size at
  // any zoom level instead of ballooning to fill the screen when zoomToFit lands on a tightly-
  // clustered set.
  ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI, false);
  if (displayKind === 'PLACEHOLDER') {
    // Placeholder (no account) — hollow, dashed outline instead of a solid fill.
    ctx.setLineDash([3 / globalScale, 2 / globalScale]);
    ctx.lineWidth = 1.5 / globalScale;
    ctx.strokeStyle = isHighlighted ? 'red' : nodeColor;
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    ctx.fillStyle = isHighlighted ? 'red' : nodeColor;
    ctx.fill();
  }

  // Skip labels if dimmed, or once zoomed out far enough that they'd be unreadable clutter
  if (!dimmed && (isHighlighted || globalScale > LABEL_VISIBILITY_SCALE)) {
    const fontSize = 10 / globalScale;
    ctx.font = `${fontSize}px Sans-Serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = isHighlighted ? 'red' : '#f0f0f0';
    ctx.fillText(displayName, node.x!, node.y! + radius + 1 / globalScale);
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
  filterNodes?: Set<string> | null;
}

/** Identical link color logic for every renderer — highlight, dimming, and a distinct look per
 * edge kind: DIRECT solid, LINK dashed, SHARED tinted+dashed (an overlay edge, not yours). */
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
  const base: [number, number, number] = link.kind === 'SHARED' ? [224, 169, 76] : [200, 210, 220];
  return `rgba(${base[0]}, ${base[1]}, ${base[2]}, ${dimmed ? 0.08 : 0.8})`;
};

export const linkLineDashFor = (link: GLink): number[] | null => (link.kind === 'DIRECT' ? null : [4, 4]);

// Drawn 'after' the default line, only for links on the currently-open path — the underlying
// link's source/target order is arbitrary (whichever edge the mapping happened to iterate first),
// so a built-in linkDirectionalArrow* prop can't be trusted to point the right way; pathLinkTarget
// instead records the true forward node (in path-traversal order) per hop, keyed by the unordered
// pair, so the arrow is drawn along the path's actual direction regardless of which end the link
// data calls "source".
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
