export const PLAYER_COLORS = [
  '#5e9eff',
  '#f5c542',
  '#2a9d8f',
  '#e63946',
  '#a855f7',
  '#f97316',
  '#ec4899',
  '#22d3ee',
];

export function getPlayerColor(playerName: string, players: string[]): string {
  const index = players.indexOf(playerName);
  return PLAYER_COLORS[index >= 0 ? index % PLAYER_COLORS.length : 0];
}
