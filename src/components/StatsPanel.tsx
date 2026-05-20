import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GameStats } from '../types';
import { getPlayerColor } from '../utils/colors';

interface Props {
  stats: GameStats;
  players: string[];
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

export default function StatsPanel({ stats, players }: Props) {
  return (
    <View style={styles.container}>
      {players.map((player) => {
        const s = stats.playerStats[player];
        if (!s) return null;
        const color = getPlayerColor(player, players);
        return (
          <View key={player}>
            <Row
              label={player}
              value={`${s.totalItems} items · avg ${formatTime(s.avgTurnTime)}`}
              color={color}
            />
          </View>
        );
      })}
      <Row label="Total turns" value={stats.totalTurns.toString()} />
      <Row label="Game time" value={formatTime(stats.totalGameTime)} />
      {stats.fastestTurn && (
        <Row
          label="Fastest turn"
          value={`${stats.fastestTurn.player} - ${stats.fastestTurn.item} (${formatTime(stats.fastestTurn.time)})`}
        />
      )}
      {stats.slowestTurn && (
        <Row
          label="Slowest turn"
          value={`${stats.slowestTurn.player} - ${stats.slowestTurn.item} (${formatTime(stats.slowestTurn.time)})`}
        />
      )}
    </View>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, color ? { color } : null]}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#2a2a3e',
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a4e',
  },
  label: {
    color: '#a0a0b0',
    fontSize: 14,
  },
  value: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
});
