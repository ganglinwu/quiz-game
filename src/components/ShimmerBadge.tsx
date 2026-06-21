import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';

interface Props {
  label: string;
  color: string;
}

export default function ShimmerBadge({ label, color }: Props) {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 2400,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [shimmerAnim]);

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [-60, 120, 120],
  });

  const sheenOpacity = shimmerAnim.interpolate({
    inputRange: [0, 0.55, 0.7, 0.85, 1],
    outputRange: [0, 0, 0.22, 0, 0],
  });

  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Animated.View style={[styles.sheenOverlay, { opacity: sheenOpacity }]} />
      <Animated.View
        style={[
          styles.shimmerStripe,
          { transform: [{ translateX }, { rotate: '20deg' }] },
        ]}
      />
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 6,
    overflow: 'hidden',
  },
  sheenOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
  },
  shimmerStripe: {
    position: 'absolute',
    top: -10,
    bottom: -10,
    width: 20,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
