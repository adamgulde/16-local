// better-sqlite3-backed Db for Vitest. Runs the same migrations and queries as the device build.
import Database from 'better-sqlite3';
import { withTransactions, type Db, type SqlValue } from '../db';

export const openNodeDb = (): Db => {
  const raw = new Database(':memory:');
  return withTransactions({
    run: async (sql, params) => {
      raw.prepare(sql).run(...params);
    },
    all: async <T>(sql: string, params: SqlValue[]) => raw.prepare(sql).all(...params) as T[],
    exec: async (sql) => {
      raw.exec(sql);
    },
    begin: async () => {
      raw.exec('BEGIN');
    },
    commit: async () => {
      raw.exec('COMMIT');
    },
    rollback: async () => {
      raw.exec('ROLLBACK');
    },
  });
};
