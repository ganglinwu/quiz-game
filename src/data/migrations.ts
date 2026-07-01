import type { SQLiteDatabase } from 'expo-sqlite';

export interface Migration {
  version: number;
  up: (db: SQLiteDatabase) => void;
}

const migrations: Migration[] = [];

// `migrationList` defaults to the module's registered migrations (empty today). It
// is a parameter purely so the version-gate/ordering/bump logic can be exercised in
// tests before the first real migration ships — production always calls the one-arg
// form, which uses the module list unchanged.
export function runMigrations(
  db: SQLiteDatabase,
  migrationList: Migration[] = migrations
): void {
  const result = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = result?.user_version ?? 0;

  for (const migration of migrationList) {
    if (migration.version > currentVersion) {
      migration.up(db);
      db.execSync(`PRAGMA user_version = ${migration.version}`);
    }
  }
}
