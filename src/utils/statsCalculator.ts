import { GameStats, PlayerStat, TurnRecord } from '../types';

export function calculateStats(
  turnRecords: TurnRecord[],
  gameStartTime: number,
  players: string[]
): GameStats {
  // Use the per-turn duration captured when each record was created, rather
  // than differencing adjacent timestamps. Differencing charged a give-up's
  // deliberation (which leaves no record) to the next player's turn; the stored
  // durationMs is the wall-clock time the player actually spent on that turn.
  const turnTimes = turnRecords.map((record) => ({
    player: record.player,
    time: record.durationMs,
    item: record.item,
  }));

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const playerStats: Record<string, PlayerStat> = {};
  for (const player of players) {
    const records = turnRecords.filter((r) => r.player === player);
    const times = turnTimes.filter((t) => t.player === player);
    playerStats[player] = {
      totalItems: records.length,
      avgTurnTime: avg(times.map((t) => t.time)),
    };
  }

  const fastest =
    turnTimes.length > 0
      ? turnTimes.reduce((min, t) => (t.time < min.time ? t : min))
      : null;

  const slowest =
    turnTimes.length > 0
      ? turnTimes.reduce((max, t) => (t.time > max.time ? t : max))
      : null;

  return {
    playerStats,
    totalGameTime: Date.now() - gameStartTime,
    totalTurns: turnRecords.length,
    fastestTurn: fastest as GameStats['fastestTurn'],
    slowestTurn: slowest as GameStats['slowestTurn'],
  };
}
