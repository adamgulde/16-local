// Storage-agnostic handle the data layer runs against. The app uses the Capacitor SQLite
// implementation (capacitorDb.ts); tests use better-sqlite3 (testing/nodeDb.ts).

export type SqlValue = string | number | null;

export interface Db {
  /** Run a statement that returns no rows. */
  run(sql: string, params?: SqlValue[]): Promise<void>;
  /** Run a query and return its rows. */
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Run several statements with no parameters, e.g. migration scripts. */
  exec(sql: string): Promise<void>;
  /**
   * Run `fn` atomically: commit if it resolves, roll back if it throws. Not re-entrant — nested
   * calls share the outer transaction and an inner throw rolls back everything.
   */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

/** The minimum a driver must provide; `withTransactions` builds the rest. */
export interface RawDriver {
  run(sql: string, params: SqlValue[]): Promise<void>;
  all<T>(sql: string, params: SqlValue[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

/**
 * Wraps a driver with serialized transactions. A single connection can only have one open
 * transaction, so top-level `transaction` calls queue behind each other; a call made from inside
 * one reuses the open transaction rather than starting another.
 */
export const withTransactions = (driver: RawDriver): Db => {
  let queue: Promise<unknown> = Promise.resolve();
  const make = (inTx: boolean): Db => ({
    run: (sql, params = []) => driver.run(sql, params),
    all: <T>(sql: string, params: SqlValue[] = []) => driver.all<T>(sql, params),
    exec: (sql) => driver.exec(sql),
    transaction: <T>(fn: (tx: Db) => Promise<T>): Promise<T> => {
      if (inTx) return fn(make(true));
      const next = queue.then(async () => {
        await driver.begin();
        try {
          const result = await fn(make(true));
          await driver.commit();
          return result;
        } catch (err) {
          await driver.rollback();
          throw err;
        }
      });
      queue = next.catch(() => undefined);
      return next;
    },
  });
  return make(false);
};
