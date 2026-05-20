import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { Audio } from 'expo-av';
import type { AVPlaybackSource } from 'expo-av';

interface MusicContextType {
  isMuted: boolean;
  toggleMute: () => void;
  play: (source: AVPlaybackSource) => Promise<void>;
  stop: () => Promise<void>;
  playSfx: (source: AVPlaybackSource) => Promise<void>;
}

const MusicContext = createContext<MusicContextType>({
  isMuted: false,
  toggleMute: () => {},
  play: async () => {},
  stop: async () => {},
  playSfx: async () => {},
});

export const useMusic = () => useContext(MusicContext);

export function MusicProvider({ children }: { children: React.ReactNode }) {
  const [isMuted, setIsMuted] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const isMutedRef = useRef(false);
  const currentTrackRef = useRef<AVPlaybackSource | null>(null);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    });
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, []);

  const play = useCallback(async (source: AVPlaybackSource) => {
    if (currentTrackRef.current === source) return;
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
    }
    const { sound } = await Audio.Sound.createAsync(source, {
      isLooping: true,
      isMuted: isMutedRef.current,
      volume: 0.3,
    });
    soundRef.current = sound;
    currentTrackRef.current = source;
    await sound.playAsync();
  }, []);

  const stop = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
      currentTrackRef.current = null;
    }
  }, []);

  const playSfx = useCallback(async (source: AVPlaybackSource) => {
    const { sound } = await Audio.Sound.createAsync(source, {
      isMuted: isMutedRef.current,
      volume: 0.5,
    });
    await sound.playAsync();
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync();
      }
    });
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      soundRef.current?.setIsMutedAsync(next);
      return next;
    });
  }, []);

  return (
    <MusicContext.Provider value={{ isMuted, toggleMute, play, stop, playSfx }}>
      {children}
    </MusicContext.Provider>
  );
}
