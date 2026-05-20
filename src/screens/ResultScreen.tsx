import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/RootNavigator';
import { HintRecord } from '../types';
import { useMusic } from '../state/MusicContext';
import { calculateStats } from '../utils/statsCalculator';
import { getPlayerColor } from '../utils/colors';
import { getArtworkUrl } from '../utils/pokeApi';
import { RESULT_BGM } from '../utils/tracks';
import StatsPanel from '../components/StatsPanel';
import HistoryModal from '../components/HistoryModal';
import PokemonCardModal from '../components/PokemonCardModal';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

function SilhouetteCard({
  hint,
  isCountdownBlocked,
  onCountdownStart,
  onCountdownEnd,
  onCardTap,
}: {
  hint: HintRecord;
  isCountdownBlocked: boolean;
  onCountdownStart: () => void;
  onCountdownEnd: () => void;
  onCardTap: (h: HintRecord) => void;
}) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const handleTap = () => {
    if (revealed) {
      onCardTap(hint);
      return;
    }
    if (countdown !== null || isCountdownBlocked) return;

    onCountdownStart();
    setCountdown(3);
    let count = 3;
    intervalRef.current = setInterval(() => {
      count--;
      if (count <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setCountdown(null);
        setRevealed(true);
        onCountdownEnd();
      } else {
        setCountdown(count);
      }
    }, 1000);
  };

  return (
    <TouchableOpacity style={styles.hintCard} onPress={handleTap} activeOpacity={0.7}>
      <Image
        source={{ uri: getArtworkUrl(hint.pokemonId) }}
        style={[styles.hintImage, !revealed && { tintColor: '#000000' }]}
      />
      {revealed ? (
        <Text style={styles.hintName}>{hint.pokemonName}</Text>
      ) : countdown !== null ? (
        <Text style={styles.countdownText}>{countdown}</Text>
      ) : (
        <Text style={styles.hintNameHidden}>?</Text>
      )}
    </TouchableOpacity>
  );
}

function RevealedCard({ hint, onCardTap }: { hint: HintRecord; onCardTap: (h: HintRecord) => void }) {
  return (
    <TouchableOpacity style={styles.hintCard} onPress={() => onCardTap(hint)} activeOpacity={0.7}>
      <Image source={{ uri: getArtworkUrl(hint.pokemonId) }} style={styles.hintImage} />
      <Text style={styles.hintName}>{hint.pokemonName}</Text>
    </TouchableOpacity>
  );
}

export default function ResultScreen({ navigation, route }: Props) {
  const { winner, isDraw, eliminatedPlayers, players, turnRecords, gameStartTime, revealedHints } = route.params;
  const { play } = useMusic();
  const [showStats, setShowStats] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [countdownActive, setCountdownActive] = useState(false);
  const [selectedPokemon, setSelectedPokemon] = useState<HintRecord | null>(null);

  useFocusEffect(
    useCallback(() => {
      play(RESULT_BGM);
    }, [play])
  );

  const hintPokemon = useMemo(() => revealedHints.filter((h) => h.source === 'hint'), [revealedHints]);
  const bonusPokemon = useMemo(() => revealedHints.filter((h) => h.source === 'bonus'), [revealedHints]);

  const stats = useMemo(
    () => calculateStats(turnRecords, gameStartTime, players),
    [turnRecords, gameStartTime, players]
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {isDraw ? (
        <>
          <Text style={styles.drawText}>It's a Draw!</Text>
          <Text style={styles.drawSubtext}>
            All items have been named!
          </Text>
        </>
      ) : (
        <Text style={[styles.winnerText, { color: getPlayerColor(winner!, players) }]}>
          {winner} Wins!
        </Text>
      )}

      {eliminatedPlayers.length > 0 && (
        <View style={styles.eliminationOrder}>
          <Text style={styles.eliminationTitle}>Elimination order</Text>
          {eliminatedPlayers.map((player, i) => {
            const color = getPlayerColor(player, players);
            return (
              <Text key={player} style={[styles.eliminatedPlayer, { color }]}>
                {i + 1}. {player}
              </Text>
            );
          })}
        </View>
      )}

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => setHistoryVisible(true)}
        >
          <Text style={styles.secondaryBtnText}>
            History ({turnRecords.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => setShowStats(!showStats)}
        >
          <Text style={styles.secondaryBtnText}>
            {showStats ? 'Hide Stats' : 'Show Stats'}
          </Text>
        </TouchableOpacity>
      </View>

      {showStats && <StatsPanel stats={stats} players={players} />}

      {hintPokemon.length > 0 && (
        <View style={styles.hintsSection}>
          <Text style={styles.hintsTitle}>Who's that Pokemon?</Text>
          <Text style={styles.hintsSubtext}>Tap to reveal</Text>
          <View style={styles.hintsRow}>
            {hintPokemon.map((hint, i) => (
              <SilhouetteCard
                key={i}
                hint={hint}
                isCountdownBlocked={countdownActive}
                onCountdownStart={() => setCountdownActive(true)}
                onCountdownEnd={() => setCountdownActive(false)}
                onCardTap={setSelectedPokemon}
              />
            ))}
          </View>
        </View>
      )}

      {bonusPokemon.length > 0 && (
        <View style={styles.hintsSection}>
          <Text style={styles.hintsTitle}>Try these next time!</Text>
          <View style={styles.hintsRow}>
            {bonusPokemon.map((hint, i) => (
              <RevealedCard key={i} hint={hint} onCardTap={setSelectedPokemon} />
            ))}
          </View>
        </View>
      )}

      {selectedPokemon && (
        <PokemonCardModal
          visible
          pokemonName={selectedPokemon.pokemonName}
          pokemonId={selectedPokemon.pokemonId}
          onClose={() => setSelectedPokemon(null)}
        />
      )}

      <TouchableOpacity
        style={styles.playAgainBtn}
        onPress={() => navigation.popToTop()}
      >
        <Text style={styles.playAgainText}>Play Again</Text>
      </TouchableOpacity>

      <HistoryModal
        visible={historyVisible}
        onClose={() => setHistoryVisible(false)}
        turnRecords={turnRecords}
        highlightItem={null}
        players={players}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  content: {
    padding: 24,
    paddingTop: 120,
    alignItems: 'center',
    minHeight: '100%',
  },
  winnerText: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  drawText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#ffd166',
  },
  drawSubtext: {
    fontSize: 16,
    color: '#a0a0b0',
    marginTop: 8,
  },
  eliminationOrder: {
    marginTop: 24,
    alignItems: 'center',
  },
  eliminationTitle: {
    color: '#a0a0b0',
    fontSize: 14,
    marginBottom: 8,
  },
  eliminatedPlayer: {
    fontSize: 16,
    marginVertical: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 32,
  },
  secondaryBtn: {
    backgroundColor: '#2a2a3e',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  secondaryBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 16,
  },
  hintsSection: {
    marginTop: 24,
    alignItems: 'center',
    width: '100%',
  },
  hintsTitle: {
    color: '#ffa62b',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  hintsSubtext: {
    color: '#a0a0b0',
    fontSize: 12,
    marginBottom: 12,
  },
  hintsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  hintCard: {
    alignItems: 'center',
    backgroundColor: '#2a2a3e',
    borderRadius: 12,
    padding: 8,
    width: 90,
  },
  hintImage: {
    width: 64,
    height: 64,
  },
  hintName: {
    color: '#ffffff',
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  hintNameHidden: {
    color: '#a0a0b0',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 4,
    textAlign: 'center',
  },
  countdownText: {
    color: '#ffd166',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 4,
    textAlign: 'center',
  },
  playAgainBtn: {
    marginTop: 'auto',
    marginBottom: 40,
    backgroundColor: '#4361ee',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
  },
  playAgainText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 18,
  },
});
