import { describe, it, expect, beforeEach } from 'vitest';
import { openNodeDb } from './testing/nodeDb';
import { initDataLayer } from './store';
import { migrate, MIGRATIONS } from './migrate';
import type { Db } from './db';
import { createContact, patchContact, deleteContact, importContacts, linkContacts, unlinkContacts, upsertNote, MAX_CONTACTS, MAX_IMPORT_BATCH } from './contacts';
import { addTagToContact, getTagsForContact, getTagsByContact, listTags, removeTagFromContact, MAX_TAGS_PER_CONTACT, MAX_TAG_LENGTH } from './tags';
import { buildGraph, updateSelfProfile } from './graph';
import { cleanPhone, phoneKey } from './phone';
import { DataError } from './errors';

let d: Db;

beforeEach(async () => {
  d = openNodeDb();
  await initDataLayer(d);
});

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
    await addTagToContact(d, a.id, { label: 'Coffee' });
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
  it('creates a tag by typing it and applies it to a contact', async () => {
    const c = await createContact(d, { firstName: 'Hal' });
    const tags = await addTagToContact(d, c.id, { label: 'Climbing' });
    expect(tags).toEqual([expect.objectContaining({ label: 'Climbing' })]);
    expect((await listTags(d)).map((t) => t.label)).toEqual(['Climbing']);
  });

  it('reuses an existing tag when the name matches, ignoring case and extra spaces', async () => {
    const a = await createContact(d, { firstName: 'A' });
    const b = await createContact(d, { firstName: 'B' });
    await addTagToContact(d, a.id, { label: 'Climbing' });
    await addTagToContact(d, b.id, { label: '  climbing   ' });
    expect(await listTags(d)).toHaveLength(1);
    const byContact = await getTagsByContact(d);
    expect(byContact.get(a.id)?.[0].id).toBe(byContact.get(b.id)?.[0].id);
  });

  it('applies an existing tag by id', async () => {
    const a = await createContact(d, { firstName: 'A' });
    const b = await createContact(d, { firstName: 'B' });
    await addTagToContact(d, a.id, { label: 'Chess' });
    const [chess] = await listTags(d);
    await addTagToContact(d, b.id, { tagId: chess.id });
    expect((await getTagsForContact(d, b.id)).map((t) => t.label)).toEqual(['Chess']);
  });

  it('refuses a tag a person already has, a blank tag, and an over-long tag', async () => {
    const c = await createContact(d, { firstName: 'Ivy' });
    await addTagToContact(d, c.id, { label: 'Jazz' });
    await expect(addTagToContact(d, c.id, { label: 'jazz' })).rejects.toThrow('already applied');
    await expect(addTagToContact(d, c.id, { label: '   ' })).rejects.toThrow('Type a tag first');
    await expect(addTagToContact(d, c.id, { label: 'x'.repeat(MAX_TAG_LENGTH + 1) })).rejects.toThrow(`${MAX_TAG_LENGTH} characters`);
  });

  it('caps the number of tags on one person', async () => {
    const c = await createContact(d, { firstName: 'Kai' });
    for (let i = 0; i < MAX_TAGS_PER_CONTACT; i++) await addTagToContact(d, c.id, { label: `Tag ${i}` });
    await expect(addTagToContact(d, c.id, { label: 'One more' })).rejects.toThrow('at most');
  });

  it('removes a tag from one person but keeps it in the global list', async () => {
    const c = await createContact(d, { firstName: 'Lee' });
    await addTagToContact(d, c.id, { label: 'Tea' });
    const [tea] = await getTagsForContact(d, c.id);
    await removeTagFromContact(d, c.id, tea.id);
    expect(await getTagsForContact(d, c.id)).toHaveLength(0);
    expect(await listTags(d)).toHaveLength(1);
  });

  it('deleting a person removes their tag assignments', async () => {
    const c = await createContact(d, { firstName: 'Max' });
    await addTagToContact(d, c.id, { label: 'Hiking' });
    await deleteContact(d, c.id);
    const [{ n }] = await d.all<{ n: number }>('SELECT COUNT(*) AS n FROM contact_tags');
    expect(n).toBe(0);
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

});

describe('migrations 002–004', () => {
  it('rescales 1–5 values, keeps links, drops seeded tags and keeps typed tags as global', async () => {
    // Build a database at schema version 1 with the old 1–5 integer closeness.
    const raw = openNodeDb();
    await raw.exec('PRAGMA foreign_keys = ON');
    await raw.exec(MIGRATIONS[0].sql);
    await raw.exec('PRAGMA user_version = 1');
    await raw.run(`INSERT INTO tags (id, category, label, parent_id, level, icon, display_order, self_only, single_select) VALUES ('seeded-1', 'C', 'T', NULL, 2, NULL, 0, 0, 0)`);
    const now = '2026-01-01T00:00:00Z';
    for (const [id, strength] of [['00000000-0000-4000-8000-000000000001', 1], ['00000000-0000-4000-8000-000000000002', 2], ['00000000-0000-4000-8000-000000000003', 3], ['00000000-0000-4000-8000-000000000004', 4], ['00000000-0000-4000-8000-000000000005', 5]] as const) {
      await raw.run(`INSERT INTO contacts (id, first_name, strength, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`, [id, id.slice(-1), strength, now, now]);
    }
    await raw.run(`INSERT INTO contact_links (id, contact_a_id, contact_b_id, created_at) VALUES ('l1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', ?)`, [now]);
    await raw.run(`INSERT INTO contact_tags (id, contact_id, tag_id) VALUES ('t1', '00000000-0000-4000-8000-000000000003', 'seeded-1')`);
    await raw.run(`INSERT INTO contact_tags (id, contact_id, custom_label) VALUES ('t2', '00000000-0000-4000-8000-000000000004', 'Climbing')`);
    await raw.run(`INSERT INTO contact_tags (id, contact_id, custom_label) VALUES ('t3', '00000000-0000-4000-8000-000000000005', 'climbing')`);

    await migrate(raw);

    const rows = await raw.all<{ id: string; strength: number }>('SELECT id, strength FROM contacts ORDER BY id');
    expect(rows.map((r) => r.strength)).toEqual([1, 3.25, 5.5, 7.75, 10]);
    expect(await raw.all('SELECT * FROM contact_links')).toHaveLength(1);
    // Seeded assignments are gone; the two typed "climbing" labels became one global tag.
    expect((await raw.all<{ label: string }>('SELECT label FROM tags')).map((t) => t.label)).toEqual(['Climbing']);
    expect(await raw.all('SELECT * FROM contact_tags')).toHaveLength(2);
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
