import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { ALL_GENS, getPokemonCountByGen, getGenForPokemon } from '../data/pokemon-db';

interface Props {
  visible: boolean;
  onClose: () => void;
  activeGenerations: number[];
  usedItems: string[];
  onProposeAdd: (generation: number) => void;
  onProposeRemove: (generation: number) => void;
}

export default function GenerationSettingsModal({
  visible,
  onClose,
  activeGenerations,
  usedItems,
  onProposeAdd,
  onProposeRemove,
}: Props) {
  const usedGens = new Set(
    usedItems.map((item) => getGenForPokemon(item)).filter((g): g is number => g !== null)
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.title}>Generations</Text>

          {/* Scrolls so the now-9 generation rows (Gen 1-9 after the gen-7-9
              expansion) can't overflow the top of this bottom-anchored sheet and
              clip the first rows on smaller devices — mirrors QuizFilterModal /
              PokedexFilterModal (maxHeight + ScrollView). */}
          <ScrollView showsVerticalScrollIndicator={false}>
            {ALL_GENS.map((gen) => {
              const active = activeGenerations.includes(gen);
              const count = getPokemonCountByGen(gen);
              const hasUsedItems = usedGens.has(gen);
              const canRemove = active && activeGenerations.length > 1 && !hasUsedItems;

              return (
                <View key={gen} style={styles.row}>
                  <View>
                    <Text style={[styles.genLabel, active && styles.genLabelActive]}>
                      Gen {gen} ({count})
                    </Text>
                    {active && hasUsedItems && (
                      <Text style={styles.hint}>Pokemon from this gen have been named</Text>
                    )}
                  </View>
                  {active ? (
                    <TouchableOpacity
                      style={[styles.toggleBtn, styles.removeBtn, !canRemove && styles.disabledBtn]}
                      disabled={!canRemove}
                      onPress={() => {
                        onProposeRemove(gen);
                        onClose();
                      }}
                    >
                      <Text style={[styles.toggleText, !canRemove && styles.disabledText]}>Remove</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.toggleBtn, styles.addBtn]}
                      onPress={() => {
                        onProposeAdd(gen);
                        onClose();
                      }}
                    >
                      <Text style={styles.toggleText}>Add</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </ScrollView>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  genLabel: {
    color: '#a0a0b0',
    fontSize: 16,
  },
  genLabelActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  hint: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  toggleBtn: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  addBtn: {
    backgroundColor: '#2a9d8f',
  },
  removeBtn: {
    backgroundColor: '#e63946',
  },
  disabledBtn: {
    backgroundColor: '#2a2a3e',
  },
  toggleText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledText: {
    color: '#666',
  },
  closeBtn: {
    marginTop: 20,
    backgroundColor: '#2a2a3e',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
