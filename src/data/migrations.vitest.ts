import { describe, it, expect, vi } from 'vitest';
import type { SQLiteDatabase } from 'expo-sqlite';
import { runMigrations, type Migration } from './migrations';

// The migration runner executes on EVERY app launch (App.tsx onInit -> runMigrations)
// against the bundled, pre-populated assets/quiz.db. Its version-gate + cumulative-bump
// logic is dormant today (the registered migration list is empty), but the first real
// schema migration will ride entirely on this otherwise-untested code — so the gate,
// ordering, per-step bump, and idempotence are worth pinning down now.
//
// The gate/bump behavior is exercised via the optional `migrationList` parameter; the
// production one-arg call (`runMigrations(db)`) uses the empty module list unchanged,
// which the first test covers as the actual shipped boot path.
//
// A hand-rolled recording db is used (not the better-sqlite3 shim) so the returned
// user_version can be controlled and every getFirstSync/execSync write asserted —
// crucially, that a launch performs ZERO writes to the shipped database today.

function makeDb(userVersion: number | null) {
  const events: string[] = [];
  const db = {
    getFirstSync: (sql: string) => {
      events.push(`getFirst:${sql}`);
      return userVersion === null ? null : { user_version: userVersion };
    },
    execSync: (sql: string) => {
      events.push(`exec:${sql}`);
    },
  } as unknown as SQLiteDatabase;
  return { db, events };
}

// A migration whose up() logs to the shared event stream, so its ordering relative to
// the user_version bumps is observable in a single sequence.
function mig(version: number, events: string[]): Migration {
  return {
    version,
    up: vi.fn(() => {
      events.push(`up:${version}`);
    }),
  };
}

describe('runMigrations', () => {
  it('shipped default: reads user_version once and writes nothing (boot-path DB safety)', () => {
    // The real one-arg call App.tsx makes on every launch. With the empty module
    // migration list the pre-populated DB must never be touched: exactly one read,
    // zero writes, no throw.
    const { db, events } = makeDb(0);
    expect(() => runMigrations(db)).not.toThrow();
    expect(events).toEqual(['getFirst:PRAGMA user_version']);
  });

  it('treats a null user_version as 0 (fresh/legacy DB) and applies pending migrations', () => {
    const { db, events } = makeDb(null);
    const m1 = mig(1, events);
    runMigrations(db, [m1]);
    expect(m1.up).toHaveBeenCalledTimes(1);
    expect(m1.up).toHaveBeenCalledWith(db);
    expect(events).toEqual([
      'getFirst:PRAGMA user_version',
      'up:1',
      'exec:PRAGMA user_version = 1',
    ]);
  });

  it('applies every pending migration in order, bumping user_version after each up()', () => {
    const { db, events } = makeDb(0);
    const list = [mig(1, events), mig(2, events), mig(3, events)];
    runMigrations(db, list);
    // Each up() runs immediately before its own version bump, in ascending order.
    expect(events).toEqual([
      'getFirst:PRAGMA user_version',
      'up:1',
      'exec:PRAGMA user_version = 1',
      'up:2',
      'exec:PRAGMA user_version = 2',
      'up:3',
      'exec:PRAGMA user_version = 3',
    ]);
    list.forEach((m) => expect(m.up).toHaveBeenCalledWith(db));
  });

  it('skips migrations at or below the current version (only newer ones run)', () => {
    const { db, events } = makeDb(2);
    const m1 = mig(1, events);
    const m2 = mig(2, events);
    const m3 = mig(3, events);
    runMigrations(db, [m1, m2, m3]);
    expect(m1.up).not.toHaveBeenCalled();
    expect(m2.up).not.toHaveBeenCalled();
    expect(m3.up).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      'getFirst:PRAGMA user_version',
      'up:3',
      'exec:PRAGMA user_version = 3',
    ]);
  });

  it('is a no-op when the DB is already at the latest version (idempotent re-launch)', () => {
    const { db, events } = makeDb(3);
    const list = [mig(1, events), mig(2, events), mig(3, events)];
    runMigrations(db, list);
    list.forEach((m) => expect(m.up).not.toHaveBeenCalled());
    expect(events).toEqual(['getFirst:PRAGMA user_version']);
  });

  it('reads the current version once, so migrations must be registered in ascending order', () => {
    // currentVersion is captured a single time before the loop and compared against each
    // migration.version. Registering out of ascending order (e.g. [3, 1, 2]) still runs
    // all three (each version > 0) in ARRAY order, but the final user_version reflects the
    // last array element written (2), NOT the max (3) — a latent foot-gun. This test pins
    // the contract: migrations MUST be appended in ascending version order.
    const { db, events } = makeDb(0);
    const list = [mig(3, events), mig(1, events), mig(2, events)];
    runMigrations(db, list);
    expect(events).toEqual([
      'getFirst:PRAGMA user_version',
      'up:3',
      'exec:PRAGMA user_version = 3',
      'up:1',
      'exec:PRAGMA user_version = 1',
      'up:2',
      'exec:PRAGMA user_version = 2',
    ]);
    // Final written bump is version 2 (last in array), not 3 — hence the ascending-order contract.
  });
});
