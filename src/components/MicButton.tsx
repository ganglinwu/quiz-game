import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import type { AudioManager } from '../audio/AudioManager';
import { MIC_READY_SFX } from '../audio/tracks';

type MicPhase = 'idle' | 'preparing' | 'ready';

interface Props {
  onTranscription: (text: string) => void;
  onError: (message: string) => void;
  isListening: boolean;
  setIsListening: (v: boolean) => void;
  color: string;
  audioManager: AudioManager;
}

export default function MicButton({
  onTranscription,
  onError,
  isListening,
  setIsListening,
  color,
  audioManager,
}: Props) {
  const pressStart = useRef(0);
  const [micPhase, setMicPhase] = useState<MicPhase>('idle');
  const safetyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rotationAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotationLoop = useRef<Animated.CompositeAnimation | null>(null);
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const transitionToReady = () => {
    if (safetyTimeout.current) {
      clearTimeout(safetyTimeout.current);
      safetyTimeout.current = null;
    }
    setMicPhase('ready');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    audioManager.playSfx(MIC_READY_SFX);
  };

  useEffect(() => {
    if (micPhase === 'preparing') {
      rotationAnim.setValue(0);
      const loop = Animated.loop(
        Animated.timing(rotationAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      rotationLoop.current = loop;
      loop.start();
    } else {
      rotationLoop.current?.stop();
      rotationLoop.current = null;
    }
  }, [micPhase === 'preparing']);

  useEffect(() => {
    if (micPhase === 'ready') {
      pulseAnim.setValue(1);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      pulseLoop.current = loop;
      loop.start();
    } else {
      pulseLoop.current?.stop();
      pulseLoop.current = null;
      pulseAnim.setValue(1);
    }
  }, [micPhase === 'ready']);

  useEffect(() => {
    return () => {
      if (safetyTimeout.current) clearTimeout(safetyTimeout.current);
    };
  }, []);

  useSpeechRecognitionEvent('audiostart', () => {
    if (micPhase === 'preparing') {
      transitionToReady();
    }
  });

  useSpeechRecognitionEvent('result', (event) => {
    console.log('[MicButton] result event:', JSON.stringify(event.results));
    if (event.isFinal && event.results[0]) {
      const transcript = event.results[0].transcript.trim();
      console.log(`[MicButton] final transcript: "${transcript}"`);
      if (transcript) {
        onTranscription(transcript);
      } else {
        onError("Didn't catch that, try again");
      }
      setIsListening(false);
      setMicPhase('idle');
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    console.log('[MicButton] error event:', JSON.stringify(event));
    onError("Didn't catch that, try again");
    setIsListening(false);
    setMicPhase('idle');
  });

  const handlePressIn = async () => {
    pressStart.current = Date.now();
    setIsListening(true);
    setMicPhase('preparing');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    safetyTimeout.current = setTimeout(() => {
      setMicPhase((current) => {
        if (current === 'preparing') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          audioManager.playSfx(MIC_READY_SFX);
          return 'ready';
        }
        return current;
      });
    }, 2000);

    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!result.granted) {
      onError('Microphone permission denied. Use text input instead.');
      setIsListening(false);
      setMicPhase('idle');
      if (safetyTimeout.current) {
        clearTimeout(safetyTimeout.current);
        safetyTimeout.current = null;
      }
      return;
    }

    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: false,
    });
  };

  const handlePressOut = () => {
    const duration = Date.now() - pressStart.current;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (duration < 300) {
      onError('Hold the button while speaking');
      ExpoSpeechRecognitionModule.abort();
      setIsListening(false);
      setMicPhase('idle');
      if (safetyTimeout.current) {
        clearTimeout(safetyTimeout.current);
        safetyTimeout.current = null;
      }
      return;
    }
    ExpoSpeechRecognitionModule.stop();
  };

  const rotationInterpolation = rotationAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const isActive = micPhase !== 'idle';

  return (
    <View style={styles.wrapper}>
      <View style={styles.buttonContainer}>
        {micPhase === 'preparing' && (
          <Animated.View
            style={[
              styles.spinnerRing,
              {
                borderTopColor: color,
                borderRightColor: color,
                transform: [{ rotate: rotationInterpolation }],
              },
            ]}
          />
        )}
        <Animated.View
          style={[
            { transform: [{ scale: micPhase === 'ready' ? pulseAnim : 1 }] },
          ]}
        >
          <Pressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            style={[
              styles.button,
              { backgroundColor: color },
              isActive && styles.buttonActive,
            ]}
          >
            <Text style={styles.icon}>{isActive ? '...' : 'MIC'}</Text>
          </Pressable>
        </Animated.View>
      </View>
      <Text style={styles.hint}>Hold to speak</Text>
    </View>
  );
}

const BUTTON_SIZE = 80;
const SPINNER_SIZE = 96;

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },
  buttonContainer: {
    width: SPINNER_SIZE,
    height: SPINNER_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spinnerRing: {
    position: 'absolute',
    width: SPINNER_SIZE,
    height: SPINNER_SIZE,
    borderRadius: SPINNER_SIZE / 2,
    borderWidth: 3,
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonActive: {
    opacity: 0.7,
  },
  icon: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  hint: {
    color: '#a0a0b0',
    fontSize: 12,
    marginTop: 8,
  },
});
