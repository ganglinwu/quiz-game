import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { Category, HintLimit } from '../types';
import { GameProvider, useGame } from '../state/GameContext';
import { useAudio, useBGMDynamic, useAudioSpeechBridge, HINT_SUCCESS_SFX } from '../audio';
import type { TrackId } from '../audio';
import { findDuplicate, fuzzyMatchWithGenDetection, fuzzyMatch } from '../utils/fuzzyMatch';
import { getPlayerColor } from '../utils/colors';
import { getPokemonForGens, getAllPokemon, getGenForPokemon } from '../data/pokemon-db';
import MicButton from '../components/MicButton';
import TextInputField from '../components/TextInputField';
import ConfirmationOverlay from '../components/ConfirmationOverlay';
import HintOverlay from '../components/HintOverlay';
import HistoryModal from '../components/HistoryModal';
import Toast from '../components/Toast';
import SuccessBanner from '../components/SuccessBanner';
import GenerationVoteOverlay from '../components/GenerationVoteOverlay';
import GenerationSettingsModal from '../components/GenerationSettingsModal';
import { getAllFruits } from '../data/pokemon-db';
import { logVoiceResult } from '../utils/voiceLogger';

type Props = NativeStackScreenProps<RootStackParamList, 'Game'>;

function GameContent({ navigation, category }: { navigation: Props['navigation']; category: Category }) {
  const { state, dispatch } = useGame();
  const { isMuted, toggleMute, manager } = useAudio();
  const [historyVisible, setHistoryVisible] = useState(false);
  const [highlightItem, setHighlightItem] = useState<string | null>(null);
  const [duplicateItem, setDuplicateItem] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [hintSuccess, setHintSuccess] = useState(false);
  const pendingHintRef = useRef<string | null>(null);

  const bgmTrack: TrackId = state.hintPhase === 'silhouette' ? 'hint' : 'game';
  useBGMDynamic(bgmTrack);
  useAudioSpeechBridge(state.isListening);

  useEffect(() => {
    if (state.hintPhase === 'silhouette' && state.hintPokemonName) {
      pendingHintRef.current = state.hintPokemonName;
    } else if (state.hintPhase === 'revealed') {
      pendingHintRef.current = null;
    }
  }, [state.hintPhase, state.hintPokemonName]);

  const isPokemon = category.type === 'pokemon';

  const itemNames = useMemo(() => {
    if (isPokemon) {
      return getPokemonForGens(state.activeGenerations).map((p) => p.name);
    }
    return getAllFruits().map((f) => f.name);
  }, [isPokemon, state.activeGenerations]);

  const allPokemonNames = useMemo(() => {
    if (!isPokemon) return [];
    return getAllPokemon().map((p) => p.name);
  }, [isPokemon]);

  const playerColor = getPlayerColor(state.currentPlayer, state.players);

  const lastVoiceInputRef = useRef<string | null>(null);

  const processInput = useCallback(
    (text: string, isVoice: boolean) => {
      setDuplicateItem(null);
      const source = isVoice ? 'voice' : 'text' as const;
      const cat = isPokemon ? 'pokemon' : 'fruits';

      const dupMatch = findDuplicate(text, state.usedItems);
      if (dupMatch) {
        logVoiceResult({ raw: text, matched: dupMatch, confidence: 'exact', distance: 0, source, category: cat });
        if (isVoice) {
          Alert.alert(
            'Already said!',
            `"${dupMatch}" was already mentioned.`,
            [
              { text: 'OK', style: 'cancel' },
              {
                text: 'Show me when',
                onPress: () => {
                  setHighlightItem(dupMatch);
                  setHistoryVisible(true);
                },
              },
            ]
          );
        } else {
          setDuplicateItem(dupMatch);
          dispatch({ type: 'SET_ERROR', message: `"${dupMatch}" was already said!` });
        }
        return;
      }

      if (isPokemon) {
        const result = fuzzyMatchWithGenDetection(
          text, itemNames, allPokemonNames, state.usedItems, getGenForPokemon
        );
        logVoiceResult({ raw: text, matched: result.match, confidence: result.confidence, distance: result.distance, source, category: cat });

        if (result.confidence !== 'none') {
          lastVoiceInputRef.current = text;
        }

        if (result.confidence === 'none') {
          if (isVoice) {
            setToastMessage(`Heard "${text}" — no match found`);
          } else {
            dispatch({ type: 'SET_ERROR', message: `No match for "${text}", try again` });
          }
        } else if (result.generation && !state.activeGenerations.includes(result.generation)) {
          dispatch({
            type: 'PROPOSE_GEN_CHANGE',
            generation: result.generation,
            triggerPokemon: result.match!,
            source: 'auto-detect',
          });
        } else {
          dispatch({ type: 'PROPOSE_ITEM', item: result.match! });
        }
      } else {
        const result = fuzzyMatch(text, itemNames, state.usedItems);
        logVoiceResult({ raw: text, matched: result.match, confidence: result.confidence, distance: result.distance, source, category: cat });

        if (result.confidence !== 'none') {
          lastVoiceInputRef.current = text;
        }

        if (result.confidence === 'none') {
          if (isVoice) {
            setToastMessage(`Heard "${text}" — no match found`);
          } else {
            dispatch({ type: 'SET_ERROR', message: `No match for "${text}", try again` });
          }
        } else {
          dispatch({ type: 'PROPOSE_ITEM', item: result.match! });
        }
      }
    },
    [isPokemon, itemNames, allPokemonNames, state.usedItems, state.activeGenerations, dispatch]
  );

  const handleConfirm = () => {
    const gotHintRight = pendingHintRef.current !== null &&
      state.confirmationItem === pendingHintRef.current;
    if (lastVoiceInputRef.current && state.confirmationItem) {
      logVoiceResult({
        raw: lastVoiceInputRef.current,
        matched: state.confirmationItem,
        confidence: 'exact',
        distance: 0,
        source: 'voice',
        category: isPokemon ? 'pokemon' : 'fruits',
        confirmed: state.confirmationItem,
      });
    }
    lastVoiceInputRef.current = null;
    setDuplicateItem(null);
    dispatch({ type: 'CONFIRM_ITEM' });
    pendingHintRef.current = null;
    if (gotHintRight) {
      setHintSuccess(true);
      manager.playSfx(HINT_SUCCESS_SFX);
    }
  };

  const handleRetry = () => {
    lastVoiceInputRef.current = null;
    setDuplicateItem(null);
    dispatch({ type: 'REJECT_ITEM' });
  };

  const handleShowWhen = () => {
    if (duplicateItem) {
      setHighlightItem(duplicateItem);
      setHistoryVisible(true);
    }
  };

  const hintsEnabled = isPokemon && state.hintLimit !== 0;

  const currentPlayerHintsUsed = state.hintsUsed[state.currentPlayer] ?? 0;
  const canUseHint = hintsEnabled && (
    state.hintLimit === 'unlimited' || currentPlayerHintsUsed < state.hintLimit
  );
  const canReveal = state.hintLimit === 'unlimited' || currentPlayerHintsUsed < (state.hintLimit as number);

  const hintsRemainingLabel = state.hintLimit === 'unlimited'
    ? '∞'
    : `${(state.hintLimit as number) - currentPlayerHintsUsed}`;

  const pokemonItems = useMemo(() => {
    if (!isPokemon) return [];
    return getPokemonForGens(state.activeGenerations);
  }, [isPokemon, state.activeGenerations]);

  const handleHint = useCallback(() => {
    const unused = pokemonItems.filter((p) => !state.usedItems.includes(p.name));
    if (unused.length === 0) return;
    const pick = unused[Math.floor(Math.random() * unused.length)];
    dispatch({ type: 'SHOW_HINT', pokemonName: pick.name, pokemonId: pick.pokedexNumber });
  }, [pokemonItems, state.usedItems, dispatch]);

  const handleGiveUp = () => {
    Alert.alert('Give Up?', 'Are you sure you want to give up?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Give Up',
        style: 'destructive',
        onPress: () => {
          dispatch({ type: 'GIVE_UP' });
        },
      },
    ]);
  };

  if (state.isGameOver && (state.winner || state.isDraw)) {
    const hints = state.revealedHints.filter(
      (h) => !state.usedItems.includes(h.pokemonName)
    );
    if (isPokemon && hints.length < 5) {
      const taken = new Set(hints.map((h) => h.pokemonName));
      const pool = pokemonItems.filter(
        (p) => !state.usedItems.includes(p.name) && !taken.has(p.name)
      );
      while (hints.length < 5 && pool.length > 0) {
        const idx = Math.floor(Math.random() * pool.length);
        const pick = pool.splice(idx, 1)[0];
        hints.push({ pokemonName: pick.name, pokemonId: pick.pokedexNumber, source: 'bonus' });
      }
    }
    navigation.replace('Result', {
      winner: state.winner,
      isDraw: state.isDraw,
      eliminatedPlayers: state.eliminatedPlayers,
      players: state.players,
      turnRecords: state.turnRecords,
      gameStartTime: state.gameStartTime,
      revealedHints: hints,
    });
  }

  const hasConfirmation = state.confirmationItem !== null;
  const hasVotePending = state.pendingGenVote !== null;
  const inputDisabled = hasConfirmation || hasVotePending;
  const activeCount = state.activePlayers.length;

  const categoryLabel = isPokemon
    ? `Pokemon Gen ${state.activeGenerations.sort((a, b) => a - b).join(', ')}`
    : 'Fruits';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.muteBtn} onPress={toggleMute}>
          <Text style={[styles.muteIcon, isMuted && styles.mutedIcon]}>♪</Text>
          {isMuted && <View style={styles.muteStrike} />}
        </TouchableOpacity>
        <Text style={[styles.turnLabel, { color: playerColor }]}>{state.currentPlayer}'s Turn</Text>
        {isPokemon && (
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => setSettingsVisible(true)}
          >
            <Text style={styles.settingsIcon}>⚙</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.categoryLabel}>
        {categoryLabel}
        {activeCount < state.players.length && ` · ${activeCount} players left`}
      </Text>

      <View style={styles.textInputWrapper}>
        <TextInputField onSubmit={(text) => processInput(text, false)} disabled={inputDisabled} clearKey={state.turnRecords.length} />
      </View>

      {state.errorMessage && (
        <View style={styles.errorContainer}>
          <Text style={styles.error}>{state.errorMessage}</Text>
          {duplicateItem && (
            <TouchableOpacity onPress={handleShowWhen}>
              <Text style={styles.showWhenLink}>Show me when</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {state.hintPhase !== 'none' && state.hintPokemonId !== null && (
        <View style={styles.hintArea}>
          <HintOverlay
            phase={state.hintPhase}
            pokemonId={state.hintPokemonId}
            canReveal={canReveal}
            onReveal={() => dispatch({ type: 'REVEAL_HINT' })}
            onDismiss={() => dispatch({ type: 'DISMISS_HINT' })}
          />
        </View>
      )}

      <View style={styles.bottomArea}>
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.historyBtn}
            onPress={() => {
              setHighlightItem(null);
              setHistoryVisible(true);
            }}
          >
            <Text style={styles.actionText}>History ({state.turnRecords.length})</Text>
          </TouchableOpacity>

          {hintsEnabled && (
            <TouchableOpacity
              style={[styles.hintBtn, !canUseHint && styles.disabledBtn]}
              onPress={handleHint}
              disabled={!canUseHint}
            >
              <Text style={styles.actionText}>Hint ({hintsRemainingLabel})</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.giveUpBtn} onPress={handleGiveUp}>
            <Text style={styles.actionText}>I Give Up</Text>
          </TouchableOpacity>
        </View>

        <MicButton
          onTranscription={(text) => processInput(text, true)}
          onError={(msg) => {
            setDuplicateItem(null);
            setToastMessage(msg);
          }}
          isListening={state.isListening}
          setIsListening={(v) => dispatch({ type: 'SET_LISTENING', isListening: v })}
          color={playerColor}
        />
      </View>

      {hasConfirmation && (
        <ConfirmationOverlay
          item={state.confirmationItem!}
          onConfirm={handleConfirm}
          onRetry={handleRetry}
        />
      )}

      {hasVotePending && (
        <GenerationVoteOverlay
          vote={state.pendingGenVote!}
          activePlayers={state.activePlayers}
          players={state.players}
          onVote={(player, approve) =>
            dispatch({ type: 'CAST_GEN_VOTE', player, approve })
          }
        />
      )}

      <HistoryModal
        visible={historyVisible}
        onClose={() => {
          setHistoryVisible(false);
          setHighlightItem(null);
        }}
        turnRecords={state.turnRecords}
        highlightItem={highlightItem}
        players={state.players}
      />

      {isPokemon && (
        <GenerationSettingsModal
          visible={settingsVisible}
          onClose={() => setSettingsVisible(false)}
          activeGenerations={state.activeGenerations}
          usedItems={state.usedItems}
          onProposeAdd={(gen) =>
            dispatch({ type: 'PROPOSE_GEN_CHANGE', generation: gen, triggerPokemon: null, source: 'settings' })
          }
          onProposeRemove={(gen) =>
            dispatch({ type: 'PROPOSE_GEN_CHANGE', generation: gen, triggerPokemon: null, source: 'settings' })
          }
        />
      )}

      {toastMessage && (
        <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      )}

      {hintSuccess && (
        <SuccessBanner onDismiss={() => setHintSuccess(false)} />
      )}
    </View>
  );
}

export default function GameScreen({ navigation, route }: Props) {
  const { category, players, hintLimit } = route.params;
  return (
    <GameProvider category={category} players={players} hintLimit={hintLimit}>
      <GameContent navigation={navigation} category={category} />
    </GameProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    padding: 24,
    paddingTop: 80,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  turnLabel: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  muteBtn: {
    position: 'absolute',
    left: 0,
    padding: 4,
    width: 28,
    alignItems: 'center',
  },
  muteIcon: {
    fontSize: 20,
    color: '#a0a0b0',
  },
  mutedIcon: {
    opacity: 0.4,
  },
  muteStrike: {
    position: 'absolute',
    width: 24,
    height: 2,
    backgroundColor: '#e63946',
    top: '50%',
    transform: [{ rotate: '-45deg' }],
  },
  settingsBtn: {
    position: 'absolute',
    right: 0,
    padding: 4,
  },
  settingsIcon: {
    fontSize: 22,
    color: '#a0a0b0',
  },
  categoryLabel: {
    fontSize: 14,
    color: '#a0a0b0',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 40,
  },
  textInputWrapper: {
    width: '100%',
  },
  errorContainer: {
    alignItems: 'center',
    marginTop: 16,
  },
  error: {
    color: '#e63946',
    textAlign: 'center',
    fontSize: 14,
  },
  showWhenLink: {
    color: '#5e9eff',
    fontSize: 14,
    marginTop: 6,
    textDecorationLine: 'underline',
  },
  hintArea: {
    flex: 1,
    justifyContent: 'center',
    marginTop: 16,
  },
  bottomArea: {
    marginTop: 'auto',
    alignItems: 'center',
    paddingBottom: 40,
    gap: 24,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  historyBtn: {
    backgroundColor: '#2a2a3e',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  hintBtn: {
    backgroundColor: '#ffa62b',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  disabledBtn: {
    opacity: 0.4,
  },
  giveUpBtn: {
    backgroundColor: '#e63946',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  actionText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
});
