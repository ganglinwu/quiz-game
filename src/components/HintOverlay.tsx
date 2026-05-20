import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { HintPhase } from '../types';
import { getArtworkUrl } from '../utils/pokeApi';

interface Props {
  phase: HintPhase;
  pokemonId: number;
  canReveal: boolean;
  onReveal: () => void;
  onDismiss: () => void;
}

export default function HintOverlay({ phase, pokemonId, canReveal, onReveal, onDismiss }: Props) {
  if (phase === 'none') return null;

  const uri = getArtworkUrl(pokemonId);
  const isSilhouette = phase === 'silhouette';

  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {isSilhouette ? "Who's that Pokemon?" : 'Hint revealed!'}
      </Text>

      <View style={styles.imageContainer}>
        <Image
          key={isSilhouette ? 'silhouette' : 'revealed'}
          source={{ uri }}
          style={[styles.image, isSilhouette && styles.silhouette]}
          resizeMode="contain"
        />
      </View>

      <View style={styles.buttons}>
        {isSilhouette ? (
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.revealBtn, !canReveal && styles.disabledBtn]}
              onPress={onReveal}
              disabled={!canReveal}
            >
              <Text style={styles.btnText}>
                {canReveal ? 'Reveal' : 'No hints left'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.knowItBtn} onPress={onDismiss}>
              <Text style={styles.btnText}>I know it!</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.closeBtn} onPress={onDismiss}>
            <Text style={styles.btnText}>Close</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e2a4a',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffd700',
    marginBottom: 12,
    textAlign: 'center',
  },
  imageContainer: {
    width: 160,
    height: 160,
    backgroundColor: '#2a4a6e',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  image: {
    width: 130,
    height: 130,
  },
  silhouette: {
    tintColor: '#0a0a1a',
  },
  buttons: {
    width: '100%',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  revealBtn: {
    flex: 1,
    backgroundColor: '#e63946',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  disabledBtn: {
    backgroundColor: '#555',
    opacity: 0.6,
  },
  knowItBtn: {
    flex: 1,
    backgroundColor: '#4361ee',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeBtn: {
    backgroundColor: '#4361ee',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
});
