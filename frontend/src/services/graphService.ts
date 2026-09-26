import apiClient from './apiClient';
import type { TagAssignment } from './tagService';

// --- Contract types (PLAN.md §3) — do not drift without updating the plan. ---

export type NodeKind = 'SELF' | 'PLACEHOLDER' | 'REGISTERED' | 'HIDDEN';

export interface GraphNode {
  id: string; // contact id; SELF = your user id; HIDDEN = opaque id (UUIDv5(shareId, contactId))
  kind: NodeKind;
  firstName: string;
  lastName: string; // HIDDEN -> "Hidden", "User"
  about: string; // owner-written bio ("" if not shared/none)
  phoneNumber: string | null;
  tags: TagAssignment[]; // owner's tags on this contact
  note: string; // owner's private note ("" if none / not shared)
  profile: { bio: string; tags: TagAssignment[] } | null; // linked user's own self-profile, when visible
  linkedUserId: string | null; // REGISTERED only, and only for your own contacts
  source: { shareId: string; sharerUserId: string; sharerName: string } | null; // null = yours
  editable: boolean; // true only for your own contacts and SELF
}

export type GraphEdgeKind = 'DIRECT' | 'LINK' | 'SHARED';

export interface GraphEdge {
  source: string;
  target: string;
  kind: GraphEdgeKind;
  shareId: string | null;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const fetchGraph = async (): Promise<Graph> => {
  const response = await apiClient.get<Graph>('/api/graph');
  return response.data;
};

export const fetchShareGraph = async (shareId: string): Promise<Graph> => {
  const response = await apiClient.get<Graph>(`/api/shares/${shareId}/graph`);
  return response.data;
};
