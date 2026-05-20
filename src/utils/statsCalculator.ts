import { GameStats, PlayerStat, TurnRecord } from '../types';

export function calculateStats(
  turnRecords: TurnRecord[],
  gameStartTime: number,
  players: string[]
): GameStats {
  const turnTimes = turnRecords.map((record, i) => {
    const prevTime = i === 0 ? gameStartTime : turnRecords[i - 1].timestamp;
    return {
      player: record.player,
      time: record.timestamp - prevTime,
      item: record.item,
    };
  });

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
