import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';

// Kept local (mirroring QuizFilterModal's local copies) so the Pokédex type
// filter is self-contained and doesn't couple to quiz-mode internals.
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

interface Props {
  visible: boolean;
  onClose: () => void;
  selectedTypes: string[];
  onTypesChange: (types: string[]) => void;
}

export default function PokedexFilterModal({ visible, onClose, selectedTypes, onTypesChange }: Props) {
  const selected = new Set(selectedTypes);

  const toggleType = (type: string) => {
    const next = new Set(selected);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    onTypesChange([...next]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.title}>Filter by Type</Text>
          <Text style={styles.hint}>
            {selected.size === 0
              ? 'Showing all types'
              : `Showing ${selected.size === 1 ? 'one type' : `${selected.size} types`}`}
          </Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.chipGrid}>
              {ALL_POKEMON_TYPES.map((type) => {
                const active = selected.has(type);
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
          </ScrollView>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.clearBtn, selected.size === 0 && styles.clearBtnDisabled]}
              onPress={() => onTypesChange([])}
              disabled={selected.size === 0}
            >
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
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
  },
  hint: {
    color: '#a0a0b0',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 18,
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
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  clearBtn: {
    flex: 1,
    backgroundColor: '#2a2a3e',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  clearBtnDisabled: {
    opacity: 0.4,
  },
  clearText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  doneBtn: {
    flex: 2,
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
