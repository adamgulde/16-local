import apiClient from './apiClient';
import type { TagAssignment } from './tagService';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  bio: string;
  relationships: string[];
  inviteCode?: string;
  maxConnectionDegree?: number | null;
  defaultUser?: boolean;
  createdAt?: string;
  // What you may see on this person, loaded with the directory. null on the stored session user.
  tags?: TagAssignment[] | null;
  // Your private note on this person, loaded with the directory. "" (empty) if none. null if not loaded.
  note?: string | null;
}

export interface Node {
  id: string;
  name: string;
  phoneNumber: string | null;
  val: number;
}

export interface Link {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: Node[];
  links: Link[];
}

const API_URL = '/api/users';

export const fullName = (user: Pick<User, 'firstName' | 'lastName'>): string =>
  `${user.firstName} ${user.lastName}`.trim();

export const formatRelativeTime = (isoString?: string): string => {
  if (!isoString) return 'Recently';
  const time = new Date(isoString).getTime();
  if (isNaN(time)) return 'Recently';
  const diffSec = Math.floor((Date.now() - time) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(isoString).toLocaleDateString();
};

export const fetchUsers = async (): Promise<User[]> => {
  const response = await apiClient.get<User[]>(API_URL);
  return response.data;
};

export const transformToGraphData = (users: User[]): GraphData => {
  const nodes: Node[] = users.map((user) => ({
    id: user.id,
    name: fullName(user),
    phoneNumber: user.phoneNumber,
    val: 5,
  }));

  const linkSet = new Set<string>();
  const links: Link[] = [];

  users.forEach((user) => {
    user.relationships.forEach((targetId) => {
      // Undirected: only add once per pair, and only if the target is actually in this batch.
      const key = [user.id, targetId].sort().join('-');
      if (!linkSet.has(key) && users.some((u) => u.id === targetId)) {
        linkSet.add(key);
        links.push({ source: user.id, target: targetId });
      }
    });
  });

  return { nodes, links };
};

export interface ReachResponse {
  reachableCount: number;
  totalUsers: number;
  percentage: number;
}

export const fetchReach = async (id: string, degree: number): Promise<ReachResponse> => {
  const response = await apiClient.get<ReachResponse>(`${API_URL}/${id}/reach`, { params: { degree } });
  return response.data;
};

export const updateBio = async (id: string, bio: string): Promise<void> => {
  await apiClient.put(`${API_URL}/${id}/bio`, { bio });
};

export const disconnectUser = async (id: string): Promise<void> => {
  await apiClient.delete(`${API_URL}/${id}/connection`);
};

export const updateAutoRejectSetting = async (maxDegree: number | null): Promise<void> => {
  await apiClient.put(`${API_URL}/me/auto-reject`, { maxConnectionDegree: maxDegree });
};

export interface SearchHit {
  user: User;
  connections: User[];
}

export type SearchMode = 'names' | 'tags' | 'bios' | 'notes';

// Tags-mode criteria: tree nodes (matching everything beneath them) and free-text labels.
export interface TagCriteria {
  tagIds: string[];
  labels: string[];
  matchAll: boolean;
}

export const searchUsersApi = async (
  mode: SearchMode,
  query: string,
  criteria?: TagCriteria
): Promise<User[]> => {
  const params = new URLSearchParams({ mode: mode.toUpperCase(), q: query });
  if (mode === 'tags' && criteria) {
    criteria.tagIds.forEach((id) => params.append('tagIds', id));
    // Spring splits a lone comma-separated value into a list, so commas can't survive in a label.
    criteria.labels.forEach((label) => params.append('labels', label.replace(/,/g, ' ')));
    params.set('matchAll', String(criteria.matchAll));
  }
  const response = await apiClient.get<SearchHit[]>(`${API_URL}/search`, { params });
  return response.data.map((hit) => hit.user);
};

export interface FriendSummary extends User {
  connectionsCount: number;
  mutualFriendsCount: number;
  isConnectedToViewer: boolean;
}

export type FriendSortOption = 'name' | 'connections' | 'mutualFriends';
export type SortOrder = 'asc' | 'desc';

export const fetchUserFriends = async (
  userId: string,
  sortBy: FriendSortOption = 'name',
  order?: SortOrder
): Promise<FriendSummary[]> => {
  const response = await apiClient.get<FriendSummary[]>(`${API_URL}/${userId}/friends`, {
    params: { sortBy, ...(order ? { order } : {}) }
  });
  return response.data;
};

