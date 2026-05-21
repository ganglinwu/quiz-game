import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';

interface Props {
  size?: number;
}

export default function PokeballLoader({ size = 48 }: Props) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const wobble = Animated.sequence([
      Animated.timing(rotation, {
        toValue: 1,
        duration: 150,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(rotation, {
        toValue: -1,
        duration: 300,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(rotation, {
        toValue: 0,
        duration: 150,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.delay(400),
    ]);

    Animated.loop(wobble).start();

    return () => rotation.stopAnimation();
  }, [rotation]);

  const spin = rotation.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-20deg', '0deg', '20deg'],
  });

  const half = size / 2;
  const bandHeight = Math.max(size * 0.1, 4);
  const buttonSize = size * 0.28;
  const buttonBorder = Math.max(size * 0.05, 2);

  return (
    <Animated.View
      style={[
        styles.ball,
        {
          width: size,
          height: size,
          borderRadius: half,
          transform: [{ rotate: spin }],
        },
      ]}
    >
      <View style={[styles.topHalf, { height: half, borderTopLeftRadius: half, borderTopRightRadius: half }]} />
      <View style={[styles.bottomHalf, { height: half, borderBottomLeftRadius: half, borderBottomRightRadius: half }]} />
      <View style={[styles.band, { height: bandHeight, top: half - bandHeight / 2 }]} />
      <View
        style={[
          styles.button,
          {
            width: buttonSize,
            height: buttonSize,
            borderRadius: buttonSize / 2,
            borderWidth: buttonBorder,
            top: half - buttonSize / 2,
            left: half - buttonSize / 2,
          },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ball: {
    overflow: 'hidden',
  },
  topHalf: {
    backgroundColor: '#e63946',
    width: '100%',
  },
  bottomHalf: {
    backgroundColor: '#f0f0f0',
    width: '100%',
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#2a2a2a',
  },
  button: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    borderColor: '#2a2a2a',
  },
});
