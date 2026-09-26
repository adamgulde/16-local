import apiClient from './apiClient';
import type { GraphNode } from './graphService';

const API_URL = '/api/contacts';

export interface CreateContactPayload {
  firstName: string;
  lastName?: string;
  about?: string;
  phoneNumber?: string;
}

export interface UpdateContactPayload {
  firstName?: string;
  lastName?: string;
  about?: string;
  phoneNumber?: string;
}

export const createContact = async (payload: CreateContactPayload): Promise<GraphNode> => {
  const response = await apiClient.post<GraphNode>(API_URL, payload);
  return response.data;
};

export const updateContact = async (id: string, payload: UpdateContactPayload): Promise<GraphNode> => {
  const response = await apiClient.patch<GraphNode>(`${API_URL}/${id}`, payload);
  return response.data;
};

export const deleteContact = async (id: string): Promise<void> => {
  await apiClient.delete(`${API_URL}/${id}`);
};

export const putContactNote = async (id: string, content: string): Promise<void> => {
  await apiClient.put(`${API_URL}/${id}/note`, { content });
};

export const linkContacts = async (a: string, b: string): Promise<void> => {
  await apiClient.post(`${API_URL}/links`, { a, b });
};

export const unlinkContacts = async (a: string, b: string): Promise<void> => {
  await apiClient.delete(`${API_URL}/links`, { data: { a, b } });
};
