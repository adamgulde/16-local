import { db } from '../data/store';
import { getAllTags, addTagToContact, removeTagFromContact, getTagsForContact } from '../data/tags';
import type { Tag, TagAssignment, TagInput } from '../data/types';

export type { Tag, TagAssignment, TagInput as AddTagPayload, TagKind } from '../data/types';

// Functional update for a person's tags, so overlapping add/remove requests never clobber each other.
export type TagsUpdate = (prev: TagAssignment[]) => TagAssignment[];

let allTags: Tag[] | null = null;
let allTagsPromise: Promise<Tag[]> | null = null;

/** The whole dictionary, cached for the session (it only changes with an app update). */
export const fetchAllTags = (): Promise<Tag[]> => {
  allTagsPromise ??= getAllTags(db()).then((tags) => (allTags = tags));
  return allTagsPromise;
};

/** The dictionary if it has already loaded, so a first render doesn't wait a tick. */
export const peekAllTags = (): Tag[] | null => allTags;

/** The tags on a contact (only contacts are tagged locally). */
export const fetchTagsForUser = (contactId: string): Promise<TagAssignment[]> =>
  getTagsForContact(db(), contactId);

/** Applies a tag and returns the contact's full tag list. */
export const addTagToUser = (contactId: string, payload: TagInput): Promise<TagAssignment[]> =>
  addTagToContact(db(), contactId, payload);

export const removeTagFromUser = (contactId: string, assignmentId: string): Promise<void> =>
  removeTagFromContact(db(), contactId, assignmentId);
