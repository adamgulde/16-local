import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import { withTransactions, type Db, type SqlValue } from './db';

const DATABASE_NAME = '16local';

/** Opens (creating if needed) the on-device database and returns the data-layer handle. */
export const openCapacitorDb = async (): Promise<Db> => {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const conn: SQLiteDBConnection = await sqlite.createConnection(DATABASE_NAME, false, 'no-encryption', 1, false);
  await conn.open();

  return withTransactions({
    run: async (sql, params) => {
      await conn.run(sql, params as SqlValue[], false);
    },
    all: async <T>(sql: string, params: SqlValue[]) => {
      const result = await conn.query(sql, params);
      return (result.values ?? []) as T[];
    },
    exec: async (sql) => {
      await conn.execute(sql, false);
    },
    begin: async () => {
      await conn.beginTransaction();
    },
    commit: async () => {
      await conn.commitTransaction();
    },
    rollback: async () => {
      await conn.rollbackTransaction();
    },
  });
};
