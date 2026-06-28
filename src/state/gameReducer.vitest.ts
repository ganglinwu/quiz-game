import { describe, it, expect, vi, afterEach } from 'vitest';
import { gameReducer, createInitialState } from './gameReducer';
import { Category, GameState } from '../types';

// Regression guard for the three reducer-level gameplay fixes that previously had
// only throwaway node-simulation verification:
//   Bug 18 — GIVE_UP turn order: a mid-order player giving up in a 3+ player game
//            must advance to the next player in *seating order*, not rewind to the
//            first survivor (the pre-fix bug passed the already-filtered list to
//            getNextActivePlayer, so indexOf returned -1 and it always picked [0]).
//   Bug 8  — per-turn stats timing: a give-up creates no TurnRecord, so its
//            deliberation time must not bleed into the next player's recorded turn;
//            GIVE_UP resets turnStartTime and each record stores its own durationMs.
//   Bug 6  — remove-generation: an approved 'remove' vote must filter the gen out
//            and shrink totalItems, not duplicate it (the pre-fix flow always
//            appended, yielding activeGenerations [1, 2, 2] and an unchanged count).
//
// The Bug 6 cases run against the genuine bundled assets/quiz.db (via the
// better-sqlite3 shim aliased in vitest.config.ts), so the item counts are real.

const fruits: Category = { type: 'fruits' };

// Drive a turn the way the UI does: propose then confirm.
function confirm(state: GameState, item: string): GameState {
  const proposed = gameReducer(state, { type: 'PROPOSE_ITEM', item });
  return gameReducer(proposed, { type: 'CONFIRM_ITEM' });
}

describe('GIVE_UP turn order (Bug 18)', () => {
  it('advances a mid-order give-up to the next player in seating order, not the first survivor', () => {
    // 4 players A,B,C,D. Confirm once so B is the current (mid-order) player.
    let s = createInitialState({ category: fruits, players: ['A', 'B', 'C', 'D'] });
    s = confirm(s, 'apple'); // A -> B
    expect(s.currentPlayer).toBe('B');

    s = gameReducer(s, { type: 'GIVE_UP' });
    // The pre-fix bug would send the turn back to 'A' (first survivor); the fix
    // advances to 'C' (next in original seating order).
    expect(s.currentPlayer).toBe('C');
    expect(s.activePlayers).toEqual(['A', 'C', 'D']);
    expect(s.eliminatedPlayers).toEqual(['B']);
  });

  it('advances correctly for a second mid-order give-up (C -> D)', () => {
    let s = createInitialState({ category: fruits, players: ['A', 'B', 'C', 'D'] });
    s = confirm(s, 'apple'); // A -> B
    s = confirm(s, 'banana'); // B -> C
    expect(s.currentPlayer).toBe('C');

    s = gameReducer(s, { type: 'GIVE_UP' });
    expect(s.currentPlayer).toBe('D');
    expect(s.activePlayers).toEqual(['A', 'B', 'D']);
  });

  it('handles a mid-order give-up in a 3-player game (B -> C, not A)', () => {
    let s = createInitialState({ category: fruits, players: ['A', 'B', 'C'] });
    s = confirm(s, 'apple'); // A -> B
    s = gameReducer(s, { type: 'GIVE_UP' });
    expect(s.currentPlayer).toBe('C');
    expect(s.activePlayers).toEqual(['A', 'C']);
  });

  it('wraps a last-in-order give-up back to the first player', () => {
    let s = createInitialState({ category: fruits, players: ['A', 'B', 'C', 'D'] });
    s = confirm(s, 'a');
    s = confirm(s, 'b');
    s = confirm(s, 'c'); // current is D
    expect(s.currentPlayer).toBe('D');
    s = gameReducer(s, { type: 'GIVE_UP' });
    expect(s.currentPlayer).toBe('A');
    expect(s.activePlayers).toEqual(['A', 'B', 'C']);
  });

  it('advances a first-position give-up to the next player', () => {
    let s = createInitialState({ category: fruits, players: ['A', 'B', 'C', 'D'] });
    expect(s.currentPlayer).toBe('A');
    s = gameReducer(s, { type: 'GIVE_UP' });
    expect(s.currentPlayer).toBe('B');
    expect(s.activePlayers).toEqual(['B', 'C', 'D']);
  });

  it('ends the game when the give-up leaves a single survivor', () => {
    let s = createInitialState({ category: fruits, players: ['A', 'B'] });
    s = gameReducer(s, { type: 'GIVE_UP' }); // A gives up
    expect(s.isGameOver).toBe(true);
    expect(s.winner).toBe('B');
    expect(s.activePlayers).toEqual(['B']);
  });
});

describe('per-turn duration accounting (Bug 8)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not charge a give-up's deliberation time to the next player's turn", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    let s = createInitialState({ category: fruits, players: ['A', 'B', 'C'] });
    expect(s.turnStartTime).toBe(1000);

    // A deliberates 5s, then confirms. The record stores its own 5000ms duration.
    vi.setSystemTime(6000);
    s = confirm(s, 'apple');
    expect(s.currentPlayer).toBe('B');
    expect(s.turnRecords.at(-1)).toMatchObject({ player: 'A', durationMs: 5000 });
    expect(s.turnStartTime).toBe(6000);

    // B deliberates 4s, then gives up. GIVE_UP creates no record and resets the
    // turn clock so B's 4s is charged to no one.
    vi.setSystemTime(10000);
    s = gameReducer(s, { type: 'GIVE_UP' });
    expect(s.currentPlayer).toBe('C');
    expect(s.turnStartTime).toBe(10000);

    // C deliberates 2s, then confirms. Without the give-up clock reset, C's record
    // would be charged 6000ms (12000 - 6000); the fix records the true 2000ms.
    vi.setSystemTime(12000);
    s = confirm(s, 'banana');
    expect(s.turnRecords.at(-1)).toMatchObject({ player: 'C', durationMs: 2000 });
  });
});

describe('remove-generation vote (Bug 6)', () => {
  const pokemon12: Category = { type: 'pokemon', generations: [1, 2] };
  const pokemon1: Category = { type: 'pokemon', generations: [1] };

  function castUntilResolved(
    state: GameState,
    voters: string[],
    approve: boolean,
  ): GameState {
    let s = state;
    for (const player of voters) {
      s = gameReducer(s, { type: 'CAST_GEN_VOTE', player, approve });
    }
    return s;
  }

  it('an approved remove vote filters the gen out and shrinks totalItems (no duplicate)', () => {
    let s = createInitialState({ category: pokemon12, players: ['A', 'B'] });
    expect(s.activeGenerations).toEqual([1, 2]);
    expect(s.totalItems).toBe(251); // Gen 1 (151) + Gen 2 (100)

    s = gameReducer(s, {
      type: 'PROPOSE_GEN_CHANGE',
      generation: 2,
      triggerPokemon: null,
      source: 'settings',
      action: 'remove',
    });
    expect(s.pendingGenVote?.action).toBe('remove');

    s = castUntilResolved(s, ['A', 'B'], true);
    // Pre-fix: always-append yields [1, 2, 2] and totalItems stays 251 (IN dedups).
    expect(s.activeGenerations).toEqual([1]);
    expect(s.totalItems).toBe(151);
    expect(s.pendingGenVote).toBeNull();
  });

  it('an approved add vote still appends the gen and grows totalItems', () => {
    let s = createInitialState({ category: pokemon1, players: ['A', 'B'] });
    expect(s.totalItems).toBe(151);

    s = gameReducer(s, {
      type: 'PROPOSE_GEN_CHANGE',
      generation: 2,
      triggerPokemon: null,
      source: 'settings',
      action: 'add',
    });
    expect(s.pendingGenVote?.action).toBe('add');

    s = castUntilResolved(s, ['A', 'B'], true);
    expect(s.activeGenerations).toEqual([1, 2]);
    expect(s.totalItems).toBe(251);
  });

  it('a rejected remove vote leaves the active generations unchanged', () => {
    let s = createInitialState({ category: pokemon12, players: ['A', 'B'] });
    s = gameReducer(s, {
      type: 'PROPOSE_GEN_CHANGE',
      generation: 2,
      triggerPokemon: null,
      source: 'settings',
      action: 'remove',
    });
    s = castUntilResolved(s, ['A', 'B'], false);
    expect(s.activeGenerations).toEqual([1, 2]);
    expect(s.totalItems).toBe(251);
    expect(s.pendingGenVote).toBeNull();
  });
});
