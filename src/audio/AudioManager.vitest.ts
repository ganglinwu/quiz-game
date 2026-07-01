import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BGMState } from './types';

/**
 * Seam tests for the AudioManager command-queue state machine
 * (src/audio/AudioManager.ts). CLAUDE.md lists this as a key design decision:
 * a plain TS class (not React) that serializes every BGM operation through an
 * async queue and guarantees only one BGM track ever plays. The behavioural
 * contract worth locking in:
 *   - single-sound guarantee: one persistent AudioPlayer, tracks swap via
 *     replace() rather than spawning a new player per screen;
 *   - requestTrack de-dupes the currently-playing track (no re-play churn);
 *   - superseded play commands queued behind a newer play are SKIPPED, so a
 *     fast Home→Game→Hint screen sweep only ever lands the last track;
 *   - speech recognition pauses BGM and, on resume, reclaims the iOS audio
 *     session via setAudioModeAsync before playing again;
 *   - SFX bypasses the queue entirely on its own throwaway player;
 *   - mute state persists and propagates to the live player and to SFX.
 *
 * expo-audio is mocked (no native audio engine under Node) and ./tracks is
 * mocked so we never evaluate its `require('*.mp3')` asset imports, which the
 * Node/vitest runner cannot resolve. The mock player records play/pause/
 * replace/remove counts so the queue's decisions are observable.
 */

const h = vi.hoisted(() => {
  const createdPlayers: any[] = [];
  const setAudioModeCalls: any[] = [];
  const state = { throwOnCreate: false };

  const makeMockPlayer = (source: any) => {
    const listeners: Record<string, any[]> = {};
    const player: any = {
      source,
      loop: false,
      volume: 0,
      muted: false,
      _playCount: 0,
      _pauseCount: 0,
      _replaceCount: 0,
      _removed: false,
      play() {
        player._playCount++;
      },
      pause() {
        player._pauseCount++;
      },
      replace(s: any) {
        player.source = s;
        player._replaceCount++;
      },
      remove() {
        player._removed = true;
      },
      addListener(event: string, cb: any) {
        (listeners[event] ||= []).push(cb);
      },
      _emit(event: string, payload: any) {
        (listeners[event] || []).forEach((cb: any) => cb(payload));
      },
    };
    return player;
  };

  return { createdPlayers, setAudioModeCalls, state, makeMockPlayer };
});

vi.mock('expo-audio', () => ({
  createAudioPlayer: (source: any) => {
    if (h.state.throwOnCreate) throw new Error('createAudioPlayer failed');
    const p = h.makeMockPlayer(source);
    h.createdPlayers.push(p);
    return p;
  },
  setAudioModeAsync: async (opts: any) => {
    h.setAudioModeCalls.push(opts);
  },
}));

vi.mock('./tracks', () => ({
  TRACK_REGISTRY: new Map([
    ['title', { id: 'title', source: 'src:title' }],
    ['game', { id: 'game', source: 'src:game' }],
    // 'hint' carries an explicit volume so we can prove track.volume wins over
    // the 0.3 default; the rest fall back to the default.
    ['hint', { id: 'hint', source: 'src:hint', volume: 0.5 }],
    ['result', { id: 'result', source: 'src:result' }],
    ['pokedex', { id: 'pokedex', source: 'src:pokedex' }],
  ]),
  HINT_SUCCESS_SFX: 'src:sfx',
}));

import { AudioManager } from './AudioManager';

// One macrotask drains the whole async queue: processQueue runs its while-loop
// entirely through microtasks (each `await execute()` and the resume's awaited
// setAudioModeAsync), all of which settle before a setTimeout(0) fires.
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

let manager: AudioManager;

beforeEach(() => {
  h.createdPlayers.length = 0;
  h.setAudioModeCalls.length = 0;
  h.state.throwOnCreate = false;
  manager = new AudioManager();
});

describe('AudioManager — initialize + basic play', () => {
  it('initialize configures the iOS audio session (silent-mode, doNotMix)', async () => {
    await manager.initialize();
    expect(h.setAudioModeCalls).toEqual([
      { playsInSilentMode: true, interruptionMode: 'doNotMix' },
    ]);
  });

  it('requestTrack loads then plays on a single looping player at the default volume', async () => {
    manager.requestTrack('game');
    await flush();

    expect(h.createdPlayers).toHaveLength(1);
    const p = h.createdPlayers[0];
    expect(p.source).toBe('src:game');
    expect(p.loop).toBe(true);
    expect(p.volume).toBe(0.3); // 'game' has no explicit volume -> default
    expect(p.muted).toBe(false);
    expect(p._playCount).toBe(1);
    expect(manager.getState()).toEqual({ status: 'playing', trackId: 'game' });
  });
});

describe('AudioManager — single-sound guarantee', () => {
  it('switching tracks reuses the one player via replace(), not a new player', async () => {
    manager.requestTrack('game');
    await flush();
    manager.requestTrack('hint');
    await flush();

    // Still exactly one AudioPlayer across the whole session.
    expect(h.createdPlayers).toHaveLength(1);
    const p = h.createdPlayers[0];
    expect(p._replaceCount).toBe(1);
    expect(p.source).toBe('src:hint');
    expect(p.volume).toBe(0.5); // track.volume overrides the 0.3 default
    expect(manager.getState()).toEqual({ status: 'playing', trackId: 'hint' });
  });

  it('requestTrack for the already-playing track is a no-op (no re-play, no new player)', async () => {
    manager.requestTrack('game');
    await flush();
    manager.requestTrack('game'); // guard short-circuits before enqueue
    await flush();

    expect(h.createdPlayers).toHaveLength(1);
    expect(h.createdPlayers[0]._playCount).toBe(1);
    expect(manager.getState()).toEqual({ status: 'playing', trackId: 'game' });
  });

  it('skips superseded play commands — only the last queued track lands', async () => {
    // First request executes synchronously (play branch has no awaits) and
    // marks the queue busy; the next two pile up behind it before draining.
    manager.requestTrack('title'); // executes now -> playing title
    manager.requestTrack('result'); // queued behind a newer play -> skipped
    manager.requestTrack('hint'); // last play in queue -> the one that lands
    await flush();

    expect(h.createdPlayers).toHaveLength(1);
    const p = h.createdPlayers[0];
    expect(p._replaceCount).toBe(1); // only 'hint' applied via replace
    expect(p.source).toBe('src:hint'); // 'result' never touched the player
    expect(manager.getState()).toEqual({ status: 'playing', trackId: 'hint' });
  });
});

describe('AudioManager — stop', () => {
  it('requestStop pauses the player and returns to idle, keeping the player for reuse', async () => {
    manager.requestTrack('game');
    await flush();
    manager.requestStop();
    await flush();

    const p = h.createdPlayers[0];
    expect(p._pauseCount).toBe(1);
    expect(manager.getState()).toEqual({ status: 'idle' });

    // Playing again after a stop reuses the same player (replace, not new).
    manager.requestTrack('result');
    await flush();
    expect(h.createdPlayers).toHaveLength(1);
    expect(p._replaceCount).toBe(1);
    expect(manager.getState()).toEqual({ status: 'playing', trackId: 'result' });
  });
});

describe('AudioManager — speech pause/resume', () => {
  it('pauses on speech start and, on speech end, reclaims the audio session before resuming', async () => {
    manager.requestTrack('game');
    await flush();

    manager.notifySpeechStart();
    await flush();
    const p = h.createdPlayers[0];
    expect(p._pauseCount).toBe(1);
    expect(manager.getState()).toEqual({
      status: 'paused',
      trackId: 'game',
      reason: 'speech',
    });

    manager.notifySpeechEnd();
    await flush();
    // Session reclaimed exactly once (initialize was never called here).
    expect(h.setAudioModeCalls).toEqual([
      { playsInSilentMode: true, interruptionMode: 'doNotMix' },
    ]);
    expect(p._playCount).toBe(2); // initial play + resume play
    expect(manager.getState()).toEqual({ status: 'playing', trackId: 'game' });
  });

  it('resume is a no-op when not paused (spurious speech-end never re-plays)', async () => {
    manager.requestTrack('game');
    await flush();

    manager.notifySpeechEnd(); // status is 'playing', resume guard rejects
    await flush();

    expect(h.setAudioModeCalls).toHaveLength(0);
    expect(h.createdPlayers[0]._playCount).toBe(1);
    expect(manager.getState()).toEqual({ status: 'playing', trackId: 'game' });
  });

  it('pause is a no-op when nothing is playing', async () => {
    manager.notifySpeechStart(); // no player yet
    await flush();
    expect(h.createdPlayers).toHaveLength(0);
    expect(manager.getState()).toEqual({ status: 'idle' });
  });
});

describe('AudioManager — mute', () => {
  it('mute set before playback propagates to the player when it starts', async () => {
    manager.setMuted(true);
    expect(manager.getMuted()).toBe(true);

    manager.requestTrack('game');
    await flush();
    expect(h.createdPlayers[0].muted).toBe(true);
  });

  it('toggling mute during playback flips the live player immediately', async () => {
    manager.requestTrack('game');
    await flush();
    const p = h.createdPlayers[0];
    expect(p.muted).toBe(false);

    manager.setMuted(true);
    expect(p.muted).toBe(true);
    manager.setMuted(false);
    expect(p.muted).toBe(false);
  });
});

describe('AudioManager — SFX (bypasses the queue)', () => {
  it('plays a throwaway SFX player without disturbing BGM state', () => {
    manager.setMuted(true);
    const onFinish = vi.fn();
    manager.playSfx('src:sfx', onFinish);

    expect(h.createdPlayers).toHaveLength(1);
    const sfx = h.createdPlayers[0];
    expect(sfx.volume).toBe(0.5);
    expect(sfx.muted).toBe(true); // inherits current mute
    expect(sfx._playCount).toBe(1);
    // SFX never touches the BGM state machine.
    expect(manager.getState()).toEqual({ status: 'idle' });

    // A non-final status update does nothing.
    sfx._emit('playbackStatusUpdate', { didJustFinish: false });
    expect(sfx._removed).toBe(false);
    expect(onFinish).not.toHaveBeenCalled();

    // didJustFinish removes the player and fires the callback exactly once.
    sfx._emit('playbackStatusUpdate', { didJustFinish: true });
    expect(sfx._removed).toBe(true);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('still fires onFinish when the SFX player fails to create', () => {
    h.state.throwOnCreate = true;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onFinish = vi.fn();

    manager.playSfx('src:sfx', onFinish);

    expect(h.createdPlayers).toHaveLength(0);
    expect(onFinish).toHaveBeenCalledTimes(1);
    errSpy.mockRestore();
  });
});

describe('AudioManager — lifecycle & observers', () => {
  it('dispose removes the player and returns to idle', async () => {
    manager.requestTrack('game');
    await flush();
    const p = h.createdPlayers[0];

    manager.dispose();
    expect(p._removed).toBe(true);
    expect(manager.getState()).toEqual({ status: 'idle' });
  });

  it('subscribe streams state transitions and unsubscribe stops delivery', async () => {
    const seen: BGMState[] = [];
    const unsubscribe = manager.subscribe((s) => seen.push(s));

    manager.requestTrack('game');
    await flush();
    expect(seen.map((s) => s.status)).toEqual(['loading', 'playing']);

    unsubscribe();
    manager.requestTrack('result');
    await flush();
    // No further deliveries after unsubscribe.
    expect(seen.map((s) => s.status)).toEqual(['loading', 'playing']);
    // ...but the manager itself did switch tracks.
    expect(manager.getState()).toEqual({ status: 'playing', trackId: 'result' });
  });
});
