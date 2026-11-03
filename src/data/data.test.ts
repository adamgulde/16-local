import { describe, it, expect, beforeEach } from 'vitest';
import { openNodeDb } from './testing/nodeDb';
import { initDataLayer, loadTaxonomy } from './store';
import { migrate, MIGRATIONS } from './migrate';
import type { Db } from './db';
import { createContact, patchContact, deleteContact, importContacts, linkContacts, unlinkContacts, upsertNote, MAX_CONTACTS, MAX_IMPORT_BATCH } from './contacts';
import { addTagToContact, getTagsForContact, getAllTags, removeTagFromContact, MAX_TAGS_PER_CONTACT } from './tags';
import { buildGraph, updateSelfProfile } from './graph';
import { cleanPhone, phoneKey } from './phone';
import { DataError } from './errors';
import type { Taxonomy } from './taxonomy';

let d: Db;
let tax: Taxonomy;

beforeEach(async () => {
  d = openNodeDb();
  await initDataLayer(d);
  tax = await loadTaxonomy(d);
});

const find = (label: string, level?: number) => {
  const n = tax.ordered.find((t) => t.label === label && (level === undefined || t.level === level));
  if (!n) throw new Error(`no tag ${label}`);
  return n;
};

describe('phone normalization', () => {
  it('formats US numbers like the server did', () => {
    expect(cleanPhone('5551234567')).toBe('+1 555-123-4567');
    expect(cleanPhone('+1 (555) 123-4567')).toBe('+1 555-123-4567');
    expect(cleanPhone('  ')).toBeNull();
    expect(cleanPhone('+44 20 7946 0958')).toBe('+44 20 7946 0958');
  });
  it('dedupes on the last 10 digits', () => {
    expect(phoneKey('+1 555-123-4567')).toBe(phoneKey('(555) 123-4567'));
    expect(phoneKey('123')).toBeNull();
  });
});

describe('contacts', () => {
  it('creates with default strength 3 and returns a placeholder node', async () => {
    const c = await createContact(d, { firstName: '  Ada ', lastName: 'Lovelace', phoneNumber: '5550001111' });
    expect(c).toMatchObject({ firstName: 'Ada', lastName: 'Lovelace', kind: 'PLACEHOLDER', strength: 5.5, phoneNumber: '+1 555-000-1111', tags: [] });
  });

  it('requires a first name and enforces length limits', async () => {
    await expect(createContact(d, { firstName: '   ' })).rejects.toThrow('First name is required');
    await expect(createContact(d, { firstName: 'x'.repeat(101) })).rejects.toThrow('100 characters');
  });

  it('accepts decimal closeness from 1 to 10 and rejects anything outside', async () => {
    const c = await createContact(d, { firstName: 'Bo', strength: 7.35 });
    expect(c.strength).toBe(7.35);
    await expect(createContact(d, { firstName: 'Bo', strength: 0.9 })).rejects.toBeInstanceOf(DataError);
    await expect(createContact(d, { firstName: 'Bo', strength: 10.1 })).rejects.toBeInstanceOf(DataError);
    await expect(createContact(d, { firstName: 'Bo', strength: NaN })).rejects.toBeInstanceOf(DataError);
    const moved = await patchContact(d, c.id, { strength: 1 });
    expect(moved.strength).toBe(1);
  });

  it('patch leaves unspecified fields alone and clears phone on blank', async () => {
    const c = await createContact(d, { firstName: 'Cy', lastName: 'Ng', about: 'Runs', phoneNumber: '5550002222' });
    const p = await patchContact(d, c.id, { about: 'Runs marathons' });
    expect(p).toMatchObject({ firstName: 'Cy', lastName: 'Ng', about: 'Runs marathons', phoneNumber: '+1 555-000-2222' });
    const cleared = await patchContact(d, c.id, { phoneNumber: '' });
    expect(cleared.phoneNumber).toBeNull();
  });

  it('returns 404 for unknown contacts', async () => {
    await expect(patchContact(d, 'nope', { about: 'x' })).rejects.toMatchObject({ status: 404 });
    await expect(deleteContact(d, 'nope')).rejects.toMatchObject({ status: 404 });
  });

  it('stores notes and rejects oversize ones', async () => {
    const c = await createContact(d, { firstName: 'Di' });
    await upsertNote(d, c.id, 'met at conf');
    expect((await buildGraph(d)).nodes.find((n) => n.id === c.id)?.note).toBe('met at conf');
    await expect(upsertNote(d, c.id, 'x'.repeat(10_001))).rejects.toThrow('Note must be');
  });

  it('deleting a contact removes its links and tags', async () => {
    const a = await createContact(d, { firstName: 'A' });
    const b = await createContact(d, { firstName: 'B' });
    await linkContacts(d, a.id, b.id);
    await addTagToContact(d, a.id, { tagId: find('Coffee', undefined).id });
    await deleteContact(d, a.id);
    const g = await buildGraph(d);
    expect(g.edges.filter((e) => e.kind === 'LINK')).toHaveLength(0);
    expect(g.nodes.map((n) => n.id)).not.toContain(a.id);
  });
});

describe('import', () => {
  it('skips duplicates by phone and by name, including within the batch', async () => {
    await createContact(d, { firstName: 'Eve', lastName: 'Park', phoneNumber: '5553334444' });
    const r = await importContacts(d, [
      { firstName: 'Eve', phoneNumber: '(555) 333-4444' }, // phone match
      { firstName: 'Finn', lastName: 'Shaw' },
      { firstName: 'finn   shaw' }, // name match inside batch
      { firstName: 'Gia' },
      { lastName: 'OnlyLast' }, // becomes first name
      { firstName: '   ' }, // invalid
    ]);
    expect(r.skippedDuplicates).toBe(2);
    expect(r.skippedInvalid).toBe(1);
    expect(r.created.map((c) => c.firstName)).toEqual(['Finn', 'Gia', 'OnlyLast']);
    expect(r.created.every((c) => c.kind === 'PLACEHOLDER' && c.strength === 5.5)).toBe(true);
  });

  it('truncates over-long fields instead of rejecting', async () => {
    const r = await importContacts(d, [{ firstName: 'z'.repeat(150) }]);
    expect(r.created[0].firstName).toHaveLength(100);
  });

  it('rejects batches over the per-call limit', async () => {
    const batch = Array.from({ length: MAX_IMPORT_BATCH + 1 }, (_, i) => ({ firstName: `P${i}` }));
    await expect(importContacts(d, batch)).rejects.toThrow(`at most ${MAX_IMPORT_BATCH}`);
  });

  it('enforces the total graph cap', async () => {
    // Fill to the cap in batches, then one more should fail.
    for (let start = 0; start < MAX_CONTACTS; start += MAX_IMPORT_BATCH) {
      const n = Math.min(MAX_IMPORT_BATCH, MAX_CONTACTS - start);
      await importContacts(d, Array.from({ length: n }, (_, i) => ({ firstName: `Full${start + i}` })));
    }
    await expect(importContacts(d, [{ firstName: 'Over' }])).rejects.toThrow(`at most ${MAX_CONTACTS}`);
  }, 60_000);
});

describe('links', () => {
  it('stores each pair once regardless of argument order', async () => {
    const a = await createContact(d, { firstName: 'A' });
    const b = await createContact(d, { firstName: 'B' });
    await linkContacts(d, a.id, b.id);
    await linkContacts(d, b.id, a.id);
    const links = (await buildGraph(d)).edges.filter((e) => e.kind === 'LINK');
    expect(links).toHaveLength(1);
    await unlinkContacts(d, b.id, a.id);
    expect((await buildGraph(d)).edges.filter((e) => e.kind === 'LINK')).toHaveLength(0);
  });

  it('refuses self-links and unknown contacts', async () => {
    const a = await createContact(d, { firstName: 'A' });
    await expect(linkContacts(d, a.id, a.id)).rejects.toThrow('two distinct');
    await expect(linkContacts(d, a.id, 'missing')).rejects.toMatchObject({ status: 404 });
  });
});

describe('tags', () => {
  it('lists the dictionary with paths and selectability', async () => {
    const all = await getAllTags(d);
    expect(all.length).toBe(455);
    const cat = all.find((t) => t.level === 1)!;
    expect(cat.selectable).toBe(false);
    const leaf = all.find((t) => t.level > 1 && t.selectable)!;
    expect(leaf.fullPath).toContain(' › ');
  });

  it('applies a dictionary tag and a custom label under a category', async () => {
    const c = await createContact(d, { firstName: 'Hal' });
    const education = find('Education', 1);
    const first = await addTagToContact(d, c.id, { tagId: find('High School').id });
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ category: 'Education', label: 'High School', tagId: expect.any(String) });
    const custom = await addTagToContact(d, c.id, { customLabel: 'Night school', parentTagId: education.id });
    expect(custom.map((t) => t.label).sort()).toEqual(['High School', 'Night school']);
    await expect(addTagToContact(d, c.id, { customLabel: 'night SCHOOL', parentTagId: education.id })).rejects.toThrow('already applied');
  });

  it('rejects tagging with a category, a duplicate, or both/neither inputs', async () => {
    const c = await createContact(d, { firstName: 'Ivy' });
    const category = find('Education', 1);
    await expect(addTagToContact(d, c.id, { tagId: category.id })).rejects.toThrow('within this category');
    await expect(addTagToContact(d, c.id, {})).rejects.toThrow('either a tagId or a customLabel');
    await expect(addTagToContact(d, c.id, { tagId: category.id, customLabel: 'x' })).rejects.toThrow('not both');
    const hs = find('High School');
    await addTagToContact(d, c.id, { tagId: hs.id });
    await expect(addTagToContact(d, c.id, { tagId: hs.id })).rejects.toThrow('already applied');
  });

  it('replaces the earlier choice within a single-select group', async () => {
    const c = await createContact(d, { firstName: 'Jo' });
    const age1 = tax.ordered.find((t) => t.label === '18–29')!;
    const age2 = tax.ordered.find((t) => t.label === '30–39')!;
    await addTagToContact(d, c.id, { tagId: age1.id });
    const after = await addTagToContact(d, c.id, { tagId: age2.id });
    expect(after.map((t) => t.label)).toEqual(['30–39']);
  });

  it('caps tags per contact and removes assignments', async () => {
    const c = await createContact(d, { firstName: 'Kai' });
    const picks = tax.ordered.filter((t) => tax.isSelectable(t) && !tax.singleSelectGroup(t.id)).slice(0, MAX_TAGS_PER_CONTACT);
    for (const p of picks) await addTagToContact(d, c.id, { tagId: p.id });
    const extra = tax.ordered.find((t) => tax.isSelectable(t) && !picks.includes(t) && !tax.singleSelectGroup(t.id))!;
    await expect(addTagToContact(d, c.id, { tagId: extra.id })).rejects.toThrow('maximum');
    const [first] = await getTagsForContact(d, c.id);
    await removeTagFromContact(d, c.id, first.id);
    expect(await getTagsForContact(d, c.id)).toHaveLength(MAX_TAGS_PER_CONTACT - 1);
  });
});

describe('graph', () => {
  it('builds you at the centre with direct edges and links', async () => {
    await updateSelfProfile(d, { firstName: 'Me', lastName: 'Myself' });
    const a = await createContact(d, { firstName: 'A', strength: 9 });
    const b = await createContact(d, { firstName: 'B', strength: 1 });
    await linkContacts(d, a.id, b.id);
    const g = await buildGraph(d);
    const self = g.nodes.find((n) => n.kind === 'SELF')!;
    expect(self).toMatchObject({ id: 'self', firstName: 'Me', strength: 10 });
    expect(g.edges.filter((e) => e.kind === 'DIRECT').map((e) => e.target).sort()).toEqual([a.id, b.id].sort());
    expect(g.edges.find((e) => e.kind === 'LINK')).toBeDefined();
    expect(g.nodes.find((n) => n.id === b.id)?.strength).toBe(1);
  });

  it('seeds the tag dictionary only once across re-initialisation', async () => {
    await initDataLayer(d);
    const [{ n }] = await d.all<{ n: number }>('SELECT COUNT(*) AS n FROM tags');
    expect(n).toBe(455);
  });
});

describe('closeness migration (002) and later', () => {
  it('rescales 1–5 values to 1–10 and keeps links and tags attached', async () => {
    // Build a database at schema version 1 with the old 1–5 integer closeness.
    const raw = openNodeDb();
    await raw.exec('PRAGMA foreign_keys = ON');
    await raw.exec(MIGRATIONS[0].sql);
    await raw.exec('PRAGMA user_version = 1');
    const seed = (await import('./seed/tags.json')).default as { id: string }[];
    await raw.run(`INSERT INTO tags (id, category, label, parent_id, level, icon, display_order, self_only, single_select) VALUES (?, 'C', 'T', NULL, 2, NULL, 0, 0, 0)`, [seed[0].id]);
    const now = '2026-01-01T00:00:00Z';
    for (const [id, strength] of [['00000000-0000-4000-8000-000000000001', 1], ['00000000-0000-4000-8000-000000000002', 2], ['00000000-0000-4000-8000-000000000003', 3], ['00000000-0000-4000-8000-000000000004', 4], ['00000000-0000-4000-8000-000000000005', 5]] as const) {
      await raw.run(`INSERT INTO contacts (id, first_name, strength, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`, [id, id.slice(-1), strength, now, now]);
    }
    await raw.run(`INSERT INTO contact_links (id, contact_a_id, contact_b_id, created_at) VALUES ('l1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', ?)`, [now]);
    await raw.run(`INSERT INTO contact_tags (id, contact_id, tag_id) VALUES ('t1', '00000000-0000-4000-8000-000000000003', ?)`, [seed[0].id]);

    await migrate(raw);

    const rows = await raw.all<{ id: string; strength: number }>('SELECT id, strength FROM contacts ORDER BY id');
    expect(rows.map((r) => r.strength)).toEqual([1, 3.25, 5.5, 7.75, 10]);
    expect(await raw.all('SELECT * FROM contact_links')).toHaveLength(1);
    expect(await raw.all('SELECT * FROM contact_tags')).toHaveLength(1);
    const [{ user_version }] = await raw.all<{ user_version: number }>('PRAGMA user_version');
    expect(user_version).toBe(MIGRATIONS.length);
  });
});

describe('people you don’t know personally (003)', () => {
  it('adds the person with no direct edge from you, but keeps them in the graph', async () => {
    const stranger = await createContact(d, { firstName: 'Ivo', knownPersonally: false });
    expect(stranger.knownPersonally).toBe(false);
    const g = await buildGraph(d);
    expect(g.nodes.map((n) => n.id)).toContain(stranger.id);
    expect(g.edges.some((e) => e.target === stranger.id && e.kind === 'DIRECT')).toBe(false);
  });

  it('defaults to someone you know, with a direct edge from you', async () => {
    const friend = await createContact(d, { firstName: 'Jun' });
    expect(friend.knownPersonally).toBe(true);
    expect((await buildGraph(d)).edges).toContainEqual({ source: 'self', target: friend.id, kind: 'DIRECT' });
  });

  it('a stranger can still be linked to someone you know', async () => {
    const friend = await createContact(d, { firstName: 'Kit' });
    const stranger = await createContact(d, { firstName: 'Lu', knownPersonally: false });
    await linkContacts(d, friend.id, stranger.id);
    expect((await buildGraph(d)).edges.some((e) => e.kind === 'LINK')).toBe(true);
  });
});
