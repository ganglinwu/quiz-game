import React, { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

interface Props {
  onTranscription: (text: string) => void;
  onError: (message: string) => void;
  isListening: boolean;
  setIsListening: (v: boolean) => void;
  color: string;
}

export default function MicButton({
  onTranscription,
  onError,
  isListening,
  setIsListening,
  color,
}: Props) {
  const pressStart = useRef(0);

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
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    console.log('[MicButton] error event:', JSON.stringify(event));
    onError("Didn't catch that, try again");
    setIsListening(false);
  });

  const handlePressIn = async () => {
    pressStart.current = Date.now();
    setIsListening(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!result.granted) {
      onError('Microphone permission denied. Use text input instead.');
      setIsListening(false);
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
      return;
    }
    ExpoSpeechRecognitionModule.stop();
  };

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.button, { backgroundColor: color }, isListening && styles.buttonActive]}
      >
        <Text style={styles.icon}>{isListening ? '...' : 'MIC'}</Text>
      </Pressable>
      <Text style={styles.hint}>Hold to speak</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },
  button: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonActive: {
    opacity: 0.7,
    transform: [{ scale: 1.1 }],
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
