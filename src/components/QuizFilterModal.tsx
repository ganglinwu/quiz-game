import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Switch } from 'react-native';
import { QuizFilter } from '../types';

const ALL_POKEMON_TYPES = [
  'bug', 'dark', 'dragon', 'electric', 'fairy', 'fighting', 'fire', 'flying',
  'ghost', 'grass', 'ground', 'ice', 'normal', 'poison', 'psychic', 'rock',
  'steel', 'water',
];

const TYPE_COLORS: Record<string, string> = {
  bug: '#A8B820', dark: '#705848', dragon: '#7038F8', electric: '#F8D030',
  fairy: '#EE99AC', fighting: '#C03028', fire: '#F08030', flying: '#A890F0',
  ghost: '#705898', grass: '#78C850', ground: '#E0C068', ice: '#98D8D8',
  normal: '#A8A878', poison: '#A040A0', psychic: '#F85888', rock: '#B8A038',
  steel: '#B8B8D0', water: '#6890F0',
};

const EVOLUTION_STAGES = [
  { key: 'base' as const, label: 'Base' },
  { key: 'middle' as const, label: 'Middle' },
  { key: 'final' as const, label: 'Final' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  filter: QuizFilter;
  onFilterChange: (filter: QuizFilter) => void;
}

export default function QuizFilterModal({ visible, onClose, filter, onFilterChange }: Props) {
  const selectedTypes = new Set(filter.types ?? []);
  const allTypesSelected = selectedTypes.size === 0;
  const selectedStages = new Set(filter.evolutionStages ?? []);
  const allStagesSelected = selectedStages.size === 0;

  const toggleType = (type: string) => {
    const next = new Set(selectedTypes);
    if (allTypesSelected) {
      ALL_POKEMON_TYPES.forEach((t) => { if (t !== type) next.add(t); });
    } else if (next.has(type)) {
      next.delete(type);
      if (next.size === 0) {
        onFilterChange({ ...filter, types: undefined });
        return;
      }
    } else {
      next.add(type);
      if (next.size === ALL_POKEMON_TYPES.length) {
        onFilterChange({ ...filter, types: undefined });
        return;
      }
    }
    onFilterChange({ ...filter, types: [...next] });
  };

  const toggleStage = (stage: 'base' | 'middle' | 'final') => {
    const next = new Set(selectedStages);
    if (allStagesSelected) {
      EVOLUTION_STAGES.forEach((s) => { if (s.key !== stage) next.add(s.key); });
    } else if (next.has(stage)) {
      next.delete(stage);
      if (next.size === 0) {
        onFilterChange({ ...filter, evolutionStages: undefined });
        return;
      }
    } else {
      next.add(stage);
      if (next.size === EVOLUTION_STAGES.length) {
        onFilterChange({ ...filter, evolutionStages: undefined });
        return;
      }
    }
    onFilterChange({ ...filter, evolutionStages: [...next] });
  };

  const dualTypeValue = filter.allowDualType;

  const setDualType = (value: boolean | undefined) => {
    onFilterChange({ ...filter, allowDualType: value });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>Quiz Filters</Text>

            <Text style={styles.sectionTitle}>Types</Text>
            <View style={styles.chipGrid}>
              {ALL_POKEMON_TYPES.map((type) => {
                const active = allTypesSelected || selectedTypes.has(type);
                return (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeChip,
                      active && { backgroundColor: TYPE_COLORS[type], borderColor: TYPE_COLORS[type] },
                    ]}
                    onPress={() => toggleType(type)}
                  >
                    <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Include</Text>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Legendary</Text>
              <Switch
                value={filter.includeLegendary}
                onValueChange={(v) => onFilterChange({ ...filter, includeLegendary: v })}
                trackColor={{ false: '#2a2a3e', true: '#4361ee' }}
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Mythical</Text>
              <Switch
                value={filter.includeMythical}
                onValueChange={(v) => onFilterChange({ ...filter, includeMythical: v })}
                trackColor={{ false: '#2a2a3e', true: '#4361ee' }}
              />
            </View>

            <Text style={styles.sectionTitle}>Evolution Stage</Text>
            <View style={styles.chipRow}>
              {EVOLUTION_STAGES.map((s) => {
                const active = allStagesSelected || selectedStages.has(s.key);
                return (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.stageChip, active && styles.stageChipActive]}
                    onPress={() => toggleStage(s.key)}
                  >
                    <Text style={[styles.stageChipText, active && styles.stageChipTextActive]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Type Pairing</Text>
            <View style={styles.chipRow}>
              {([
                { key: undefined, label: 'Any' },
                { key: false, label: 'Mono' },
                { key: true, label: 'Dual' },
              ] as const).map((opt) => {
                const active = dualTypeValue === opt.key;
                return (
                  <TouchableOpacity
                    key={String(opt.key)}
                    style={[styles.stageChip, active && styles.stageChipActive]}
                    onPress={() => setDualType(opt.key)}
                  >
                    <Text style={[styles.stageChipText, active && styles.stageChipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 48,
    maxHeight: '80%',
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#a0a0b0',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#2a2a3e',
    backgroundColor: '#2a2a3e',
  },
  typeChipText: {
    color: '#a0a0b0',
    fontSize: 13,
    fontWeight: '600',
  },
  typeChipTextActive: {
    color: '#ffffff',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  switchLabel: {
    color: '#ffffff',
    fontSize: 16,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 10,
  },
  stageChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#2a2a3e',
    backgroundColor: '#2a2a3e',
    alignItems: 'center',
  },
  stageChipActive: {
    borderColor: '#4361ee',
    backgroundColor: '#2a3a5e',
  },
  stageChipText: {
    color: '#a0a0b0',
    fontSize: 14,
    fontWeight: '600',
  },
  stageChipTextActive: {
    color: '#ffffff',
  },
  doneBtn: {
    marginTop: 20,
    backgroundColor: '#4361ee',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
