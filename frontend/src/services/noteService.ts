import apiClient from './apiClient';

// Your own note about this person — never anyone else's; the backend has no endpoint that
// could return one, by construction.
export const fetchNote = async (subjectId: string): Promise<string> => {
  const response = await apiClient.get<{ content: string }>(`/api/users/${subjectId}/notes`);
  return response.data.content;
};

export const saveNote = async (subjectId: string, content: string): Promise<void> => {
  await apiClient.put(`/api/users/${subjectId}/notes`, { content });
};
