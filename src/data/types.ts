// Shapes the data layer returns. Kept structurally close to the networked app's contract so the
// existing components need few changes; sharing-only fields (profile, source, linkedUserId) are gone.

export type NodeKind = 'SELF' | 'PLACEHOLDER';
export type GraphEdgeKind = 'DIRECT' | 'LINK';
export type TagKind = 'SELF' | 'CUSTOM' | 'PRIVATE';

/** Closeness, 1 (distant) to 10 (inner circle). Decimals are allowed. */
export type Strength = number;
export const STRENGTH_MIN = 1;
export const STRENGTH_MAX = 10;
/** Friend (the old 3 on a 1–5 scale, rescaled). */
export const DEFAULT_STRENGTH: Strength = 5.5;
export const isStrength = (n: unknown): n is Strength =>
  typeof n === 'number' && Number.isFinite(n) && n >= STRENGTH_MIN && n <= STRENGTH_MAX;

export interface TagAssignment {
  id: string;
  category: string;
  label: string;
  isSelfTag: boolean;
  isMine: boolean;
  kind: TagKind;
  tagId: string | null;
  parentId: string | null;
  level: number;
  icon: string | null;
  fullPath: string;
}

/** One node of the curated tag dictionary. Level-1 nodes are categories, never applied directly. */
export interface Tag {
  id: string;
  category: string;
  label: string;
  parentId: string | null;
  level: number;
  icon: string | null;
  displayOrder: number;
  fullPath: string;
  hasChildren: boolean;
  selectable: boolean;
}

export interface GraphNode {
  id: string; // contact id, or 'self'
  kind: NodeKind;
  firstName: string;
  lastName: string;
  about: string;
  phoneNumber: string | null;
  tags: TagAssignment[];
  note: string;
  strength: Strength; // SELF is always STRENGTH_MAX (the centre of the graph)
  knownPersonally: boolean; // false: added, but not connected to you directly
  editable: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: GraphEdgeKind;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ContactInput {
  firstName?: string;
  lastName?: string;
  about?: string;
  phoneNumber?: string;
  strength?: number;
  /** Defaults to true. False adds the person without a direct edge from you. */
  knownPersonally?: boolean;
}

export interface TagInput {
  tagId?: string;
  customLabel?: string;
  parentTagId?: string | null;
}

export interface ImportResult {
  created: GraphNode[];
  skippedDuplicates: number;
  skippedInvalid: number;
}
