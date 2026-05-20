import React, { useEffect } from 'react';
import { Text, StyleSheet, Animated } from 'react-native';

interface Props {
  onDismiss: () => void;
}

export default function SuccessBanner({ onDismiss }: Props) {
  const opacity = React.useRef(new Animated.Value(0)).current;
  const scale = React.useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
      ]),
      Animated.delay(2000),
      Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => onDismiss());
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity, transform: [{ scale }] }]}>
      <Text style={styles.title}>You got it right!</Text>
      <Text style={styles.subtitle}>No hints consumed!</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: '35%',
    alignSelf: 'center',
    backgroundColor: '#1a5e2a',
    borderWidth: 2,
    borderColor: '#ffd700',
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 16,
    zIndex: 25,
    alignItems: 'center',
  },
  title: {
    color: '#ffd700',
    fontSize: 20,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#ffffff',
    fontSize: 14,
    marginTop: 4,
  },
});
