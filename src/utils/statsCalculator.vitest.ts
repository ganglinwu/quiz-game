import { describe, it, expect, vi, afterEach } from 'vitest';
import { calculateStats } from './statsCalculator';
import { TurnRecord } from '../types';

// End-of-game stats path (ResultScreen's "Show Stats" panel). calculateStats
// turns the accumulated turnRecords into per-player counts/averages plus the
// fastest/slowest single turn and the total game time. It had no coverage at all;
// these lock in the branches that decide what the stats panel actually shows:
//   - per-player totalItems and mean turn time, including a player who never
//     scored (avgTurnTime must be 0, not NaN, since avg guards the empty case)
//   - the empty-game path (no records -> null fastest/slowest, 0 everywhere)
//   - fastest/slowest selection across players, and its tie-break stability
//     (strict </> in the reduce means the FIRST record of a tied time wins)
//   - totalGameTime = Date.now() - gameStartTime

// TurnRecord factory — timestamp is irrelevant to calculateStats (it reads
// durationMs, not adjacent-timestamp differences), so it's left at 0.
function rec(player: string, item: string, durationMs: number): TurnRecord {
  return { player, item, timestamp: 0, durationMs };
}

describe('calculateStats — per-player aggregation', () => {
  it('counts items and averages each player\'s own turn durations', () => {
    const records = [
      rec('A', 'apple', 1000),
      rec('B', 'banana', 3000),
      rec('A', 'avocado', 5000), // A: two turns, mean 3000
    ];
    const stats = calculateStats(records, 0, ['A', 'B']);

    expect(stats.playerStats['A']).toEqual({ totalItems: 2, avgTurnTime: 3000 });
    expect(stats.playerStats['B']).toEqual({ totalItems: 1, avgTurnTime: 3000 });
    expect(stats.totalTurns).toBe(3);
  });

  it('reports 0/0 (not NaN) for a player who never took a turn', () => {
    // C is in the roster but gave up before scoring — no records reference C.
    const records = [rec('A', 'apple', 2000), rec('B', 'banana', 4000)];
    const stats = calculateStats(records, 0, ['A', 'B', 'C']);

    expect(stats.playerStats['C']).toEqual({ totalItems: 0, avgTurnTime: 0 });
    expect(stats.playerStats['C'].avgTurnTime).not.toBeNaN();
  });

  it('includes every rostered player even when only one ever scored', () => {
    const stats = calculateStats([rec('A', 'apple', 1500)], 0, ['A', 'B']);
    expect(Object.keys(stats.playerStats).sort()).toEqual(['A', 'B']);
  });
});

describe('calculateStats — fastest / slowest turn', () => {
  it('picks the min-duration and max-duration turn across all players', () => {
    const records = [
      rec('A', 'apple', 4000),
      rec('B', 'banana', 800), // fastest
      rec('C', 'cherry', 9000), // slowest
      rec('A', 'avocado', 2500),
    ];
    const stats = calculateStats(records, 0, ['A', 'B', 'C']);

    expect(stats.fastestTurn).toEqual({ player: 'B', item: 'banana', time: 800 });
    expect(stats.slowestTurn).toEqual({ player: 'C', item: 'cherry', time: 9000 });
  });

  it('keeps the first record on a tie (strict < / > in the reduce)', () => {
    // Two 1000ms turns and two 5000ms turns; the reduce uses strict comparisons,
    // so a later equal time never displaces the earlier one.
    const records = [
      rec('A', 'first-fast', 1000),
      rec('B', 'first-slow', 5000),
      rec('C', 'later-fast', 1000),
      rec('D', 'later-slow', 5000),
    ];
    const stats = calculateStats(records, 0, ['A', 'B', 'C', 'D']);

    expect(stats.fastestTurn?.item).toBe('first-fast');
    expect(stats.slowestTurn?.item).toBe('first-slow');
  });

  it('reports the same single record as both fastest and slowest', () => {
    const stats = calculateStats([rec('A', 'apple', 3300)], 0, ['A']);
    expect(stats.fastestTurn).toEqual({ player: 'A', item: 'apple', time: 3300 });
    expect(stats.slowestTurn).toEqual({ player: 'A', item: 'apple', time: 3300 });
  });
});

describe('calculateStats — empty game', () => {
  it('returns null fastest/slowest and zeroes when no turns were taken', () => {
    // Everyone gave up before naming anything (or an instant draw).
    const stats = calculateStats([], 0, ['A', 'B']);

    expect(stats.fastestTurn).toBeNull();
    expect(stats.slowestTurn).toBeNull();
    expect(stats.totalTurns).toBe(0);
    expect(stats.playerStats['A']).toEqual({ totalItems: 0, avgTurnTime: 0 });
    expect(stats.playerStats['B']).toEqual({ totalItems: 0, avgTurnTime: 0 });
  });
});

describe('calculateStats — total game time', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is the wall-clock elapsed since gameStartTime', () => {
    vi.useFakeTimers();
    vi.setSystemTime(50000);
    const stats = calculateStats([rec('A', 'apple', 1000)], 8000, ['A']);
    expect(stats.totalGameTime).toBe(42000);
  });
});
