// Shapes the data layer returns. Kept structurally close to the networked app's contract so the
// existing components need few changes; sharing-only fields (profile, source, linkedUserId) are gone.

export type NodeKind = 'SELF' | 'PLACEHOLDER';
export type GraphEdgeKind = 'DIRECT' | 'LINK';
export type TagKind = 'SELF' | 'CUSTOM' | 'PRIVATE';

/** Relationship strength, 1 (distant) to 5 (very close). */
export type Strength = 1 | 2 | 3 | 4 | 5;
export const DEFAULT_STRENGTH: Strength = 3;
export const isStrength = (n: unknown): n is Strength => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5;

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
  strength: Strength; // SELF is always 5 (the centre of the graph)
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
