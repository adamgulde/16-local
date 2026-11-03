import type { Db } from './db';
import init001 from './migrations/001_init.sql?raw';

// Ordered, append-only. Never edit a shipped migration; add a new numbered entry instead.
export const MIGRATIONS: readonly string[] = [init001];

/** Applies pending migrations, tracked in SQLite's user_version pragma. Idempotent. */
export const migrate = async (db: Db): Promise<number> => {
  await db.exec('PRAGMA foreign_keys = ON');
  const [{ user_version: current }] = await db.all<{ user_version: number }>('PRAGMA user_version');
  for (let v = current; v < MIGRATIONS.length; v++) {
    await db.transaction(async (tx) => {
      await tx.exec(MIGRATIONS[v]);
      await tx.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
  return MIGRATIONS.length;
};
