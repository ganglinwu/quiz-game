import type { AudioSource } from 'expo-audio';

export type TrackId = 'title' | 'game' | 'hint' | 'result';

export interface TrackDefinition {
  id: TrackId;
  source: AudioSource;
  volume?: number;
}

export type AudioCommand =
  | { type: 'play'; trackId: TrackId }
  | { type: 'stop' }
  | { type: 'pause'; reason: 'speech' }
  | { type: 'resume'; reason: 'speech' };

export type BGMState =
  | { status: 'idle' }
  | { status: 'loading'; trackId: TrackId }
  | { status: 'playing'; trackId: TrackId }
  | { status: 'paused'; trackId: TrackId; reason: 'speech' };
