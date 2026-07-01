import { describe, it, expect } from 'vitest';
import { gameReducer, createInitialState } from './gameReducer';
import { Category, GameState } from '../types';

// Covers the interactive input-lifecycle actions that drive the "Did you mean X?"
// confirmation overlay and the voice-input status line — the four reducer branches
// (REJECT_ITEM, SET_LISTENING, SET_ERROR, SET_TRANSCRIBED_TEXT) that had no direct
// coverage, plus the CONFIRM_ITEM no-op guard and the overlay round-trip they form.
//
// These are pure state transitions (no Date.now / no DB), so fruits keeps them
// deterministic; the point is to lock in the *side effects* that aren't obvious
// from the action name — e.g. SET_LISTENING silently clearing a stale error, and
// REJECT_ITEM closing the overlay without scoring or advancing the turn.

const fruits: Category = { type: 'fruits' };

function fresh(players = ['A', 'B']): GameState {
  return createInitialState({ category: fruits, players });
}

describe('confirmation overlay: PROPOSE_ITEM', () => {
  it('opens the overlay (sets confirmationItem) and clears any stale error', () => {
    let s = fresh();
    s = gameReducer(s, { type: 'SET_ERROR', message: 'no match' });
    expect(s.errorMessage).toBe('no match');

    s = gameReducer(s, { type: 'PROPOSE_ITEM', item: 'apple' });
    expect(s.confirmationItem).toBe('apple');
    expect(s.errorMessage).toBeNull();
    // Proposing alone scores nothing and does not pass the turn.
    expect(s.usedItems).toEqual([]);
    expect(s.turnRecords).toEqual([]);
    expect(s.currentPlayer).toBe('A');
  });
});

describe('confirmation overlay: REJECT_ITEM (the "No" path)', () => {
  it('closes the overlay and clears the transcribed text without scoring or advancing', () => {
    let s = fresh();
    s = gameReducer(s, { type: 'SET_TRANSCRIBED_TEXT', text: 'aple' });
    s = gameReducer(s, { type: 'PROPOSE_ITEM', item: 'apple' });
    expect(s.confirmationItem).toBe('apple');

    s = gameReducer(s, { type: 'REJECT_ITEM' });
    expect(s.confirmationItem).toBeNull();
    expect(s.transcribedText).toBe('');
    // Rejecting a "Did you mean X?" must not consume the item or pass the turn.
    expect(s.usedItems).toEqual([]);
    expect(s.turnRecords).toEqual([]);
    expect(s.currentPlayer).toBe('A');
  });

  it('leaves the game state otherwise untouched (players / elimination unchanged)', () => {
    let s = fresh(['A', 'B', 'C']);
    s = gameReducer(s, { type: 'PROPOSE_ITEM', item: 'banana' });
    s = gameReducer(s, { type: 'REJECT_ITEM' });
    expect(s.activePlayers).toEqual(['A', 'B', 'C']);
    expect(s.eliminatedPlayers).toEqual([]);
    expect(s.isGameOver).toBe(false);
  });
});

describe('CONFIRM_ITEM no-op guard', () => {
  it('is a no-op when there is no pending confirmation (e.g. straight after a reject)', () => {
    let s = fresh();
    s = gameReducer(s, { type: 'PROPOSE_ITEM', item: 'apple' });
    s = gameReducer(s, { type: 'REJECT_ITEM' });
    expect(s.confirmationItem).toBeNull();

    const before = s;
    const after = gameReducer(before, { type: 'CONFIRM_ITEM' });
    // The guard (confirmationItem === null) returns the same state reference.
    expect(after).toBe(before);
    expect(after.usedItems).toEqual([]);
    expect(after.turnRecords).toEqual([]);
  });
});

describe('overlay round-trip: propose -> reject -> re-propose -> confirm', () => {
  it('lets a rejected guess be replaced by a fresh guess that confirms normally', () => {
    let s = fresh();
    // First guess is rejected.
    s = gameReducer(s, { type: 'PROPOSE_ITEM', item: 'aple' });
    s = gameReducer(s, { type: 'REJECT_ITEM' });
    expect(s.usedItems).toEqual([]);
    expect(s.currentPlayer).toBe('A');

    // Second guess is confirmed — the turn scores and passes to B.
    s = gameReducer(s, { type: 'PROPOSE_ITEM', item: 'apple' });
    s = gameReducer(s, { type: 'CONFIRM_ITEM' });
    expect(s.usedItems).toEqual(['apple']);
    expect(s.turnRecords.at(-1)).toMatchObject({ player: 'A', item: 'apple' });
    expect(s.currentPlayer).toBe('B');
    expect(s.confirmationItem).toBeNull();
  });
});

describe('voice-input status: SET_LISTENING / SET_ERROR / SET_TRANSCRIBED_TEXT', () => {
  it('SET_LISTENING flips the flag and clears a stale voice error on start', () => {
    let s = fresh();
    s = gameReducer(s, { type: 'SET_ERROR', message: 'mic timeout' });
    expect(s.errorMessage).toBe('mic timeout');

    // Pressing the mic again (start listening) wipes the prior error.
    s = gameReducer(s, { type: 'SET_LISTENING', isListening: true });
    expect(s.isListening).toBe(true);
    expect(s.errorMessage).toBeNull();

    // Releasing the mic clears the flag (and leaves no error).
    s = gameReducer(s, { type: 'SET_LISTENING', isListening: false });
    expect(s.isListening).toBe(false);
    expect(s.errorMessage).toBeNull();
  });

  it('SET_ERROR sets and null-clears the error message', () => {
    let s = fresh();
    s = gameReducer(s, { type: 'SET_ERROR', message: "That's not a fruit" });
    expect(s.errorMessage).toBe("That's not a fruit");
    s = gameReducer(s, { type: 'SET_ERROR', message: null });
    expect(s.errorMessage).toBeNull();
  });

  it('SET_TRANSCRIBED_TEXT updates only the transcript, not turn/error state', () => {
    let s = fresh();
    s = gameReducer(s, { type: 'SET_TRANSCRIBED_TEXT', text: 'pika' });
    expect(s.transcribedText).toBe('pika');
    expect(s.currentPlayer).toBe('A');
    expect(s.errorMessage).toBeNull();
    // A later transcript overwrites the earlier one.
    s = gameReducer(s, { type: 'SET_TRANSCRIBED_TEXT', text: 'pikachu' });
    expect(s.transcribedText).toBe('pikachu');
  });
});
