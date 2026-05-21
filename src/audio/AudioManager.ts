import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioSource } from 'expo-audio';
import type { TrackId, AudioCommand, BGMState } from './types';
import { TRACK_REGISTRY } from './tracks';

type Listener = (state: BGMState) => void;

export class AudioManager {
  private player: AudioPlayer | null = null;
  private currentTrackId: TrackId | null = null;
  private bgmState: BGMState = { status: 'idle' };
  private isMuted = false;
  private queue: AudioCommand[] = [];
  private processing = false;
  private listeners = new Set<Listener>();

  async initialize(): Promise<void> {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
    });
  }

  dispose(): void {
    this.queue = [];
    if (this.player) {
      this.player.remove();
      this.player = null;
      this.currentTrackId = null;
    }
    this.setBGMState({ status: 'idle' });
  }

  // --- Public BGM API (fire-and-forget, enqueues commands) ---

  requestTrack(trackId: TrackId): void {
    if (
      this.bgmState.status === 'playing' &&
      this.currentTrackId === trackId &&
      this.queue.length === 0
    ) {
      return;
    }
    this.enqueue({ type: 'play', trackId });
  }

  requestStop(): void {
    this.enqueue({ type: 'stop' });
  }

  notifySpeechStart(): void {
    this.enqueue({ type: 'pause', reason: 'speech' });
  }

  notifySpeechEnd(): void {
    this.enqueue({ type: 'resume', reason: 'speech' });
  }

  // --- SFX (independent, bypasses queue) ---

  playSfx(source: AudioSource): void {
    try {
      const sfxPlayer = createAudioPlayer(source);
      sfxPlayer.volume = 0.5;
      sfxPlayer.muted = this.isMuted;
      sfxPlayer.play();
      sfxPlayer.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          sfxPlayer.remove();
        }
      });
    } catch (e) {
      console.error('[AudioManager] SFX error:', e);
    }
  }

  // --- Mute ---

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.player) {
      this.player.muted = muted;
    }
  }

  getMuted(): boolean {
    return this.isMuted;
  }

  // --- State observation ---

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): BGMState {
    return this.bgmState;
  }

  // --- Internal queue processing ---

  private enqueue(cmd: AudioCommand): void {
    this.queue.push(cmd);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const cmd = this.queue.shift()!;

      if (cmd.type === 'play') {
        const lastPlayIdx = this.findLastIndex(this.queue, (c) => c.type === 'play');
        if (lastPlayIdx >= 0) continue;
      }

      await this.execute(cmd);
    }

    this.processing = false;
  }

  private async execute(cmd: AudioCommand): Promise<void> {
    switch (cmd.type) {
      case 'play': {
        if (this.currentTrackId === cmd.trackId && this.bgmState.status === 'playing') return;

        const track = TRACK_REGISTRY.get(cmd.trackId);
        if (!track) return;

        this.setBGMState({ status: 'loading', trackId: cmd.trackId });

        if (this.player) {
          this.player.replace(track.source);
        } else {
          this.player = createAudioPlayer(track.source);
        }

        this.player.loop = true;
        this.player.volume = track.volume ?? 0.3;
        this.player.muted = this.isMuted;
        this.currentTrackId = cmd.trackId;
        this.player.play();

        this.setBGMState({ status: 'playing', trackId: cmd.trackId });
        break;
      }

      case 'stop': {
        if (this.player) {
          this.player.pause();
        }
        this.currentTrackId = null;
        this.setBGMState({ status: 'idle' });
        break;
      }

      case 'pause': {
        if (this.player && this.bgmState.status === 'playing') {
          this.player.pause();
          this.setBGMState({
            status: 'paused',
            trackId: this.currentTrackId!,
            reason: cmd.reason,
          });
        }
        break;
      }

      case 'resume': {
        if (this.bgmState.status === 'paused' && this.currentTrackId && this.player) {
          if (cmd.reason === 'speech') {
            // Reclaim the iOS audio session after speech recognition released it
            await setAudioModeAsync({
              playsInSilentMode: true,
              interruptionMode: 'doNotMix',
            });
          }
          this.player.play();
          this.setBGMState({ status: 'playing', trackId: this.currentTrackId });
        }
        break;
      }
    }
  }

  private setBGMState(state: BGMState): void {
    this.bgmState = state;
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  private findLastIndex<T>(arr: T[], pred: (item: T) => boolean): number {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (pred(arr[i])) return i;
    }
    return -1;
  }
}
