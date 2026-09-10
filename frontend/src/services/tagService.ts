import apiClient from './apiClient';

export interface Tag {
  id: string;
  category: string;
  label: string;
}

export interface TagAssignment {
  id: string;
  category: string;
  label: string;
  isSelfTag: boolean;
  isMine: boolean;
}

// The global tag dictionary — the menu self-tagging (and tagging others) draws from.
export const fetchAllTags = async (): Promise<Tag[]> => {
  const response = await apiClient.get<Tag[]>('/api/tags');
  return response.data;
};

// Public self-tags on this user, plus (only) your own private tags on them.
export const fetchTagsForUser = async (subjectId: string): Promise<TagAssignment[]> => {
  const response = await apiClient.get<TagAssignment[]>(`/api/users/${subjectId}/tags`);
  return response.data;
};

export const addTagToUser = async (
  subjectId: string,
  tag: { tagId: string } | { customLabel: string }
): Promise<TagAssignment> => {
  const response = await apiClient.post<TagAssignment>(`/api/users/${subjectId}/tags`, tag);
  return response.data;
};

export const removeTagFromUser = async (subjectId: string, assignmentId: string): Promise<void> => {
  await apiClient.delete(`/api/users/${subjectId}/tags/${assignmentId}`);
};
