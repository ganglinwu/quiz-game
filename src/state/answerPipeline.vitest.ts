import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createInitialState, gameReducer } from './gameReducer';
import {
  findDuplicate,
  fuzzyMatch,
  fuzzyMatchWithGenDetection,
} from '../utils/fuzzyMatch';
import {
  getPokemonForGens,
  getAllPokemon,
  getAllFruits,
  getGenForPokemon,
} from '../data/pokemon-db';
import { GameState, QuizQuestion } from '../types';

// Integration / seam suite for the ANSWER-ACCEPTANCE PIPELINE.
//
// GameScreen.processInput (GameScreen.tsx:113-195) is the code that turns a raw
// typed/spoken answer into a reducer dispatch: it runs findDuplicate, then fuzzy
// matching against the REAL bundled DB, and picks one of four routes — reject as a
// duplicate, reject as no-match, open a generation-expansion vote, or propose the
// item. That decision logic lives inside a React component wired to audio, speech
// recognition and navigation, so it has no direct unit coverage; the existing
// suites exercise fuzzyMatch OR the reducer in isolation but never the raw-text ->
// match -> reducer -> game-state seam that a player actually drives.
//
// `decideInput` below mirrors processInput's exact branch ORDER (the only part that
// is re-stated) while every primitive it calls — findDuplicate, fuzzyMatch,
// fuzzyMatchWithGenDetection, getGenForPokemon, getPokemonForGens/getAllPokemon —
// and the gameReducer are the real production code running against the genuine
// assets/quiz.db (via the vitest expo-sqlite -> better-sqlite3 alias). So the
// generations that route an answer to a vote (or not) are the shipped data, not a
// hand-coded table: this locks the intersection of "what fuzzy match resolves" and
// "which reducer action the game takes" for that resolution.

type PipelineDecision =
  | { kind: 'duplicate'; item: string }
  | { kind: 'no-match' }
  | { kind: 'propose'; item: string }
  | { kind: 'gen-change'; generation: number; item: string };

// Faithful restatement of processInput's routing (GameScreen.tsx:113-195).
// isQuizMode is read off state.quizConfig, which createInitialState copies from the
// category's quizConfig — equivalent to the screen's `isPokemon && !!category.quizConfig`.
function decideInput(state: GameState, text: string): PipelineDecision {
  const isPokemon = state.category.type === 'pokemon';
  const isQuizMode = isPokemon && !!state.quizConfig;

  const dup = findDuplicate(text, state.usedItems);
  if (dup) return { kind: 'duplicate', item: dup };

  if (isPokemon) {
    const itemNames = getPokemonForGens(state.activeGenerations).map((p) => p.name);
    const allNames = getAllPokemon().map((p) => p.name);
    const result = fuzzyMatchWithGenDetection(
      text,
      itemNames,
      allNames,
      state.usedItems,
      getGenForPokemon,
    );
    if (result.confidence === 'none') return { kind: 'no-match' };
    // Quiz mode routes any match straight to a proposal — generation detection is
    // intentionally skipped (gens are fixed by the question's constraints).
    if (isQuizMode && state.currentQuestion && result.match) {
      return { kind: 'propose', item: result.match };
    }
    if (result.generation && !state.activeGenerations.includes(result.generation)) {
      return { kind: 'gen-change', generation: result.generation, item: result.match! };
    }
    return { kind: 'propose', item: result.match! };
  }

  const itemNames = getAllFruits().map((f) => f.name);
  const result = fuzzyMatch(text, itemNames, state.usedItems);
  if (result.confidence === 'none') return { kind: 'no-match' };
  return { kind: 'propose', item: result.match! };
}

// Drives the real reducer exactly as the screen's handlers do once a route is
// picked: a plain match is proposed then confirmed (ConfirmationOverlay -> CONFIRM_ITEM
// in non-quiz mode); an inactive-gen match opens an auto-detect vote that every
// active player approves (GenerationVoteOverlay -> CAST_GEN_VOTE). Duplicate/no-match
// take no turn — the screen only shows an error/toast.
function playInput(state: GameState, text: string): { state: GameState; decision: PipelineDecision } {
  const decision = decideInput(state, text);
  switch (decision.kind) {
    case 'duplicate':
    case 'no-match':
      return { state, decision };
    case 'propose': {
      const proposed = gameReducer(state, { type: 'PROPOSE_ITEM', item: decision.item });
      const confirmed = gameReducer(proposed, { type: 'CONFIRM_ITEM' });
      return { state: confirmed, decision };
    }
    case 'gen-change': {
      let s = gameReducer(state, {
        type: 'PROPOSE_GEN_CHANGE',
        generation: decision.generation,
        triggerPokemon: decision.item,
        source: 'auto-detect',
        action: 'add',
      });
      for (const p of s.pendingGenVote!.requiredVoters) {
        s = gameReducer(s, { type: 'CAST_GEN_VOTE', player: p, approve: true });
      }
      return { state: s, decision };
    }
  }
}

const gen1Game = () =>
  createInitialState({
    category: { type: 'pokemon', generations: [1] },
    players: ['A', 'B'],
  });

describe('answer pipeline — Pokemon (real quiz.db)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('an exact active-gen name is proposed, confirmed, and passes the turn', () => {
    const { state, decision } = playInput(gen1Game(), 'Charmander');
    expect(decision).toEqual({ kind: 'propose', item: 'Charmander' });
    expect(state.usedItems).toEqual(['Charmander']);
    expect(state.turnRecords).toHaveLength(1);
    expect(state.turnRecords[0]).toMatchObject({ player: 'A', item: 'Charmander' });
    expect(state.currentPlayer).toBe('B'); // turn advanced
    expect(state.pendingGenVote).toBeNull();
  });

  it('a name reached through an alias for an already-used item is rejected as a duplicate — no turn taken', () => {
    // First name Ekans (Gen 1, active) normally.
    const first = playInput(gen1Game(), 'Ekans').state;
    expect(first.usedItems).toEqual(['Ekans']);
    expect(first.currentPlayer).toBe('B');

    // "he can" is a shipped speech-recognition alias for Ekans; since Ekans is now
    // used, findDuplicate must short-circuit BEFORE any propose/confirm.
    const { state, decision } = playInput(first, 'he can');
    expect(decision).toEqual({ kind: 'duplicate', item: 'Ekans' });
    expect(state.usedItems).toEqual(['Ekans']); // unchanged
    expect(state.confirmationItem).toBeNull();
    expect(state.currentPlayer).toBe('B'); // still B's turn — duplicate cost no turn
  });

  it('unmatched garbage is rejected as no-match and leaves the game untouched', () => {
    const { state, decision } = playInput(gen1Game(), 'zzzzzzzz');
    expect(decision).toEqual({ kind: 'no-match' });
    expect(state.usedItems).toEqual([]);
    expect(state.turnRecords).toEqual([]);
    expect(state.currentPlayer).toBe('A');
    expect(state.confirmationItem).toBeNull();
  });

  it('an exact INACTIVE-gen name opens an expansion vote (never a silent confirm); approval adds the gen and credits the item', () => {
    // Mudkip is Gen 3 in the shipped data; the Gen-1 game does not include it, so
    // the pipeline must route to a generation vote rather than confirming it as
    // some near-by Gen-1 name. Approval both expands the pool AND records the
    // trigger Pokemon as the proposer's turn.
    expect(getGenForPokemon('Mudkip')).toBe(3); // real-data precondition

    const { state, decision } = playInput(gen1Game(), 'Mudkip');
    expect(decision).toEqual({ kind: 'gen-change', generation: 3, item: 'Mudkip' });
    expect([...state.activeGenerations].sort()).toEqual([1, 3]);
    expect(state.usedItems).toEqual(['Mudkip']);
    expect(state.turnRecords[0]).toMatchObject({ player: 'A', item: 'Mudkip' });
    expect(state.currentPlayer).toBe('B'); // proposer's turn resolved, play advanced
    expect(state.pendingGenVote).toBeNull();
  });
});

describe('answer pipeline — quiz mode suppresses generation detection', () => {
  const question: QuizQuestion = {
    constraints: [{ kind: 'generation', generation: 1 }],
    promptText: 'Name a Gen 1 Pokemon',
    validAnswerCount: 151,
    difficulty: 'easy',
  };

  const quizConfig = {
    difficulty: 'easy' as const,
    filter: { includeLegendary: true, includeMythical: true },
    hardcore: false,
  };

  const quizGen1 = (): GameState => {
    // quizConfig must be passed as createInitialState's top-level arg — not nested
    // in the category — because that is the only channel by which it reaches
    // GameState (GameProvider threads it separately from the category route param).
    const base = createInitialState({
      category: { type: 'pokemon', generations: [1], quizConfig },
      players: ['A', 'B'],
      quizConfig,
    });
    return gameReducer(base, { type: 'SET_QUESTION', question });
  };

  it('the same inactive-gen name that would open a vote in normal mode is proposed directly in quiz mode', () => {
    // Contrast with the normal-mode test above: "Mudkip" (Gen 3) in a Gen-1 quiz
    // must be proposed as an answer to grade against the question's constraints,
    // NOT trigger a generation-expansion vote (gens are fixed by the question).
    const decision = decideInput(quizGen1(), 'Mudkip');
    expect(decision).toEqual({ kind: 'propose', item: 'Mudkip' });

    // And the reducer refuses to open a gen vote in quiz mode even if asked, so no
    // route can smuggle one in.
    const proposed = gameReducer(quizGen1(), { type: 'PROPOSE_ITEM', item: 'Mudkip' });
    expect(proposed.confirmationItem).toBe('Mudkip');
    expect(proposed.pendingGenVote).toBeNull();
  });
});

describe('answer pipeline — fruits (no generation concept)', () => {
  const fruitGame = () =>
    createInitialState({ category: { type: 'fruits' }, players: ['A', 'B'] });

  it('an exact fruit is proposed and confirmed', () => {
    const { state, decision } = playInput(fruitGame(), 'Apple');
    expect(decision).toEqual({ kind: 'propose', item: 'Apple' });
    expect(state.usedItems).toEqual(['Apple']);
    expect(state.currentPlayer).toBe('B');
  });

  it('an unknown fruit is rejected as no-match — the fruits branch never attempts gen detection', () => {
    const { state, decision } = playInput(fruitGame(), 'zzzzzzzz');
    expect(decision).toEqual({ kind: 'no-match' });
    expect(state.usedItems).toEqual([]);
    expect(state.currentPlayer).toBe('A');
  });
});
