import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Seam tests for the voice-result logger (src/utils/voiceLogger.ts).
//
// This is a live answer-pipeline path: GameScreen.processInput calls
// logVoiceResult on ALL FIVE answer routes (duplicate short-circuit, no-match,
// propose, generation-vote, and confirm — GameScreen.tsx:123/150/177/208/244),
// so every spoken or typed answer flows through here. The logs feed the offline
// alias-improvement loop (raw speech-recognition text -> matched Pokémon), so a
// regression that drops or double-sends logs silently degrades that data with no
// user-visible symptom.
//
// The behavioural contract worth locking in is the fire-and-forget flush queue:
//   - a call stamps `ts` and POSTs the batch as JSON;
//   - the module-level `flushing` guard means at most ONE fetch is in flight at a
//     time — logs enqueued during an in-flight flush are NOT sent concurrently;
//   - they are instead swept into a follow-up POST by the finally-block re-flush,
//     so nothing is lost;
//   - a rejected fetch is swallowed (flushing resets) and the next call recovers.
//
// The module holds mutable top-level state (`queue`, `flushing`), so each test
// re-imports a fresh copy via vi.resetModules(). `fetch` is resolved off globalThis
// at call time, so a global mock intercepts it without touching the source. The
// live ENDPOINT does not start with '__', so the placeholder short-circuit guard
// (`if (ENDPOINT.startsWith('__')) return`) is dormant and not exercised here.

type LogVoiceResult = typeof import('./voiceLogger').logVoiceResult;

let logVoiceResult: LogVoiceResult;
let fetchMock: ReturnType<typeof vi.fn>;

const okResponse = () => ({
  status: 200,
  redirected: false,
  type: 'default',
  text: async () => 'OK',
});

// Real-timer microtask flush: the queue drains via awaited promises (fetch +
// res.text()), never setTimeout, so a single macrotask turn lets the whole chain
// (including the finally re-flush) settle.
const tick = () => new Promise((r) => setTimeout(r, 0));

const bodyOf = (call: number) => JSON.parse(fetchMock.mock.calls[call][1].body);
const rawsOf = (call: number) => bodyOf(call).logs.map((l: { raw: string }) => l.raw);

const entry = (raw: string) =>
  ({
    raw,
    matched: raw.toUpperCase(),
    confidence: 'exact' as const,
    distance: 0,
    source: 'voice' as const,
    category: 'pokemon',
  });

beforeEach(async () => {
  vi.resetModules();
  fetchMock = vi.fn(async () => okResponse());
  global.fetch = fetchMock as unknown as typeof fetch;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  ({ logVoiceResult } = await import('./voiceLogger'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('voiceLogger flush queue', () => {
  it('stamps an ISO ts and POSTs a single log as JSON', async () => {
    logVoiceResult({
      raw: 'he can',
      matched: 'Ekans',
      confidence: 'exact',
      distance: 0,
      source: 'voice',
      category: 'pokemon',
      confirmed: 'Ekans',
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('script.google.com');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');

    const { logs } = bodyOf(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      raw: 'he can',
      matched: 'Ekans',
      confidence: 'exact',
      distance: 0,
      source: 'voice',
      category: 'pokemon',
      confirmed: 'Ekans',
    });
    // ts is added by the logger (not the caller) as an ISO-8601 instant.
    expect(logs[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('batches logs enqueued during an in-flight flush into a follow-up POST', async () => {
    // Three synchronous calls: the first opens a flush (fetch #1) and suspends at
    // its await; the next two only enqueue (the flushing guard short-circuits their
    // flush()). The finally-block re-flush then sweeps BOTH into a single fetch #2.
    logVoiceResult(entry('e1'));
    logVoiceResult(entry('e2'));
    logVoiceResult(entry('e3'));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    // Not 3 separate POSTs, and the second/third are coalesced — the core
    // "one fetch in flight, re-flush drains the rest, nothing lost" invariant.
    expect(rawsOf(0)).toEqual(['e1']);
    expect(rawsOf(1)).toEqual(['e2', 'e3']);
  });

  it('never runs two fetches concurrently (flushing guard)', async () => {
    // Hold fetch #1 open so the flush cannot complete, proving a second enqueued
    // log does NOT trigger a concurrent fetch while one is already in flight.
    let releaseFirst!: (v: unknown) => void;
    fetchMock.mockImplementationOnce(
      () => new Promise((resolve) => { releaseFirst = resolve; }),
    );

    logVoiceResult(entry('first'));
    logVoiceResult(entry('second'));

    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(1); // second is queued, not sent

    releaseFirst(okResponse()); // let flush #1 finish -> finally re-flush sends #2
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(rawsOf(1)).toEqual(['second']);
  });

  it('swallows a rejected fetch and recovers on the next call', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    // Must not throw despite the rejection (fire-and-forget).
    expect(() => logVoiceResult(entry('dropped'))).not.toThrow();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // The finally block reset `flushing`, so a later log is not wedged.
    logVoiceResult(entry('recovered'));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(rawsOf(1)).toEqual(['recovered']);
  });
});
