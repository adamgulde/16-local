// Port of TagService / ContactTagService (backend). Contacts are the only subjects locally.
import type { Db } from './db';
import { DataError, notFound } from './errors';
import { newId } from './ids';
import { loadTaxonomy } from './store';
import type { Taxonomy, TagNode } from './taxonomy';
import { UNCATEGORIZED, PATH_SEPARATOR } from './taxonomy';
import type { Tag, TagAssignment, TagInput } from './types';

export const MAX_TAGS_PER_CONTACT = 40;
export const MAX_CUSTOM_LABEL_LENGTH = 60;

interface ContactTagRow {
  id: string;
  contact_id: string;
  tag_id: string | null;
  parent_tag_id: string | null;
  custom_category: string | null;
  custom_label: string | null;
}

/** The whole dictionary, depth-first, for the tag picker. */
export const getAllTags = async (d: Db): Promise<Tag[]> => {
  const tax = await loadTaxonomy(d);
  return tax.ordered.map((n) => {
    const root = tax.root(n.id);
    return {
      id: n.id,
      category: root?.label ?? n.label,
      label: n.label,
      parentId: n.parentId,
      level: n.level,
      icon: root?.icon ?? null,
      displayOrder: n.displayOrder,
      fullPath: tax.path(n.id),
      hasChildren: tax.hasChildren(n.id),
      selectable: tax.isSelectable(n),
    };
  });
};

/** Maps a stored assignment to the shape the UI renders (ports TagAssignmentResponse.from). */
const toAssignment = (row: ContactTagRow, tax: Taxonomy): TagAssignment => {
  const isDictionary = row.tag_id != null;
  const anchorId = isDictionary ? row.tag_id : row.parent_tag_id;
  const anchor = tax.get(anchorId);
  const base = { id: row.id, isSelfTag: false, isMine: true, kind: 'PRIVATE' as const };

  if (!anchor) {
    const legacy = row.custom_category?.trim() ? row.custom_category : null;
    return {
      ...base,
      category: legacy ?? UNCATEGORIZED,
      label: row.custom_label ?? '',
      tagId: null,
      parentId: null,
      level: 1,
      icon: null,
      fullPath: legacy ? `${legacy}${PATH_SEPARATOR}${row.custom_label ?? ''}` : row.custom_label ?? '',
    };
  }

  const root = tax.root(anchor.id)!;
  const anchorPath = tax.path(anchor.id);
  return {
    ...base,
    category: root.label,
    label: isDictionary ? anchor.label : row.custom_label ?? '',
    tagId: isDictionary ? row.tag_id : null,
    parentId: isDictionary ? anchor.parentId : anchor.id,
    level: isDictionary ? anchor.level : anchor.level + 1,
    icon: root.icon,
    fullPath: isDictionary ? anchorPath : `${anchorPath}${PATH_SEPARATOR}${row.custom_label ?? ''}`,
  };
};

const anchorOf = (row: ContactTagRow): string | null => row.tag_id ?? row.parent_tag_id;

export const getTagsForContact = async (d: Db, contactId: string): Promise<TagAssignment[]> => {
  const tax = await loadTaxonomy(d);
  const rows = await d.all<ContactTagRow>('SELECT * FROM contact_tags WHERE contact_id = ?', [contactId]);
  return rows.map((r) => toAssignment(r, tax));
};

/** Tags for every contact in one query, keyed by contact id (used to build the graph). */
export const getTagsByContact = async (d: Db): Promise<Map<string, TagAssignment[]>> => {
  const tax = await loadTaxonomy(d);
  const rows = await d.all<ContactTagRow>('SELECT * FROM contact_tags');
  const out = new Map<string, TagAssignment[]>();
  for (const r of rows) {
    const list = out.get(r.contact_id) ?? [];
    list.push(toAssignment(r, tax));
    out.set(r.contact_id, list);
  }
  return out;
};

/**
 * Applies a dictionary tag or a custom label to a contact and returns the contact's full tag list.
 * A single-select group (e.g. one age range) replaces the earlier choice in that group.
 */
export const addTagToContact = async (d: Db, contactId: string, input: TagInput): Promise<TagAssignment[]> => {
  const [contact] = await d.all<{ id: string }>('SELECT id FROM contacts WHERE id = ?', [contactId]);
  if (!contact) throw notFound('Contact');

  const tax = await loadTaxonomy(d);
  const label = input.customLabel?.trim() ? input.customLabel.trim() : null;
  const tagId = input.tagId ?? null;
  const parentTagId = input.parentTagId ?? null;

  if (tagId == null && label == null) throw new DataError('Provide either a tagId or a customLabel');
  if (tagId != null && label != null) throw new DataError('Provide either a tagId or a customLabel, not both');
  if (label != null && label.length > MAX_CUSTOM_LABEL_LENGTH) {
    throw new DataError(`Custom tags are limited to ${MAX_CUSTOM_LABEL_LENGTH} characters`);
  }

  const anchorId = tagId ?? parentTagId;
  let anchor: TagNode | undefined;
  if (anchorId != null) {
    anchor = tax.get(anchorId);
    if (!anchor) throw notFound('Tag');
  }
  if (tagId != null && anchor && !tax.isSelectable(anchor)) {
    throw new DataError('Pick a tag within this category');
  }

  const existing = await d.all<ContactTagRow>('SELECT * FROM contact_tags WHERE contact_id = ?', [contactId]);
  if (tagId != null && existing.some((t) => t.tag_id === tagId)) {
    throw new DataError('This tag is already applied');
  }
  const parentId = anchor?.id ?? null;
  if (
    label != null &&
    existing.some((t) => t.custom_label?.toLowerCase() === label.toLowerCase() && anchorOf(t) === parentId)
  ) {
    throw new DataError('This custom tag is already applied');
  }

  const group = anchor ? tax.singleSelectGroup(anchor.id) : undefined;
  const replaced = group
    ? existing.filter((t) => {
        const a = anchorOf(t);
        return a != null && tax.subtree(group.id).has(a);
      })
    : [];
  if (existing.length - replaced.length >= MAX_TAGS_PER_CONTACT) {
    throw new DataError('Already at the maximum number of tags for this contact');
  }

  await d.transaction(async (tx) => {
    for (const r of replaced) {
      await tx.run('DELETE FROM contact_tags WHERE id = ?', [r.id]);
    }
    await tx.run(
      `INSERT INTO contact_tags (id, contact_id, tag_id, parent_tag_id, custom_category, custom_label)
       VALUES (?, ?, ?, ?, NULL, ?)`,
      [newId(), contactId, tagId, tagId == null ? parentId : null, label]
    );
  });
  return getTagsForContact(d, contactId);
};

export const removeTagFromContact = async (d: Db, contactId: string, assignmentId: string): Promise<void> => {
  await d.run('DELETE FROM contact_tags WHERE id = ? AND contact_id = ?', [assignmentId, contactId]);
};
