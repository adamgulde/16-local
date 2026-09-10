import apiClient from './apiClient';
import type { ConnectionRequest } from './types';

const API_URL = '/api/requests';

export const sendRequest = async (receiverId: string) => {
  await apiClient.post(API_URL, { receiverId });
};

export const fetchMyRequests = async (): Promise<ConnectionRequest[]> => {
  const response = await apiClient.get<ConnectionRequest[]>(`${API_URL}/me`);
  return response.data;
};

export const acceptRequest = async (requestId: string) => {
  await apiClient.put(`${API_URL}/${requestId}/accept`);
};

export const declineRequest = async (requestId: string) => {
  await apiClient.put(`${API_URL}/${requestId}/decline`);
};

// Just the ordered hop ids — the backend no longer returns full profiles here (that used to
// leak a hop's real phone number whenever the viewer happened to already be connected to
// them), and the frontend only ever needed identity to draw the path anyway.
export const findPath = async (senderId: string, receiverId: string): Promise<string[]> => {
  const response = await apiClient.get<string[]>(`/api/users/${senderId}/path/${receiverId}`);
  return response.data;
};
