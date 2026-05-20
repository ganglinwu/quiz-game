import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  item: string;
  onConfirm: () => void;
  onRetry: () => void;
}

export default function ConfirmationOverlay({ item, onConfirm, onRetry }: Props) {
  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.label}>Did you mean</Text>
        <Text style={styles.item}>{item}?</Text>
        <View style={styles.buttons}>
          <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm}>
            <Text style={styles.btnText}>Yes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
            <Text style={styles.btnText}>Retry</Text>
          </TouchableOpacity>
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
    padding: 32,
    alignItems: 'center',
    width: '80%',
  },
  label: {
    color: '#a0a0b0',
    fontSize: 16,
  },
  item: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: 'bold',
    marginVertical: 16,
  },
  buttons: {
    flexDirection: 'row',
    gap: 16,
  },
  confirmBtn: {
    backgroundColor: '#2a9d8f',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  retryBtn: {
    backgroundColor: '#e63946',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  btnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
