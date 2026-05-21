import { Audio } from 'expo-av';
import type { AVPlaybackSource } from 'expo-av';
import type { TrackId, AudioCommand, BGMState } from './types';
import { TRACK_REGISTRY } from './tracks';

type Listener = (state: BGMState) => void;

export class AudioManager {
  private currentSound: Audio.Sound | null = null;
  private currentTrackId: TrackId | null = null;
  private bgmState: BGMState = { status: 'idle' };
  private isMuted = false;
  private queue: AudioCommand[] = [];
  private processing = false;
  private listeners = new Set<Listener>();

  async initialize(): Promise<void> {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    });
  }

  dispose(): void {
    this.queue = [];
    if (this.currentSound) {
      this.currentSound.unloadAsync();
      this.currentSound = null;
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

  playSfx(source: AVPlaybackSource): void {
    (async () => {
      try {
        const { sound } = await Audio.Sound.createAsync(source, {
          isMuted: this.isMuted,
          volume: 0.5,
        });
        await sound.playAsync();
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            sound.unloadAsync();
          }
        });
      } catch {}
    })();
  }

  // --- Mute ---

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    this.currentSound?.setIsMutedAsync(muted).catch(() => {});
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
        if (lastPlayIdx >= 0) {
          continue;
        }
      }

      await this.execute(cmd);
    }

    this.processing = false;
  }

  private async execute(cmd: AudioCommand): Promise<void> {
    switch (cmd.type) {
      case 'play': {
        if (this.currentTrackId === cmd.trackId && this.bgmState.status === 'playing') {
          return;
        }

        await this.unloadCurrent();

        this.setBGMState({ status: 'loading', trackId: cmd.trackId });

        const track = TRACK_REGISTRY.get(cmd.trackId);
        if (!track) return;

        const { sound } = await Audio.Sound.createAsync(track.source, {
          isLooping: true,
          isMuted: this.isMuted,
          volume: track.volume ?? 0.3,
        });

        if (this.queue.some((c) => c.type === 'play' || c.type === 'stop')) {
          await sound.unloadAsync();
          return;
        }

        this.currentSound = sound;
        this.currentTrackId = cmd.trackId;
        await sound.playAsync();
        this.setBGMState({ status: 'playing', trackId: cmd.trackId });
        break;
      }

      case 'stop': {
        await this.unloadCurrent();
        this.setBGMState({ status: 'idle' });
        break;
      }

      case 'pause': {
        if (this.currentSound && this.bgmState.status === 'playing') {
          await this.currentSound.pauseAsync().catch(() => {});
          this.setBGMState({
            status: 'paused',
            trackId: this.currentTrackId!,
            reason: cmd.reason,
          });
        }
        break;
      }

      case 'resume': {
        if (this.currentSound && this.bgmState.status === 'paused') {
          if (cmd.reason === 'speech') {
            await Audio.setAudioModeAsync({
              playsInSilentModeIOS: true,
              staysActiveInBackground: false,
            });
            await new Promise((r) => setTimeout(r, 100));
          }

          try {
            const status = await this.currentSound.getStatusAsync();
            if (status.isLoaded && !status.isPlaying) {
              await this.currentSound.playAsync();
            }
          } catch {}
          this.setBGMState({ status: 'playing', trackId: this.currentTrackId! });
        }
        break;
      }
    }
  }

  private async unloadCurrent(): Promise<void> {
    if (this.currentSound) {
      const old = this.currentSound;
      this.currentSound = null;
      this.currentTrackId = null;
      await old.stopAsync().catch(() => {});
      await old.unloadAsync().catch(() => {});
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
