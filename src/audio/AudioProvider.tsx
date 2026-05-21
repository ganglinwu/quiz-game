import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AudioManager } from './AudioManager';
import type { BGMState } from './types';

interface AudioContextValue {
  isMuted: boolean;
  toggleMute: () => void;
  bgmState: BGMState;
  manager: AudioManager;
}

const AudioContext = createContext<AudioContextValue | null>(null);

export function useAudio(): AudioContextValue {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error('useAudio must be used within AudioProvider');
  return ctx;
}

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const managerRef = useRef<AudioManager | null>(null);
  if (!managerRef.current) {
    managerRef.current = new AudioManager();
  }
  const manager = managerRef.current;

  const [isMuted, setIsMuted] = useState(false);
  const [bgmState, setBGMState] = useState<BGMState>({ status: 'idle' });

  useEffect(() => {
    manager.initialize();
    const unsub = manager.subscribe(setBGMState);
    return () => {
      unsub();
      manager.dispose();
    };
  }, [manager]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      manager.setMuted(next);
      return next;
    });
  }, [manager]);

  return (
    <AudioContext.Provider value={{ isMuted, toggleMute, bgmState, manager }}>
      {children}
    </AudioContext.Provider>
  );
}
