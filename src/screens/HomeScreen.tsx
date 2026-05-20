import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { Category } from '../types';
import { ALL_GENS, POKEMON_BY_GEN } from '../data/pokemon-data';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const [selectedGens, setSelectedGens] = useState<Set<number>>(new Set([1]));
  const [expanded, setExpanded] = useState(false);

  const totalPokemon = useMemo(() => {
    return Array.from(selectedGens).reduce(
      (sum, g) => sum + (POKEMON_BY_GEN[g]?.length ?? 0),
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
    };
    navigation.navigate('PlayerSetup', { category });
  };

  const startFruits = () => {
    const category: Category = { type: 'fruits' };
    navigation.navigate('PlayerSetup', { category });
  };

  return (
    <View style={styles.container}>
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
            const count = POKEMON_BY_GEN[gen]?.length ?? 0;
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
});
