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

export interface ImportContactsResult {
  created: GraphNode[];
  skippedDuplicates: number;
  skippedInvalid: number;
}

// Server-side cap per call (ContactService.MAX_IMPORT_BATCH); bigger selections go in chunks.
const IMPORT_CHUNK = 500;

/**
 * Bulk-creates placeholders from an address-book import, chunked. `onProgress` gets the number of
 * entries sent so far. A failing chunk rejects, but what earlier chunks created is still on the
 * server — callers should refresh rather than assume nothing happened.
 */
export const importContacts = async (
  entries: CreateContactPayload[],
  onProgress?: (done: number) => void,
  onChunkCreated?: (created: GraphNode[]) => void
): Promise<ImportContactsResult> => {
  const total: ImportContactsResult = { created: [], skippedDuplicates: 0, skippedInvalid: 0 };
  for (let i = 0; i < entries.length; i += IMPORT_CHUNK) {
    const chunk = entries.slice(i, i + IMPORT_CHUNK);
    const response = await apiClient.post<ImportContactsResult>(`${API_URL}/import`, { contacts: chunk });
    total.created.push(...response.data.created);
    total.skippedDuplicates += response.data.skippedDuplicates;
    total.skippedInvalid += response.data.skippedInvalid;
    onChunkCreated?.(response.data.created);
    onProgress?.(i + chunk.length);
  }
  return total;
};
