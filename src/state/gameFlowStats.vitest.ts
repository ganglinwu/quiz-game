import { describe, it, expect, vi, afterEach } from 'vitest';
import { gameReducer, createInitialState } from './gameReducer';
import { calculateStats } from '../utils/statsCalculator';
import { Category, GameState } from '../types';

// Integration coverage for the reducer -> stats *seam*. gameReducer.vitest.ts and
// statsCalculator.vitest.ts each test one side in isolation with hand-built data;
// neither plays a real game and then feeds the reducer's own output into
// calculateStats. This walks whole games through the reducer and asserts on the
// end-of-game stats the ResultScreen would render, so the contract between them is
// exercised as a unit:
//   - a TurnRecord's { player, item, durationMs } is exactly what calculateStats
//     reads (rename/reshape either side and this breaks, the unit tests don't)
//   - the give-up-doesn't-bleed guarantee holds end-to-end: the reducer resets the
//     turn clock on GIVE_UP so calculateStats never charges the deliberation to the
//     next recorded turn (Bug 8, verified here across the full reducer->stats path)
//   - state.players (the full roster, kept through elimination) is the roster
//     calculateStats reports on, so an eliminated non-scorer surfaces 0/0 not NaN
//
// Pokemon totals come from the genuine bundled assets/quiz.db (via the
// better-sqlite3 shim aliased in vitest.config.ts), so totalItems is real.

const fruits: Category = { type: 'fruits' };
const gen1: Category = { type: 'pokemon', generations: [1] };

function initAt(
  time: number,
  args: Parameters<typeof createInitialState>[0]
): GameState {
  vi.setSystemTime(time);
  return createInitialState(args);
}

// Drive a turn the way the UI does (propose then confirm) at a fixed wall-clock.
function confirmAt(state: GameState, item: string, time: number): GameState {
  vi.setSystemTime(time);
  const proposed = gameReducer(state, { type: 'PROPOSE_ITEM', item });
  return gameReducer(proposed, { type: 'CONFIRM_ITEM' });
}

function giveUpAt(state: GameState, time: number): GameState {
  vi.setSystemTime(time);
  return gameReducer(state, { type: 'GIVE_UP' });
}

describe('reducer -> stats: mixed confirms, give-ups, and elimination', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('produces end-of-game stats where a give-up never bleeds time into the next recorded turn', () => {
    vi.useFakeTimers();
    // 3-player fruits game. Timeline is chosen so the ONLY way A's second turn can
    // read 1500ms (not 2500ms) is if GIVE_UP reset the clock — this is the whole
    // reason calculateStats reads durationMs instead of differencing timestamps.
    let s = initAt(1000, { category: fruits, players: ['A', 'B', 'C'] });

    s = confirmAt(s, 'apple', 3000); // A: 2000ms -> B
    expect(s.currentPlayer).toBe('B');

    s = confirmAt(s, 'banana', 8000); // B: 5000ms -> C
    expect(s.currentPlayer).toBe('C');

    // C deliberates 1000ms then gives up. No record is created and the turn clock
    // is reset to 9000, so C's 1000ms is charged to nobody.
    s = giveUpAt(s, 9000);
    expect(s.currentPlayer).toBe('A');
    expect(s.eliminatedPlayers).toEqual(['C']);

    // A's second turn: 9000 -> 10500 = 1500ms. Without the give-up reset, the
    // record would span 8000 -> 10500 = 2500ms (B's confirm to now).
    s = confirmAt(s, 'avocado', 10500); // A: 1500ms -> B
    expect(s.currentPlayer).toBe('B');

    // B gives up, leaving A the sole survivor and winner.
    s = giveUpAt(s, 20000);
    expect(s.isGameOver).toBe(true);
    expect(s.winner).toBe('A');

    // Feed the reducer's own output into the stats calculator at t=20000.
    const stats = calculateStats(s.turnRecords, s.gameStartTime, s.players);

    // A scored twice (2000 + 1500 -> mean 1750); the 1500 confirms no bleed.
    expect(stats.playerStats['A']).toEqual({ totalItems: 2, avgTurnTime: 1750 });
    expect(stats.playerStats['B']).toEqual({ totalItems: 1, avgTurnTime: 5000 });
    // C gave up before scoring but is still in state.players -> 0/0, never NaN.
    expect(stats.playerStats['C']).toEqual({ totalItems: 0, avgTurnTime: 0 });
    expect(stats.playerStats['C'].avgTurnTime).not.toBeNaN();

    expect(stats.totalTurns).toBe(3);
    expect(stats.fastestTurn).toEqual({ player: 'A', item: 'avocado', time: 1500 });
    expect(stats.slowestTurn).toEqual({ player: 'B', item: 'banana', time: 5000 });
    expect(stats.totalGameTime).toBe(19000); // 20000 - gameStartTime(1000)
  });
});

describe('reducer -> stats: board-exhaustion draw', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('aggregates every turn of a game played to exhaustion (no winner)', () => {
    vi.useFakeTimers();
    const step = 1000;
    // Initial turn clock at t=0; each of the 151 turns is confirmed one step later,
    // so every recorded turn is exactly `step` ms long.
    let s = initAt(0, { category: gen1, players: ['A', 'B'] });
    expect(s.totalItems).toBe(151);

    for (let i = 0; i < 151; i++) {
      expect(s.isGameOver).toBe(false);
      s = confirmAt(s, `mon-${i}`, (i + 1) * step);
    }
    expect(s.isGameOver).toBe(true);
    expect(s.isDraw).toBe(true);
    expect(s.winner).toBeNull();

    const stats = calculateStats(s.turnRecords, s.gameStartTime, s.players);

    expect(stats.totalTurns).toBe(151);
    // A takes the even-indexed turns (0..150 -> 76), B the odd (1..149 -> 75).
    expect(stats.playerStats['A'].totalItems).toBe(76);
    expect(stats.playerStats['B'].totalItems).toBe(75);
    expect(
      stats.playerStats['A'].totalItems + stats.playerStats['B'].totalItems
    ).toBe(151);
    // Uniform durations -> both means equal the step.
    expect(stats.playerStats['A'].avgTurnTime).toBe(step);
    expect(stats.playerStats['B'].avgTurnTime).toBe(step);
    // Every turn tied at `step`; strict </> keeps the first record for both.
    expect(stats.fastestTurn).toEqual({ player: 'A', item: 'mon-0', time: step });
    expect(stats.slowestTurn).toEqual({ player: 'A', item: 'mon-0', time: step });
    expect(stats.totalGameTime).toBe(151 * step); // 151000 - gameStartTime(0)
  });
});

describe('reducer -> stats: auto-detect generation expansion', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('credits the vote-triggering answer to the proposer as a real scored turn', () => {
    vi.useFakeTimers();
    let s = initAt(0, { category: gen1, players: ['A', 'B'] });

    s = confirmAt(s, 'Pikachu', 2000); // A: 2000ms -> B
    expect(s.currentPlayer).toBe('B');

    // B (the current player) names a Gen 2 Pokemon, opening an auto-detect vote.
    s = gameReducer(s, {
      type: 'PROPOSE_GEN_CHANGE',
      generation: 2,
      triggerPokemon: 'Chikorita',
      source: 'auto-detect',
      action: 'add',
    });

    // A approves; the vote resolves at t=5000 and the trigger becomes B's turn,
    // its duration spanning B's turn start (2000) through vote resolution.
    vi.setSystemTime(5000);
    s = gameReducer(s, { type: 'CAST_GEN_VOTE', player: 'A', approve: true });
    expect(s.activeGenerations).toEqual([1, 2]);
    expect(s.usedItems).toEqual(['Pikachu', 'Chikorita']);

    const stats = calculateStats(s.turnRecords, s.gameStartTime, s.players);

    expect(stats.totalTurns).toBe(2);
    expect(stats.playerStats['A']).toEqual({ totalItems: 1, avgTurnTime: 2000 });
    // Chikorita is credited to B (the proposer), not A who cast the deciding vote.
    expect(stats.playerStats['B']).toEqual({ totalItems: 1, avgTurnTime: 3000 });
    expect(stats.slowestTurn).toEqual({ player: 'B', item: 'Chikorita', time: 3000 });
  });
});
