// Node-side stand-in for `expo-sqlite`, used only by vitest (wired via the alias in
// vitest.config.ts). It exposes the small slice of the expo-sqlite sync API that
// src/data/pokemon-db.ts relies on — openDatabaseSync() → { getAllSync, getFirstSync }
// — backed by better-sqlite3 reading the real bundled database. Read-only: tests
// never mutate the shipped data.
import Database from 'better-sqlite3';
import path from 'node:path';

const db = new Database(path.join(process.cwd(), 'assets', 'quiz.db'), {
  readonly: true,
});

// expo-sqlite passes bind params as a single array argument (or omits it);
// better-sqlite3 takes them spread, so adapt at the boundary.
function openDatabaseSync() {
  return {
    getAllSync: (sql: string, params: unknown[] = []) =>
      db.prepare(sql).all(...(params as never[])),
    getFirstSync: (sql: string, params: unknown[] = []) =>
      db.prepare(sql).get(...(params as never[])),
  };
}

export { openDatabaseSync };
