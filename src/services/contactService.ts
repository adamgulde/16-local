import { db } from '../data/store';
import {
  createContact as createContactRow,
  patchContact,
  deleteContact as deleteContactRow,
  upsertNote,
  linkContacts as linkContactRows,
  unlinkContacts as unlinkContactRows,
  importContacts as importContactRows,
} from '../data/contacts';
import type { ContactInput, GraphNode, ImportResult } from '../data/types';

export type CreateContactPayload = ContactInput & { firstName: string };
export type UpdateContactPayload = ContactInput;
export type { ImportResult as ImportContactsResult } from '../data/types';

// Batch size per import chunk, so progress can be reported and a bad chunk doesn't lose the rest.
const IMPORT_CHUNK = 500;

export const createContact = (payload: CreateContactPayload): Promise<GraphNode> =>
  createContactRow(db(), payload);

export const updateContact = (id: string, payload: UpdateContactPayload): Promise<GraphNode> =>
  patchContact(db(), id, payload);

export const deleteContact = (id: string): Promise<void> => deleteContactRow(db(), id);

export const putContactNote = (id: string, content: string): Promise<void> => upsertNote(db(), id, content);

export const linkContacts = (a: string, b: string): Promise<void> => linkContactRows(db(), a, b);

export const unlinkContacts = (a: string, b: string): Promise<void> => unlinkContactRows(db(), a, b);

/**
 * Creates placeholders from an address-book import, chunked. `onProgress` gets the number of
 * entries handled so far. If a chunk fails, earlier chunks are already saved, so callers should
 * refresh the graph rather than assume nothing happened.
 */
export const importContacts = async (
  entries: CreateContactPayload[],
  onProgress?: (done: number) => void,
  onChunkCreated?: (created: GraphNode[]) => void
): Promise<ImportResult> => {
  const total: ImportResult = { created: [], skippedDuplicates: 0, skippedInvalid: 0 };
  for (let i = 0; i < entries.length; i += IMPORT_CHUNK) {
    const chunk = entries.slice(i, i + IMPORT_CHUNK);
    const result = await importContactRows(db(), chunk);
    total.created.push(...result.created);
    total.skippedDuplicates += result.skippedDuplicates;
    total.skippedInvalid += result.skippedInvalid;
    onChunkCreated?.(result.created);
    onProgress?.(i + chunk.length);
  }
  return total;
};
