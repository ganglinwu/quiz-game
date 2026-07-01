// Human-readable duration formatting for the end-of-game stats panel.
// Distinct from HistoryModal's formatTime, which renders a wall-clock HH:MM:SS
// timestamp; this one renders an elapsed *duration* (avg turn time, game time,
// fastest/slowest turn). Extracted from StatsPanel so the tiering/rounding logic
// is testable without an RN render.
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}
