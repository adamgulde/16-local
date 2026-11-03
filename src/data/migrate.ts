import type { Db } from './db';
import init001 from './migrations/001_init.sql?raw';
import closenessScale002 from './migrations/002_closeness_scale.sql?raw';
import knownPersonally003 from './migrations/003_known_personally.sql?raw';
import globalTags004 from './migrations/004_global_tags.sql?raw';

interface Migration {
  sql: string;
  /** Rebuilds a table that other tables reference. Runs with foreign keys off, then checks integrity. */
  rebuildsReferencedTable?: boolean;
}

// Ordered, append-only. Never edit a shipped migration; add a new numbered entry instead.
export const MIGRATIONS: readonly Migration[] = [
  { sql: init001 },
  { sql: closenessScale002, rebuildsReferencedTable: true },
  { sql: knownPersonally003 },
  { sql: globalTags004 },
];

/** Applies pending migrations, tracked in SQLite's user_version pragma. Idempotent. */
export const migrate = async (db: Db): Promise<number> => {
  await db.exec('PRAGMA foreign_keys = ON');
  const [{ user_version: current }] = await db.all<{ user_version: number }>('PRAGMA user_version');
  for (let v = current; v < MIGRATIONS.length; v++) {
    const m = MIGRATIONS[v];
    // foreign_keys can only be changed outside a transaction, so it's switched around the migration.
    if (m.rebuildsReferencedTable) await db.exec('PRAGMA foreign_keys = OFF');
    try {
      await db.transaction(async (tx) => {
        await tx.exec(m.sql);
        if (m.rebuildsReferencedTable) {
          const broken = await tx.all<{ table: string }>('PRAGMA foreign_key_check');
          if (broken.length > 0) throw new Error(`Migration ${v + 1} left broken references: ${broken[0].table}`);
        }
        await tx.exec(`PRAGMA user_version = ${v + 1}`);
      });
    } finally {
      if (m.rebuildsReferencedTable) await db.exec('PRAGMA foreign_keys = ON');
    }
  }
  return MIGRATIONS.length;
};
