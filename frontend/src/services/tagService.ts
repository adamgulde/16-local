import apiClient from './apiClient';

// One node of the global tag tree. Level-1 nodes are categories (never applied directly);
// `category` and `icon` always describe the node's top-level category.
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
  // Sensitive categories: only people themselves may apply these tags.
  selfOnly: boolean;
}

// Drives chip colour: SELF = dictionary self-tag, CUSTOM = free-text self-tag,
// PRIVATE = a tag the viewer placed on someone else (only ever visible to them).
export type TagKind = 'SELF' | 'CUSTOM' | 'PRIVATE';

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

// Functional update for a person's tags, so overlapping add/remove requests never clobber each other.
export type TagsUpdate = (prev: TagAssignment[]) => TagAssignment[];

export interface AddTagPayload {
  tagId?: string;
  customLabel?: string;
  // Where a custom label is filed — required for self-tags.
  parentTagId?: string | null;
}

// The whole tag tree, depth-first — the menu self-tagging (and tagging others) draws from.
// Cached for the session: the dictionary only changes with a backend migration.
let allTagsPromise: Promise<Tag[]> | null = null;
let allTags: Tag[] | null = null;
export const fetchAllTags = (): Promise<Tag[]> => {
  allTagsPromise ??= apiClient
    .get<Tag[]>('/api/tags')
    .then((response) => (allTags = response.data))
    .catch((err) => {
      allTagsPromise = null;
      throw err;
    });
  return allTagsPromise;
};

// The dictionary if it has already loaded (the graph loads it up front), for a first render
// that doesn't wait a tick on an already-resolved promise.
export const peekAllTags = (): Tag[] | null => allTags;

// Default endpoint base for the (self/other-user) directory tags. The graph's contact editor
// (ContactCard, F3) passes '/api/contacts' instead — same shapes, same picker, different subject
// kind (PLAN.md §3: `GET/POST/DELETE /api/contacts/{id}/tags[/{assignmentId}]`, "as today's
// `/api/users/{id}/tags`").
const DEFAULT_TAG_BASE = '/api/users';

// Public self-tags on this user, plus (only) your own private tags on them. The graph gets these
// with the directory; only views without it (columns) fetch per person.
export const fetchTagsForUser = async (subjectId: string, base = DEFAULT_TAG_BASE): Promise<TagAssignment[]> => {
  const response = await apiClient.get<TagAssignment[]>(`${base}/${subjectId}/tags`);
  return response.data;
};

// Resolves to all of this person's tags as you now see them — a pick in a single-select group
// (age range, gender) replaces the earlier one, so the response is the whole list.
export const addTagToUser = async (
  subjectId: string,
  payload: AddTagPayload,
  base = DEFAULT_TAG_BASE
): Promise<TagAssignment[]> => {
  const response = await apiClient.post<TagAssignment[]>(`${base}/${subjectId}/tags`, payload);
  return response.data;
};

export const removeTagFromUser = async (
  subjectId: string,
  assignmentId: string,
  base = DEFAULT_TAG_BASE
): Promise<void> => {
  await apiClient.delete(`${base}/${subjectId}/tags/${assignmentId}`);
};
