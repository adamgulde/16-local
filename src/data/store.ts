import type { Db } from './db';
import { migrate } from './migrate';

let current: Db | null = null;

/**
 * Opens the data layer on `db` and applies any pending migrations. Call once at startup, before any
 * other data function.
 */
export const initDataLayer = async (db: Db): Promise<void> => {
  await migrate(db);
  current = db;
};

/** The active handle. Throws if initDataLayer hasn't run. */
export const db = (): Db => {
  if (!current) throw new Error('Data layer is not initialised — call initDataLayer first');
  return current;
};
