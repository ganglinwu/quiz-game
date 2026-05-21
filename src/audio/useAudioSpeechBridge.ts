import { useEffect, useRef } from 'react';
import { useAudio } from './AudioProvider';

export function useAudioSpeechBridge(isListening: boolean): void {
  const { manager } = useAudio();
  const prevRef = useRef(false);

  useEffect(() => {
    if (isListening && !prevRef.current) {
      manager.notifySpeechStart();
    } else if (!isListening && prevRef.current) {
      manager.notifySpeechEnd();
    }
    prevRef.current = isListening;
  }, [isListening, manager]);
}
