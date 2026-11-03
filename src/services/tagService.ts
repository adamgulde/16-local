import { db } from '../data/store';
import { addTagToContact, getTagsForContact, listTags, removeTagFromContact } from '../data/tags';
import type { Tag, TagInput } from '../data/types';

export type { Tag, TagInput };

// The global tag list changes when a tag is first typed, so it's reloaded when the graph loads.
let allTags: Tag[] | null = null;

/** The whole global tag list, A to Z. Used for suggestions. */
export const fetchAllTags = async (): Promise<Tag[]> => {
  allTags = await listTags(db());
  return allTags;
};

/** The list if it has already loaded, so suggestions show without waiting. */
export const peekAllTags = (): Tag[] | null => allTags;

/** The tags on a contact. */
export const fetchTagsForUser = (contactId: string): Promise<Tag[]> => getTagsForContact(db(), contactId);

/** Applies a tag (an existing one by id, or by typed label) and returns the contact's tags. */
export const addTagToUser = (contactId: string, input: TagInput): Promise<Tag[]> =>
  addTagToContact(db(), contactId, input);

export const removeTagFromUser = (contactId: string, tagId: string): Promise<void> =>
  removeTagFromContact(db(), contactId, tagId);

/** Replaces a contact's tag list in the graph state. */
export type TagsUpdate = (prev: Tag[]) => Tag[];
