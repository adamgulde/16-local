import apiClient from './apiClient';

// --- Contract types (PLAN.md §3) ---

// Java enum names, serialized as-is by Jackson (no lowercase custom serializer on the backend).
export type ShareRequestDirection = 'INCOMING' | 'OUTGOING';
export type ShareRequestStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED';

export interface ShareRequest {
  id: string;
  direction: ShareRequestDirection;
  counterpartName: string | null; // outgoing: only filled once accepted
  // Outgoing only — the name of the sender's own placeholder they attached to this request, if
  // any (their own data, so it's safe to show while still PENDING). Contract amendment 2026-09-26.
  placeholderName: string | null;
  createdAt: string;
  status: ShareRequestStatus;
}

export interface Share {
  id: string;
  sharerUserId: string;
  sharerName: string;
  viewerUserId: string;
  viewerName: string;
  shareAbout: boolean;
  shareTags: boolean;
  shareNotes: boolean;
  sharePhone: boolean;
  hiddenContactIds: string[] | null; // sharer only
  // Sharer-only: the sharer's REGISTERED contacts whose own user hasn't opted in
  // (`discoverableInSharedGraphs`) — always Hidden User to the viewer, and the sharer can't
  // un-hide them (PLAN.md §5 F5). Contract amendment 2026-09-26.
  lockedContactIds: string[];
  createdAt: string;
}

export interface SendShareRequestPayload {
  phoneNumber?: string;
  inviteCode?: string;
  placeholderContactId?: string;
}

export interface RespondToShareRequestPayload {
  connect: boolean;
  allowView: boolean; // both false = decline
}

export interface ShareRequestsResponse {
  incoming: ShareRequest[];
  outgoing: ShareRequest[];
}

export interface SharesResponse {
  sharedByMe: Share[];
  sharedWithMe: Share[];
}

export interface UpdateSharePayload {
  shareAbout?: boolean;
  shareTags?: boolean;
  shareNotes?: boolean;
  sharePhone?: boolean;
}

export interface SelfProfile {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string | null;
  bio: string;
  inviteCode: string;
  createdAt?: string;
  discoverableInSharedGraphs: boolean;
  [key: string]: unknown;
}

// SELF node edits go here, not `/api/contacts` (PLAN.md §3).
export interface UpdateSelfProfilePayload {
  firstName?: string;
  lastName?: string;
  bio?: string;
}

const SHARE_REQUESTS_URL = '/api/share-requests';
const SHARES_URL = '/api/shares';

export const sendShareRequest = async (payload: SendShareRequestPayload): Promise<void> => {
  await apiClient.post(SHARE_REQUESTS_URL, payload);
};

export const fetchShareRequests = async (): Promise<ShareRequestsResponse> => {
  const response = await apiClient.get<ShareRequestsResponse>(SHARE_REQUESTS_URL);
  return response.data;
};

export const respondToShareRequest = async (id: string, payload: RespondToShareRequestPayload): Promise<void> => {
  await apiClient.post(`${SHARE_REQUESTS_URL}/${id}/respond`, payload);
};

export const cancelShareRequest = async (id: string): Promise<void> => {
  await apiClient.delete(`${SHARE_REQUESTS_URL}/${id}`);
};

export const fetchShares = async (): Promise<SharesResponse> => {
  const response = await apiClient.get<SharesResponse>(SHARES_URL);
  return response.data;
};

export const updateShare = async (id: string, payload: UpdateSharePayload): Promise<Share> => {
  const response = await apiClient.patch<Share>(`${SHARES_URL}/${id}`, payload);
  return response.data;
};

export const setShareHiddenContacts = async (id: string, contactIds: string[]): Promise<void> => {
  await apiClient.put(`${SHARES_URL}/${id}/hidden-contacts`, { contactIds });
};

export const deleteShare = async (id: string): Promise<void> => {
  await apiClient.delete(`${SHARES_URL}/${id}`);
};

export const updatePrivacy = async (discoverableInSharedGraphs: boolean): Promise<void> => {
  await apiClient.put('/api/users/me/privacy', { discoverableInSharedGraphs });
};

export const fetchSelfProfile = async (): Promise<SelfProfile> => {
  const response = await apiClient.get<SelfProfile>('/api/users/me');
  return response.data;
};

export const updateSelfProfile = async (payload: UpdateSelfProfilePayload): Promise<SelfProfile> => {
  const response = await apiClient.patch<SelfProfile>('/api/users/me', payload);
  return response.data;
};
