// Port of ContactService (backend). Every function takes the Db explicitly so tests can drive it.
import type { Db } from './db';
import { DataError, notFound } from './errors';
import { cleanPhone, phoneKey } from './phone';
import { newId, nowIso } from './ids';

import { getTagsForContact } from './tags';
import { DEFAULT_STRENGTH, isStrength, STRENGTH_MAX, STRENGTH_MIN, type ContactInput, type GraphNode, type ImportResult, type Strength } from './types';

export const MAX_NAME_LENGTH = 100;
export const MAX_TEXT_LENGTH = 10_000;
export const MAX_IMPORT_BATCH = 500;
export const MAX_CONTACTS = 5_000;

export interface ContactRow {
  id: string;
  first_name: string;
  last_name: string;
  about: string;
  phone_number: string | null;
  note: string;
  strength: number;
  known_personally: number;
  last_interacted_at: string | null;
  created_at: string;
  updated_at: string;
}

const toNode = (row: ContactRow, tags: GraphNode['tags'] = []): GraphNode => ({
  id: row.id,
  kind: 'PLACEHOLDER',
  firstName: row.first_name,
  lastName: row.last_name,
  about: row.about,
  phoneNumber: row.phone_number,
  tags,
  note: row.note,
  strength: row.strength,
  knownPersonally: row.known_personally === 1,
  lastInteractedAt: row.last_interacted_at,
  editable: true,
});

export const contactNode = async (d: Db, id: string): Promise<GraphNode> => {
  const row = await getOwnedContact(d, id);
  return toNode(row, await getTagsForContact(d, id));
};

/** Trimmed, or throws if required and blank / too long. */
const validateName = (name: string | null | undefined, required: boolean, label: string): string | null => {
  const trimmed = name == null ? null : name.trim();
  if (required && (!trimmed)) throw new DataError(`${label} is required`);
  if (trimmed && trimmed.length > MAX_NAME_LENGTH) {
    throw new DataError(`${label} must be ${MAX_NAME_LENGTH} characters or fewer`);
  }
  return trimmed || null;
};

const validateText = (text: string | null | undefined, label: string): string => {
  if (text != null && text.length > MAX_TEXT_LENGTH) {
    throw new DataError(`${label} must be ${MAX_TEXT_LENGTH} characters or fewer`);
  }
  return text ?? '';
};

const validateStrength = (value: number | undefined): Strength => {
  if (value === undefined) return DEFAULT_STRENGTH;
  if (!isStrength(value)) throw new DataError(`Closeness must be a number from ${STRENGTH_MIN} to ${STRENGTH_MAX}`);
  return value;
};

/** Trimmed and cut to `max` characters; blank becomes null. Used by import, which truncates rather than rejects. */
const truncate = (value: string | null | undefined, max: number): string | null => {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max).trim() : trimmed;
};

const nameKey = (first: string | null, last: string | null): string =>
  `${first ?? ''} ${last ?? ''}`.trim().replace(/\s+/g, ' ').toLowerCase();

export const getOwnedContact = async (d: Db, id: string): Promise<ContactRow> => {
  const [row] = await d.all<ContactRow>('SELECT * FROM contacts WHERE id = ?', [id]);
  if (!row) throw notFound('Contact');
  return row;
};

export const createContact = async (d: Db, input: ContactInput): Promise<GraphNode> => {
  const firstName = validateName(input.firstName, true, 'First name')!;
  const lastName = validateName(input.lastName, false, 'Last name') ?? '';
  const about = validateText(input.about, 'About');
  const phone = cleanPhone(input.phoneNumber);
  const strength = validateStrength(input.strength);
  const known = input.knownPersonally === false ? 0 : 1;
  const now = nowIso();
  const id = newId();
  await d.run(
    `INSERT INTO contacts (id, first_name, last_name, about, phone_number, note, strength, known_personally, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?)`,
    [id, firstName, lastName, about, phone, strength, known, now, now]
  );
  return contactNode(d, id);
};

export const patchContact = async (d: Db, id: string, input: ContactInput): Promise<GraphNode> => {
  const row = await getOwnedContact(d, id);
  const next = {
    first_name: input.firstName != null ? validateName(input.firstName, true, 'First name')! : row.first_name,
    last_name: input.lastName != null ? validateName(input.lastName, false, 'Last name') ?? '' : row.last_name,
    about: input.about != null ? validateText(input.about, 'About') : row.about,
    phone_number: input.phoneNumber != null ? cleanPhone(input.phoneNumber) : row.phone_number,
    strength: input.strength != null ? validateStrength(input.strength) : row.strength,
  };
  await d.run(
    `UPDATE contacts SET first_name = ?, last_name = ?, about = ?, phone_number = ?, strength = ?, updated_at = ?
     WHERE id = ?`,
    [next.first_name, next.last_name, next.about, next.phone_number, next.strength, nowIso(), id]
  );
  return contactNode(d, id);
};

/** Deleting cascades to the contact's links, tags and note. */
export const deleteContact = async (d: Db, id: string): Promise<void> => {
  await getOwnedContact(d, id);
  await d.run('DELETE FROM contacts WHERE id = ?', [id]);
};

export const upsertNote = async (d: Db, id: string, content: string | null | undefined): Promise<void> => {
  await getOwnedContact(d, id);
  const note = validateText(content, 'Note');
  await d.run('UPDATE contacts SET note = ?, updated_at = ? WHERE id = ?', [note, nowIso(), id]);
};

/** Links are stored once per pair with the lower id first, so the pair is order-independent. */
const orderedPair = (a: string, b: string, verb: 'link' | 'unlink'): [string, string] => {
  if (!a || !b || a === b) throw new DataError(`Provide two distinct contacts to ${verb}`);
  return a < b ? [a, b] : [b, a];
};

export const linkContacts = async (d: Db, a: string, b: string): Promise<void> => {
  const [lo, hi] = orderedPair(a, b, 'link');
  await getOwnedContact(d, lo);
  await getOwnedContact(d, hi);
  const [existing] = await d.all(
    'SELECT id FROM contact_links WHERE contact_a_id = ? AND contact_b_id = ?',
    [lo, hi]
  );
  if (existing) return;
  await d.run(
    'INSERT INTO contact_links (id, contact_a_id, contact_b_id, created_at) VALUES (?, ?, ?, ?)',
    [newId(), lo, hi, nowIso()]
  );
};

export const unlinkContacts = async (d: Db, a: string, b: string): Promise<void> => {
  const [lo, hi] = orderedPair(a, b, 'unlink');
  await d.run('DELETE FROM contact_links WHERE contact_a_id = ? AND contact_b_id = ?', [lo, hi]);
};

/**
 * Bulk-creates contacts from an address-book import. Never links anyone (a matching phone is not
 * consent to connect). Entries that match an existing contact or an earlier entry in the batch are
 * skipped, so re-running an import is harmless. Over-long fields are truncated, not rejected.
 */
export const importContacts = async (
  d: Db,
  entries: ContactInput[]
): Promise<ImportResult> => {
  if (entries.length > MAX_IMPORT_BATCH) {
    throw new DataError(`Import at most ${MAX_IMPORT_BATCH} contacts at a time`);
  }
  const existing = await d.all<ContactRow>('SELECT * FROM contacts');
  const knownPhones = new Set<string>();
  const knownNames = new Set<string>();
  for (const c of existing) {
    const key = phoneKey(c.phone_number);
    if (key) knownPhones.add(key);
    knownNames.add(nameKey(c.first_name, c.last_name));
  }

  const toCreate: { first: string; last: string; about: string; phone: string | null }[] = [];
  let skippedDuplicates = 0;
  let skippedInvalid = 0;
  for (const entry of entries) {
    if (!entry) {
      skippedInvalid++;
      continue;
    }
    let first = truncate(entry.firstName, MAX_NAME_LENGTH);
    let last = truncate(entry.lastName, MAX_NAME_LENGTH);
    if (first == null) {
      first = last;
      last = null;
    }
    if (first == null) {
      skippedInvalid++;
      continue;
    }
    const phone = cleanPhone(truncate(entry.phoneNumber, MAX_NAME_LENGTH));
    const key = phoneKey(phone);
    const name = nameKey(first, last);
    const duplicate = key != null ? knownPhones.has(key) : knownNames.has(name);
    if (duplicate) {
      skippedDuplicates++;
      continue;
    }
    if (key) knownPhones.add(key);
    knownNames.add(name);
    toCreate.push({ first, last: last ?? '', about: truncate(entry.about, MAX_TEXT_LENGTH) ?? '', phone });
  }

  if (existing.length + toCreate.length > MAX_CONTACTS) {
    throw new DataError(
      `Your graph can hold at most ${MAX_CONTACTS} people — this import would add ${toCreate.length} to your ${existing.length}`
    );
  }

  const ids: string[] = [];
  await d.transaction(async (tx) => {
    const now = nowIso();
    for (const c of toCreate) {
      const id = newId();
      ids.push(id);
      await tx.run(
        `INSERT INTO contacts (id, first_name, last_name, about, phone_number, note, strength, known_personally, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, '', ?, 1, ?, ?)`,
        [id, c.first, c.last, c.about, c.phone, DEFAULT_STRENGTH, now, now]
      );
    }
  });
  const created: GraphNode[] = [];
  for (const id of ids) created.push(await contactNode(d, id));
  return { created, skippedDuplicates, skippedInvalid };
};


/** Records that you worked with these people now. Unknown ids are ignored. */
export const touchContacts = async (d: Db, ids: string[]): Promise<void> => {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const now = nowIso();
  await d.transaction(async (tx) => {
    for (const id of unique) {
      await tx.run('UPDATE contacts SET last_interacted_at = ? WHERE id = ?', [now, id]);
    }
  });
};
