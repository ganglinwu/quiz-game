import React, { useState } from 'react';
import { View, Image, Animated, StyleSheet } from 'react-native';
import type { ImageStyle, StyleProp } from 'react-native';
import PokeballLoader from './PokeballLoader';

interface Props {
  uri: string;
  style: StyleProp<ImageStyle>;
  loaderSize?: number;
}

export default function NetworkImage({ uri, style, loaderSize = 28 }: Props) {
  const [loaded, setLoaded] = useState(false);
  const opacity = React.useRef(new Animated.Value(0)).current;

  const handleLoad = () => {
    setLoaded(true);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  return (
    <View style={styles.container}>
      {!loaded && (
        <View style={styles.loader}>
          <PokeballLoader size={loaderSize} />
        </View>
      )}
      <Animated.Image
        source={{ uri }}
        style={[style, { opacity }]}
        resizeMode="contain"
        onLoad={handleLoad}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
