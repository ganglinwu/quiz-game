import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { HintLimit } from '../types';
import { PLAYER_COLORS } from '../utils/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'PlayerSetup'>;

const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;

const HINT_OPTIONS: { label: string; value: HintLimit }[] = [
  { label: 'Off', value: 0 },
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '∞', value: 'unlimited' },
];

export default function PlayerSetupScreen({ navigation, route }: Props) {
  const { category } = route.params;
  const [names, setNames] = useState(['', '']);
  const [hintLimit, setHintLimit] = useState<HintLimit>(0);

  const updateName = (index: number, value: string) => {
    const updated = [...names];
    updated[index] = value;
    setNames(updated);
  };

  const addPlayer = () => {
    if (names.length < MAX_PLAYERS) {
      setNames([...names, '']);
    }
  };

  const removePlayer = (index: number) => {
    if (names.length > MIN_PLAYERS) {
      setNames(names.filter((_, i) => i !== index));
    }
  };

  const startGame = () => {
    const trimmed = names.map((n, i) =>
      n.trim() || `Player ${i + 1}`
    );
    const unique = new Set(trimmed.map((n) => n.toLowerCase()));
    if (unique.size !== trimmed.length) {
      Alert.alert('Duplicate names', 'Each player needs a unique name.');
      return;
    }
    navigation.replace('Game', {
      category,
      players: trimmed,
      hintLimit: hintLimit === 0 ? undefined : hintLimit,
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Players</Text>
      <Text style={styles.subtitle}>
        {category.type === 'pokemon'
          ? category.quizConfig
            ? `Quiz Mode (${category.quizConfig.difficulty.charAt(0).toUpperCase() + category.quizConfig.difficulty.slice(1)}) · Gen ${category.generations.sort().join(', ')}`
            : `Pokemon Gen ${category.generations.sort().join(', ')}`
          : 'Fruits'}
      </Text>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {names.map((name, i) => (
          <View key={i} style={styles.row}>
            <View
              style={[styles.colorDot, { backgroundColor: PLAYER_COLORS[i] }]}
            />
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={(v) => updateName(i, v)}
              placeholder={`Player ${i + 1}`}
              placeholderTextColor="#666"
              autoCorrect={false}
              autoCapitalize="words"
            />
            {names.length > MIN_PLAYERS && (
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => removePlayer(i)}
              >
                <Text style={styles.removeText}>X</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>

      {names.length < MAX_PLAYERS && (
        <TouchableOpacity style={styles.addBtn} onPress={addPlayer}>
          <Text style={styles.addText}>+ Add Player</Text>
        </TouchableOpacity>
      )}

      {category.type === 'pokemon' && (
        <View style={styles.hintSection}>
          <Text style={styles.hintLabel}>Hints per player</Text>
          <View style={styles.hintOptions}>
            {HINT_OPTIONS.map((opt) => {
              const selected = hintLimit === opt.value;
              return (
                <TouchableOpacity
                  key={opt.label}
                  style={[styles.hintChip, selected && styles.hintChipSelected]}
                  onPress={() => setHintLimit(opt.value)}
                >
                  <Text style={[styles.hintChipText, selected && styles.hintChipTextSelected]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.startBtn} onPress={startGame}>
        <Text style={styles.startText}>Start Game</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    padding: 24,
    paddingTop: 80,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#a0a0b0',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 32,
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  colorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#2a2a3e',
    borderRadius: 12,
    padding: 14,
    color: '#ffffff',
    fontSize: 16,
  },
  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e63946',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  addBtn: {
    backgroundColor: '#2a2a3e',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  addText: {
    color: '#5e9eff',
    fontWeight: '600',
    fontSize: 16,
  },
  hintSection: {
    marginTop: 20,
    alignItems: 'center',
  },
  hintLabel: {
    color: '#a0a0b0',
    fontSize: 14,
    marginBottom: 10,
  },
  hintOptions: {
    flexDirection: 'row',
    gap: 10,
  },
  hintChip: {
    backgroundColor: '#2a2a3e',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  hintChipSelected: {
    backgroundColor: '#4361ee',
  },
  hintChipText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '600',
  },
  hintChipTextSelected: {
    color: '#ffffff',
  },
  startBtn: {
    backgroundColor: '#4361ee',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 40,
  },
  startText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 18,
  },
});
