import { useCallback, useEffect } from 'react';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useAudio } from './AudioProvider';
import type { TrackId } from './types';

export function useBGM(trackId: TrackId): void {
  const { manager } = useAudio();

  useFocusEffect(
    useCallback(() => {
      manager.requestTrack(trackId);
    }, [manager, trackId])
  );
}

export function useBGMDynamic(trackId: TrackId): void {
  const { manager } = useAudio();
  const isFocused = useIsFocused();

  useEffect(() => {
    if (isFocused) {
      manager.requestTrack(trackId);
    }
  }, [trackId, isFocused, manager]);
}
