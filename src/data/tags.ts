// Tags: one global list that you type yourself. Any contact can carry any tag; tags are matched
// case-insensitively, so "Climbing" and "climbing" are the same tag.
import type { Db } from './db';
import { DataError, notFound } from './errors';
import { newId, nowIso } from './ids';
import type { Tag, TagInput } from './types';

export const MAX_TAGS_PER_CONTACT = 40;
export const MAX_TAG_LENGTH = 60;

/** Trims and collapses inner spaces. Throws if the result is empty or too long. */
export const normaliseTagLabel = (raw: string): string => {
  const label = raw.trim().replace(/\s+/g, ' ');
  if (!label) throw new DataError('Type a tag first');
  if (label.length > MAX_TAG_LENGTH) throw new DataError(`Tags are limited to ${MAX_TAG_LENGTH} characters`);
  return label;
};

/** Every tag in the global list, A to Z. Used for suggestions and search. */
export const listTags = async (d: Db): Promise<Tag[]> =>
  d.all<Tag>('SELECT id, label FROM tags ORDER BY label COLLATE NOCASE');

export const getTagsForContact = async (d: Db, contactId: string): Promise<Tag[]> =>
  d.all<Tag>(
    `SELECT t.id, t.label FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id
     WHERE ct.contact_id = ? ORDER BY t.label COLLATE NOCASE`,
    [contactId]
  );

/** Tags for every contact in one query, keyed by contact id (used to build the graph). */
export const getTagsByContact = async (d: Db): Promise<Map<string, Tag[]>> => {
  const rows = await d.all<Tag & { contact_id: string }>(
    `SELECT ct.contact_id, t.id, t.label FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id
     ORDER BY t.label COLLATE NOCASE`
  );
  const out = new Map<string, Tag[]>();
  for (const r of rows) {
    const list = out.get(r.contact_id) ?? [];
    list.push({ id: r.id, label: r.label });
    out.set(r.contact_id, list);
  }
  return out;
};

/**
 * Applies a tag to a contact. Give a tagId to reuse an existing tag, or a label: an existing tag with
 * the same name (ignoring case) is reused, otherwise a new global tag is created. Returns the
 * contact's tags after the change.
 */
export const addTagToContact = async (d: Db, contactId: string, input: TagInput): Promise<Tag[]> => {
  const [contact] = await d.all<{ id: string }>('SELECT id FROM contacts WHERE id = ?', [contactId]);
  if (!contact) throw notFound('Contact');

  await d.transaction(async (tx) => {
    let tagId = input.tagId ?? null;
    if (tagId) {
      const [exists] = await tx.all<{ id: string }>('SELECT id FROM tags WHERE id = ?', [tagId]);
      if (!exists) throw notFound('Tag');
    } else {
      if (input.label == null) throw new DataError('Type a tag first');
      const label = normaliseTagLabel(input.label);
      const [existing] = await tx.all<{ id: string }>('SELECT id FROM tags WHERE label = ? COLLATE NOCASE', [label]);
      if (existing) {
        tagId = existing.id;
      } else {
        tagId = newId();
        await tx.run('INSERT INTO tags (id, label, created_at) VALUES (?, ?, ?)', [tagId, label, nowIso()]);
      }
    }

    const [{ n }] = await tx.all<{ n: number }>('SELECT COUNT(*) AS n FROM contact_tags WHERE contact_id = ?', [contactId]);
    const [already] = await tx.all<{ n: number }>(
      'SELECT COUNT(*) AS n FROM contact_tags WHERE contact_id = ? AND tag_id = ?',
      [contactId, tagId]
    );
    if (already.n > 0) throw new DataError('This tag is already applied');
    if (n >= MAX_TAGS_PER_CONTACT) throw new DataError(`A person can have at most ${MAX_TAGS_PER_CONTACT} tags`);

    await tx.run('INSERT INTO contact_tags (contact_id, tag_id, created_at) VALUES (?, ?, ?)', [contactId, tagId, nowIso()]);
  });
  return getTagsForContact(d, contactId);
};

export const removeTagFromContact = async (d: Db, contactId: string, tagId: string): Promise<void> => {
  await d.run('DELETE FROM contact_tags WHERE contact_id = ? AND tag_id = ?', [contactId, tagId]);
};
