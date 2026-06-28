import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { GenerationVote } from '../types';
import { getPlayerColor } from '../utils/colors';

interface Props {
  vote: GenerationVote;
  activePlayers: string[];
  players: string[];
  onVote: (player: string, approve: boolean) => void;
}

export default function GenerationVoteOverlay({ vote, activePlayers, players, onVote }: Props) {
  const yesCount = Object.values(vote.votes).filter(Boolean).length;
  const noCount = Object.values(vote.votes).filter((v) => !v).length;
  const verb = vote.action === 'remove' ? 'Remove' : 'Add';

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        {vote.triggerPokemon ? (
          <>
            <Text style={styles.label}>
              {vote.triggerPokemon} is a Gen {vote.generation} Pokemon
            </Text>
            <Text style={styles.question}>{verb} Gen {vote.generation}?</Text>
          </>
        ) : (
          <Text style={styles.question}>{verb} Gen {vote.generation}?</Text>
        )}

        <Text style={styles.tally}>
          Yes: {yesCount} · No: {noCount}
        </Text>

        <View style={styles.voterList}>
          {activePlayers.map((player) => {
            const color = getPlayerColor(player, players);
            const hasVoted = player in vote.votes;
            return (
              <View key={player} style={styles.voterRow}>
                <Text style={[styles.voterName, { color }]}>{player}</Text>
                {hasVoted ? (
                  <Text style={styles.votedText}>
                    {vote.votes[player] ? 'Yes' : 'No'}
                  </Text>
                ) : (
                  <View style={styles.voteButtons}>
                    <TouchableOpacity
                      style={styles.yesBtn}
                      onPress={() => onVote(player, true)}
                    >
                      <Text style={styles.btnText}>Yes</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.noBtn}
                      onPress={() => onVote(player, false)}
                    >
                      <Text style={styles.btnText}>No</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  card: {
    backgroundColor: '#2a2a3e',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    width: '85%',
  },
  label: {
    color: '#a0a0b0',
    fontSize: 14,
    textAlign: 'center',
  },
  question: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 16,
  },
  tally: {
    color: '#a0a0b0',
    fontSize: 14,
    marginBottom: 16,
  },
  voterList: {
    width: '100%',
    gap: 12,
  },
  voterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  voterName: {
    fontSize: 16,
    fontWeight: '600',
  },
  votedText: {
    color: '#a0a0b0',
    fontSize: 14,
    fontStyle: 'italic',
  },
  voteButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  yesBtn: {
    backgroundColor: '#2a9d8f',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  noBtn: {
    backgroundColor: '#e63946',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  btnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
