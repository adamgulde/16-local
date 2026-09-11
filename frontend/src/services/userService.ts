import apiClient from './apiClient';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  bio: string;
  relationships: string[];
  inviteCode?: string;
  maxConnectionDegree?: number | null;
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

export const searchUsersApi = async (query: string, searchNames = true, searchTags = true): Promise<User[]> => {
  const response = await apiClient.get<SearchHit[]>(`${API_URL}/search`, {
    params: { q: query, searchNames, searchTags }
  });
  return response.data.map((hit) => hit.user);
};
