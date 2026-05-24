import type { SQLiteDatabase } from 'expo-sqlite';

interface Migration {
  version: number;
  up: (db: SQLiteDatabase) => void;
}

const migrations: Migration[] = [];

export function runMigrations(db: SQLiteDatabase): void {
  const result = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = result?.user_version ?? 0;

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      migration.up(db);
      db.execSync(`PRAGMA user_version = ${migration.version}`);
    }
  }
}
