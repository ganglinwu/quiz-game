import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { Category, QuizDifficulty, QuizFilter } from '../types';
import { useAudio, useBGM } from '../audio';
import { ALL_GENS, getPokemonCountByGen } from '../data/pokemon-db';
import QuizFilterModal from '../components/QuizFilterModal';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const { isMuted, toggleMute } = useAudio();
  useBGM('title');
  const [selectedGens, setSelectedGens] = useState<Set<number>>(new Set([1]));
  const [expanded, setExpanded] = useState(false);
  const [quizMode, setQuizMode] = useState(false);
  const [quizDifficulty, setQuizDifficulty] = useState<QuizDifficulty>('medium');
  const [quizFilter, setQuizFilter] = useState<QuizFilter>({
    includeLegendary: true,
    includeMythical: true,
  });
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  const totalPokemon = useMemo(() => {
    return Array.from(selectedGens).reduce(
      (sum, g) => sum + getPokemonCountByGen(g),
      0
    );
  }, [selectedGens]);

  const toggleGen = (gen: number) => {
    setSelectedGens((prev) => {
      const next = new Set(prev);
      if (next.has(gen)) {
        if (next.size > 1) next.delete(gen);
      } else {
        next.add(gen);
      }
      return next;
    });
  };

  const startPokemon = () => {
    const category: Category = {
      type: 'pokemon',
      generations: Array.from(selectedGens).sort(),
      ...(quizMode && {
        quizConfig: {
          difficulty: quizDifficulty,
          filter: quizFilter,
        },
      }),
    };
    navigation.navigate('PlayerSetup', { category });
  };

  const startFruits = () => {
    const category: Category = { type: 'fruits' };
    navigation.navigate('PlayerSetup', { category });
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.muteBtn} onPress={toggleMute}>
        <Text style={[styles.muteIcon, isMuted && styles.mutedIcon]}>♪</Text>
        {isMuted && <View style={styles.muteStrike} />}
      </TouchableOpacity>
      <Text style={styles.title}>Name It!</Text>
      <Text style={styles.subtitle}>Pick a category</Text>

      <TouchableOpacity
        style={[styles.card, styles.pokemonCard]}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.8}
      >
        <Text style={styles.cardTitle}>Pokemon</Text>
        <Text style={styles.cardSubtitle}>
          {totalPokemon} Pokemon · Gen {Array.from(selectedGens).sort().join(', ')}
        </Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.genPicker}>
          {ALL_GENS.map((gen) => {
            const active = selectedGens.has(gen);
            const count = getPokemonCountByGen(gen);
            return (
              <TouchableOpacity
                key={gen}
                style={[styles.genChip, active && styles.genChipActive]}
                onPress={() => toggleGen(gen)}
              >
                <Text style={[styles.genChipText, active && styles.genChipTextActive]}>
                  Gen {gen} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}

          <View style={styles.quizToggleRow}>
            <Text style={styles.quizToggleLabel}>Quiz Mode</Text>
            <Switch
              value={quizMode}
              onValueChange={setQuizMode}
              trackColor={{ false: '#2a2a3e', true: '#4361ee' }}
            />
          </View>

          {quizMode && (
            <>
              <View style={styles.difficultyRow}>
                {(['easy', 'medium', 'hard'] as const).map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.difficultyChip, quizDifficulty === d && styles.difficultyChipActive]}
                    onPress={() => setQuizDifficulty(d)}
                  >
                    <Text style={[styles.difficultyText, quizDifficulty === d && styles.difficultyTextActive]}>
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.filterBtn} onPress={() => setFilterModalVisible(true)}>
                <Text style={styles.filterBtnText}>Filters</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.playBtn} onPress={startPokemon}>
            <Text style={styles.playBtnText}>Play</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={[styles.card, styles.fruitsCard]}
        onPress={startFruits}
      >
        <Text style={styles.cardTitle}>Fruits</Text>
        <Text style={styles.cardSubtitle}>90 Fruits</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.pokedexBtn}
        onPress={() => navigation.navigate('Pokedex')}
      >
        <Text style={styles.pokedexBtnText}>Browse Pokédex</Text>
      </TouchableOpacity>

      <QuizFilterModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        filter={quizFilter}
        onFilterChange={setQuizFilter}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    padding: 24,
  },
  muteBtn: {
    position: 'absolute',
    top: 60,
    right: 24,
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
  title: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#a0a0b0',
    marginBottom: 48,
  },
  card: {
    width: '100%',
    padding: 28,
    borderRadius: 16,
    marginBottom: 20,
  },
  pokemonCard: {
    backgroundColor: '#e63946',
  },
  fruitsCard: {
    backgroundColor: '#2a9d8f',
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#ffffffcc',
    marginTop: 4,
  },
  genPicker: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  genChip: {
    backgroundColor: '#2a2a3e',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#2a2a3e',
  },
  genChipActive: {
    borderColor: '#e63946',
    backgroundColor: '#3a2a3e',
  },
  genChipText: {
    color: '#a0a0b0',
    fontSize: 14,
    fontWeight: '600',
  },
  genChipTextActive: {
    color: '#ffffff',
  },
  quizToggleRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  quizToggleLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  difficultyRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
  },
  difficultyChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#2a2a3e',
    backgroundColor: '#2a2a3e',
    alignItems: 'center',
  },
  difficultyChipActive: {
    borderColor: '#4361ee',
    backgroundColor: '#2a3a5e',
  },
  difficultyText: {
    color: '#a0a0b0',
    fontSize: 14,
    fontWeight: '600',
  },
  difficultyTextActive: {
    color: '#ffffff',
  },
  filterBtn: {
    width: '100%',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#4361ee',
    alignItems: 'center',
  },
  filterBtnText: {
    color: '#4361ee',
    fontSize: 14,
    fontWeight: '600',
  },
  playBtn: {
    backgroundColor: '#e63946',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginLeft: 'auto',
  },
  playBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  pokedexBtn: {
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#a0a0b0',
  },
  pokedexBtnText: {
    color: '#a0a0b0',
    fontSize: 16,
    fontWeight: '600',
  },
});
