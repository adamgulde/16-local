import type { Db } from './db';
import { migrate } from './migrate';
import { Taxonomy, type TagRow } from './taxonomy';
import seedTags from './seed/tags.json';

interface SeedTag {
  id: string;
  category: string;
  label: string;
  parentId: string | null;
  level: number;
  icon: string | null;
  displayOrder: number;
  selfOnly: boolean;
  singleSelect: boolean;
}

let current: Db | null = null;
const taxonomyCache = new WeakMap<Db, Taxonomy>();

/**
 * Opens the data layer on `db`: applies migrations and loads the bundled tag dictionary the first
 * time. Call once at startup, before any other data function.
 */
export const initDataLayer = async (db: Db): Promise<void> => {
  await migrate(db);
  await seedTagsIfEmpty(db);
  current = db;
};

/** The active handle. Throws if initDataLayer hasn't run. */
export const db = (): Db => {
  if (!current) throw new Error('Data layer is not initialised — call initDataLayer first');
  return current;
};

const seedTagsIfEmpty = async (d: Db): Promise<void> => {
  const [{ n }] = await d.all<{ n: number }>('SELECT COUNT(*) AS n FROM tags');
  if (n > 0) return;
  await d.transaction(async (tx) => {
    // The seed is ordered parents-first, so the parent_id foreign key is satisfied as we go.
    for (const t of seedTags as SeedTag[]) {
      await tx.run(
        `INSERT INTO tags (id, category, label, parent_id, level, icon, display_order, self_only, single_select)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [t.id, t.category, t.label, t.parentId, t.level, t.icon, t.displayOrder, t.singleSelect ? 1 : 0]
      );
    }
  });
};

/** The tag dictionary as a tree, cached per handle (the dictionary never changes at runtime). */
export const loadTaxonomy = async (d: Db = db()): Promise<Taxonomy> => {
  const cached = taxonomyCache.get(d);
  if (cached) return cached;
  const rows = await d.all<TagRow>('SELECT * FROM tags ORDER BY display_order, label');
  const taxonomy = new Taxonomy(rows);
  taxonomyCache.set(d, taxonomy);
  return taxonomy;
};

