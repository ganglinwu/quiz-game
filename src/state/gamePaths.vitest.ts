import { describe, it, expect } from 'vitest';
import { gameReducer, createInitialState } from './gameReducer';
import { Category, GameState, QuizConfig } from '../types';

// Companion to gameReducer.vitest.ts. That file is a tight regression guard for
// three specific historical fixes; this file walks the *other* distinct paths a
// game can take through the reducer that previously had no coverage at all:
//   - the hint lifecycle (show -> reveal consumes a hint & records it; answering
//     while still a silhouette consumes nothing; the 5-slot record cap)
//   - auto-detect generation expansion (proposer pre-vote, approval records the
//     trigger Pokemon as a real turn and advances play)
//   - vote approval math (even-voter tie rejected, majority approved) and the
//     guards around a pending vote
//   - quiz mode disabling generation voting, and the quiz pool-exhausted ending
//   - board exhaustion ending the game as a draw
//   - RESET / START_GAME returning a clean slate
//
// Pokemon item counts come from the genuine bundled assets/quiz.db (via the
// better-sqlite3 shim aliased in vitest.config.ts), so totalItems is real.

const fruits: Category = { type: 'fruits' };
const gen1: Category = { type: 'pokemon', generations: [1] };

// Drive a turn the way the UI does: propose then confirm.
function confirm(state: GameState, item: string): GameState {
  const proposed = gameReducer(state, { type: 'PROPOSE_ITEM', item });
  return gameReducer(proposed, { type: 'CONFIRM_ITEM' });
}

describe('hint lifecycle', () => {
  it('reveal consumes a hint for the current player and records the silhouette', () => {
    let s = createInitialState({ category: gen1, players: ['A', 'B'], hintLimit: 3 });

    s = gameReducer(s, { type: 'SHOW_HINT', pokemonName: 'Bulbasaur', pokemonId: 1 });
    expect(s.hintPhase).toBe('silhouette');
    expect(s.hintsUsed).toEqual({ A: 0, B: 0 });
    expect(s.revealedHints).toEqual([]);

    s = gameReducer(s, { type: 'REVEAL_HINT' });
    expect(s.hintPhase).toBe('revealed');
    // Only the current player's counter moves.
    expect(s.hintsUsed).toEqual({ A: 1, B: 0 });
    expect(s.revealedHints).toEqual([
      { pokemonName: 'Bulbasaur', pokemonId: 1, source: 'hint' },
    ]);
  });

  it('answering correctly while still a silhouette consumes no hint', () => {
    let s = createInitialState({ category: gen1, players: ['A', 'B'], hintLimit: 3 });
    s = gameReducer(s, { type: 'SHOW_HINT', pokemonName: 'Bulbasaur', pokemonId: 1 });

    // Player names it before tapping to reveal -> the "no hints consumed" path.
    s = confirm(s, 'Bulbasaur');
    expect(s.hintsUsed).toEqual({ A: 0, B: 0 });
    expect(s.revealedHints).toEqual([]);
    expect(s.hintPhase).toBe('none');
    expect(s.hintPokemonName).toBeNull();
    expect(s.currentPlayer).toBe('B');
  });

  it('dismissing a silhouette consumes no hint and clears the overlay', () => {
    let s = createInitialState({ category: gen1, players: ['A', 'B'], hintLimit: 3 });
    s = gameReducer(s, { type: 'SHOW_HINT', pokemonName: 'Bulbasaur', pokemonId: 1 });
    s = gameReducer(s, { type: 'DISMISS_HINT' });
    expect(s.hintPhase).toBe('none');
    expect(s.hintPokemonName).toBeNull();
    expect(s.hintsUsed).toEqual({ A: 0, B: 0 });
    expect(s.revealedHints).toEqual([]);
  });

  it('caps recorded hints at 5 but keeps counting usage past the cap', () => {
    let s = createInitialState({ category: gen1, players: ['A'], hintLimit: 'unlimited' });
    for (let i = 1; i <= 7; i++) {
      s = gameReducer(s, { type: 'SHOW_HINT', pokemonName: `mon-${i}`, pokemonId: i });
      s = gameReducer(s, { type: 'REVEAL_HINT' });
    }
    // The post-game learning section only holds 5 silhouettes...
    expect(s.revealedHints).toHaveLength(5);
    expect(s.revealedHints.map((h) => h.pokemonId)).toEqual([1, 2, 3, 4, 5]);
    // ...but per-player usage keeps accruing so limits still bite.
    expect(s.hintsUsed).toEqual({ A: 7 });
  });
});

describe('auto-detect generation expansion', () => {
  it("records the trigger Pokemon as the proposer's turn and advances play on approval", () => {
    // Gen 1 only. Player A names a Gen 2 Pokemon, which triggers a vote instead
    // of a rejection.
    let s = createInitialState({ category: gen1, players: ['A', 'B', 'C'] });
    expect(s.totalItems).toBe(151);

    s = gameReducer(s, {
      type: 'PROPOSE_GEN_CHANGE',
      generation: 2,
      triggerPokemon: 'Chikorita',
      source: 'auto-detect',
      action: 'add',
    });
    // Auto-detect pre-seeds the proposer's approval; the others still owe a vote.
    expect(s.pendingGenVote?.votes).toEqual({ A: true });
    expect(s.pendingGenVote?.requiredVoters).toEqual(['A', 'B', 'C']);

    s = gameReducer(s, { type: 'CAST_GEN_VOTE', player: 'B', approve: true });
    expect(s.pendingGenVote).not.toBeNull(); // not everyone has voted yet

    s = gameReducer(s, { type: 'CAST_GEN_VOTE', player: 'C', approve: true });
    // Approved: pool grows, the triggering answer counts as A's turn, play moves on.
    expect(s.pendingGenVote).toBeNull();
    expect(s.activeGenerations).toEqual([1, 2]);
    expect(s.totalItems).toBe(251);
    expect(s.usedItems).toEqual(['Chikorita']);
    expect(s.turnRecords.at(-1)).toMatchObject({ player: 'A', item: 'Chikorita' });
    expect(s.currentPlayer).toBe('B');
  });

  it('a rejected auto-detect vote drops the trigger Pokemon entirely', () => {
    let s = createInitialState({ category: gen1, players: ['A', 'B', 'C'] });
    s = gameReducer(s, {
      type: 'PROPOSE_GEN_CHANGE',
      generation: 2,
      triggerPokemon: 'Chikorita',
      source: 'auto-detect',
      action: 'add',
    });
    // Proposer already yes; both others reject -> 1 of 3, not a majority.
    s = gameReducer(s, { type: 'CAST_GEN_VOTE', player: 'B', approve: false });
    s = gameReducer(s, { type: 'CAST_GEN_VOTE', player: 'C', approve: false });
    expect(s.pendingGenVote).toBeNull();
    expect(s.activeGenerations).toEqual([1]);
    expect(s.usedItems).toEqual([]);
    expect(s.turnRecords).toEqual([]);
    expect(s.currentPlayer).toBe('A'); // no turn was ever taken
  });
});

describe('vote approval semantics & guards', () => {
  it('rejects an even-voter tie (a settings add needs a strict majority)', () => {
    let s = createInitialState({ category: gen1, players: ['A', 'B'] });
    s = gameReducer(s, {
      type: 'PROPOSE_GEN_CHANGE',
      generation: 2,
      triggerPokemon: null,
      source: 'settings',
      action: 'add',
    });
    // Settings votes are not pre-seeded, so 1-1 is a genuine tie -> rejected.
    s = gameReducer(s, { type: 'CAST_GEN_VOTE', player: 'A', approve: true });
    s = gameReducer(s, { type: 'CAST_GEN_VOTE', player: 'B', approve: false });
    expect(s.pendingGenVote).toBeNull();
    expect(s.activeGenerations).toEqual([1]);
    expect(s.totalItems).toBe(151);
  });

  it('ignores a second gen proposal while one is already pending', () => {
    let s = createInitialState({ category: gen1, players: ['A', 'B'] });
    s = gameReducer(s, {
      type: 'PROPOSE_GEN_CHANGE',
      generation: 2,
      triggerPokemon: null,
      source: 'settings',
      action: 'add',
    });
    const afterFirst = s;
    s = gameReducer(s, {
      type: 'PROPOSE_GEN_CHANGE',
      generation: 3,
      triggerPokemon: null,
      source: 'settings',
      action: 'add',
    });
    expect(s).toBe(afterFirst); // no-op, same reference
    expect(s.pendingGenVote?.generation).toBe(2);
  });

  it('ignores a cast vote when nothing is pending', () => {
    const s = createInitialState({ category: gen1, players: ['A', 'B'] });
    const next = gameReducer(s, { type: 'CAST_GEN_VOTE', player: 'A', approve: true });
    expect(next).toBe(s);
  });
});

describe('quiz mode', () => {
  const quizConfig: QuizConfig = {
    difficulty: 'easy',
    filter: { includeLegendary: true, includeMythical: true },
    hardcore: false,
  };

  it('disables generation voting (gens are fixed by question constraints)', () => {
    const s = createInitialState({ category: gen1, players: ['A', 'B'], quizConfig });
    const next = gameReducer(s, {
      type: 'PROPOSE_GEN_CHANGE',
      generation: 2,
      triggerPokemon: 'Chikorita',
      source: 'auto-detect',
      action: 'add',
    });
    expect(next).toBe(s); // no-op, no vote opened
    expect(next.pendingGenVote).toBeNull();
  });

  it('ends the game as a draw when the question pool is exhausted', () => {
    let s = createInitialState({ category: gen1, players: ['A', 'B'], quizConfig });
    s = gameReducer(s, { type: 'QUESTION_POOL_EXHAUSTED' });
    expect(s.isGameOver).toBe(true);
    expect(s.isDraw).toBe(true);
    expect(s.winner).toBeNull();
    expect(s.currentQuestion).toBeNull();
  });
});

describe('board exhaustion', () => {
  it('ends the game as a draw once every item has been named', () => {
    let s = createInitialState({ category: gen1, players: ['A', 'B'] });
    expect(s.totalItems).toBe(151);

    // Name all 151 Gen 1 Pokemon (the reducer only cares about the count).
    for (let i = 0; i < 151; i++) {
      expect(s.isGameOver).toBe(false);
      s = confirm(s, `mon-${i}`);
    }

    expect(s.usedItems).toHaveLength(151);
    expect(s.isGameOver).toBe(true);
    expect(s.isDraw).toBe(true);
    expect(s.winner).toBeNull();
  });

  it('does not exhaust the fruits board, which has no fixed total', () => {
    let s = createInitialState({ category: fruits, players: ['A', 'B'] });
    expect(s.totalItems).toBe(0);
    s = confirm(s, 'apple');
    s = confirm(s, 'banana');
    expect(s.isGameOver).toBe(false);
  });
});

describe('RESET / START_GAME', () => {
  it('RESET returns a clean slate but keeps the same category and players', () => {
    let s = createInitialState({ category: gen1, players: ['A', 'B', 'C'] });
    s = confirm(s, 'Pikachu');
    s = gameReducer(s, { type: 'GIVE_UP' }); // eliminate someone
    expect(s.eliminatedPlayers.length).toBeGreaterThan(0);

    s = gameReducer(s, { type: 'RESET' });
    expect(s.usedItems).toEqual([]);
    expect(s.turnRecords).toEqual([]);
    expect(s.eliminatedPlayers).toEqual([]);
    expect(s.activePlayers).toEqual(['A', 'B', 'C']);
    expect(s.currentPlayer).toBe('A');
    expect(s.isGameOver).toBe(false);
    expect(s.category).toEqual(gen1);
    expect(s.players).toEqual(['A', 'B', 'C']);
  });

  it('START_GAME swaps in a fresh game for the given category and players', () => {
    const s = createInitialState({ category: gen1, players: ['A', 'B'] });
    const next = gameReducer(s, {
      type: 'START_GAME',
      category: fruits,
      players: ['X', 'Y', 'Z'],
    });
    expect(next.category).toEqual(fruits);
    expect(next.players).toEqual(['X', 'Y', 'Z']);
    expect(next.currentPlayer).toBe('X');
    expect(next.usedItems).toEqual([]);
    expect(next.totalItems).toBe(0); // fruits
  });
});
