import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createInitialState, gameReducer } from './gameReducer';
import { fuzzyMatchWithGenDetection } from '../utils/fuzzyMatch';
import { validateAnswerPerConstraint } from '../utils/quizQuestionGenerator';
import {
  getPokemonForGens,
  getAllPokemon,
  getGenForPokemon,
} from '../data/pokemon-db';
import { GameState, QuizConstraint, QuizConfig } from '../types';

// Integration / seam suite for the QUIZ-MODE ANSWER GATE.
//
// In normal mode a proposed answer is simply confirmed (ConfirmationOverlay ->
// CONFIRM_ITEM). Quiz mode is different: GameScreen.handleConfirm (GameScreen.tsx:201-241)
// runs the proposed item through validateAnswerPerConstraint and only then decides which
// reducer action to take —
//
//   • ANY constraint fails  -> dispatch REJECT_ITEM (close the overlay, NO score, NO turn
//     advance) followed by SET_ERROR; crucially the question is left intact so the same
//     player retries the SAME question.
//   • ALL constraints pass  -> (after a 2s success banner) dispatch CONFIRM_ITEM, which
//     scores the turn, advances the player AND clears currentQuestion, so the regeneration
//     effect (GameScreen.tsx:83-95) mints a fresh question for the next turn.
//
// The grading function is unit-tested in isolation (quizAnswerValidation.vitest.ts) and the
// reducer actions are tested in isolation (inputLifecycle / gamePaths), but the SEAM — raw
// text -> fuzzy match -> propose -> GRADE -> the right reducer action -> resulting game
// state, including the currentQuestion lifecycle across the grade — has no coverage.
// answerPipeline.vitest.ts stops at "quiz mode routes to propose"; this picks up from the
// proposal and drives the grade decision through the real reducer.
//
// Everything below the mirrored branch logic is production code — fuzzyMatchWithGenDetection,
// validateAnswerPerConstraint and gameReducer running against the genuine bundled
// assets/quiz.db (via the vitest expo-sqlite -> better-sqlite3 alias).

type QuizRoute =
  | { route: 'no-match' }
  | { route: 'accepted'; item: string }
  | { route: 'rejected'; item: string };

// Faithful restatement of GameScreen's quiz-answer path: the propose route from
// processInput (GameScreen.tsx:146-174) followed by the grade-and-dispatch in
// handleConfirm (GameScreen.tsx:201-241). Only the branch STRUCTURE is re-stated; the
// match, the grade and every reducer transition are the real production code.
function playQuizAnswer(
  state: GameState,
  text: string,
  isHardcore = false,
): { state: GameState; result: QuizRoute; feedback: { label: string; passed: boolean }[] } {
  const itemNames = getPokemonForGens(state.activeGenerations).map((p) => p.name);
  const allNames = getAllPokemon().map((p) => p.name);

  const match = fuzzyMatchWithGenDetection(
    text,
    itemNames,
    allNames,
    state.usedItems,
    getGenForPokemon,
  );

  // In quiz mode a resolved match ALWAYS proposes — generation detection is skipped
  // (gens are fixed by the question) so an out-of-gen name is graded, never voted on.
  if (match.confidence === 'none') return { state, result: { route: 'no-match' }, feedback: [] };

  const proposed = gameReducer(state, { type: 'PROPOSE_ITEM', item: match.match! });

  // The confirm gate: grade every constraint, accept iff all pass.
  const feedback = validateAnswerPerConstraint(
    proposed.confirmationItem!,
    proposed.currentQuestion!,
    proposed.activeGenerations,
  );
  const allPassed = feedback.every((f) => f.passed);

  if (!allPassed) {
    // REJECT_ITEM then SET_ERROR, exactly as handleConfirm dispatches them.
    let s = gameReducer(proposed, { type: 'REJECT_ITEM' });
    const msg = isHardcore ? 'Wrong! Try again' : `${proposed.confirmationItem} doesn't match!`;
    s = gameReducer(s, { type: 'SET_ERROR', message: msg });
    return { state: s, result: { route: 'rejected', item: match.match! }, feedback };
  }

  // Accept: the success banner defers this, but the net reducer transition is CONFIRM_ITEM.
  const confirmed = gameReducer(proposed, { type: 'CONFIRM_ITEM' });
  return { state: confirmed, result: { route: 'accepted', item: match.match! }, feedback };
}

const quizConfig: QuizConfig = {
  difficulty: 'easy',
  filter: { includeLegendary: true, includeMythical: true },
  hardcore: false,
};

// Build a Gen-1 quiz game already showing `constraints` as its current question.
// quizConfig must be createInitialState's top-level arg (see answerPipeline.vitest.ts) —
// nesting it only in the category leaves state.quizConfig null and the game is not a quiz.
function quizGame(constraints: QuizConstraint[], players = ['A', 'B']): GameState {
  const base = createInitialState({
    category: { type: 'pokemon', generations: [1], quizConfig },
    players,
    quizConfig,
  });
  return gameReducer(base, {
    type: 'SET_QUESTION',
    question: { constraints, promptText: '', validAnswerCount: 1, difficulty: 'easy' },
  });
}

describe('quiz answer gate — correct answer scores, advances, and clears the question', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('a Gen-1 fire answer to a "Fire type" question is accepted, scored, and rotates the turn', () => {
    // Implicit-gen row [1] + Fire: Charizard (Gen 1, fire/flying) satisfies both.
    const { state, result, feedback } = playQuizAnswer(
      quizGame([{ kind: 'type', pokemonType: 'fire' }]),
      'Charizard',
    );
    expect(result).toEqual({ route: 'accepted', item: 'Charizard' });
    expect(feedback).toEqual([
      { label: 'Gen 1', passed: true },
      { label: 'Fire type', passed: true },
    ]);
    expect(state.usedItems).toEqual(['Charizard']);
    expect(state.turnRecords[0]).toMatchObject({ player: 'A', item: 'Charizard' });
    expect(state.currentPlayer).toBe('B'); // turn advanced
    expect(state.confirmationItem).toBeNull();
    // The accepted answer CLEARS the question so the regeneration effect mints a new one.
    expect(state.currentQuestion).toBeNull();
  });
});

describe('quiz answer gate — wrong-constraint answer is proposed then rejected without a turn', () => {
  it('a Gen-1 WATER pokemon is still proposed (anti-gaming) but the grade rejects it, keeping the question', () => {
    // The fuzzy match runs against ALL pokemon, so a wrong-constraint but real, in-gen name
    // (Blastoise: Gen 1, water) resolves and proposes — the player gets no free signal from
    // the input stage. The per-constraint grade is what rejects it.
    const q = quizGame([{ kind: 'type', pokemonType: 'fire' }]);
    const { state, result, feedback } = playQuizAnswer(q, 'Blastoise');

    expect(result).toEqual({ route: 'rejected', item: 'Blastoise' });
    expect(feedback).toEqual([
      { label: 'Gen 1', passed: true }, // in gen...
      { label: 'Fire type', passed: false }, // ...but wrong type -> overall reject
    ]);
    // No score, no turn advance, item not consumed.
    expect(state.usedItems).toEqual([]);
    expect(state.turnRecords).toEqual([]);
    expect(state.currentPlayer).toBe('A');
    expect(state.confirmationItem).toBeNull(); // overlay closed
    // The SAME question survives so the current player retries it.
    expect(state.currentQuestion).not.toBeNull();
    expect(state.currentQuestion!.constraints).toEqual([{ kind: 'type', pokemonType: 'fire' }]);
    expect(state.errorMessage).toBe("Blastoise doesn't match!");
  });

  it('hardcore mode rejects identically but sets the generic error message', () => {
    // The reducer transition is the same; only the surfaced error text differs.
    const q = quizGame([{ kind: 'type', pokemonType: 'fire' }]);
    const { state, result } = playQuizAnswer(q, 'Blastoise', true);
    expect(result.route).toBe('rejected');
    expect(state.errorMessage).toBe('Wrong! Try again');
    expect(state.currentQuestion).not.toBeNull();
  });
});

describe('quiz answer gate — generation is enforced by the grade, not by an expansion vote', () => {
  it('an out-of-gen answer to a "Psychic type" question is proposed then rejected on the gen row', () => {
    // Espeon is a Gen-2 psychic. In normal mode this name opens a generation-expansion vote;
    // in quiz mode it is proposed and graded — and fails the implicit Gen-1 row.
    const q = quizGame([{ kind: 'type', pokemonType: 'psychic' }]);
    const { state, result, feedback } = playQuizAnswer(q, 'Espeon');

    expect(result).toEqual({ route: 'rejected', item: 'Espeon' });
    expect(feedback).toEqual([
      { label: 'Gen 1', passed: false }, // Gen 2 -> fails the implicit-gen row
      { label: 'Psychic type', passed: true }, // type is right, but the gen kills it
    ]);
    expect(state.pendingGenVote).toBeNull(); // never routed to a vote
    expect(state.activeGenerations).toEqual([1]); // pool never expanded
    expect(state.usedItems).toEqual([]);
    expect(state.currentPlayer).toBe('A');
  });

  it('an in-gen, on-type answer to the same question is accepted', () => {
    const q = quizGame([{ kind: 'type', pokemonType: 'psychic' }]);
    const { state, result } = playQuizAnswer(q, 'Alakazam'); // Gen 1 psychic
    expect(result).toEqual({ route: 'accepted', item: 'Alakazam' });
    expect(state.usedItems).toEqual(['Alakazam']);
    expect(state.currentQuestion).toBeNull();
  });
});

describe('quiz answer gate — full multi-constraint round trip across two turns', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('a wrong answer keeps A on the same question; the next accepted answer scores and regenerates', () => {
    // Legendary + Psychic, implicit Gen 1. Only Mewtwo qualifies in Gen 1.
    const constraints: QuizConstraint[] = [
      { kind: 'legendary', value: true },
      { kind: 'type', pokemonType: 'psychic' },
    ];
    const q = quizGame(constraints);

    // A guesses Alakazam: Gen-1 psychic but NOT legendary -> rejected, still A's question.
    const wrong = playQuizAnswer(q, 'Alakazam');
    expect(wrong.result.route).toBe('rejected');
    expect(wrong.feedback).toEqual([
      { label: 'Gen 1', passed: true },
      { label: 'Legendary', passed: false },
      { label: 'Psychic type', passed: true },
    ]);
    expect(wrong.state.currentPlayer).toBe('A');
    expect(wrong.state.currentQuestion!.constraints).toEqual(constraints); // unchanged

    // A retries with Mewtwo (Gen-1, legendary, psychic) -> accepted, turn passes to B,
    // question cleared so a new one would be generated.
    const right = playQuizAnswer(wrong.state, 'Mewtwo');
    expect(right.result.route).toBe('accepted');
    expect(right.state.usedItems).toEqual(['Mewtwo']);
    expect(right.state.turnRecords[0]).toMatchObject({ player: 'A', item: 'Mewtwo' });
    expect(right.state.currentPlayer).toBe('B');
    expect(right.state.currentQuestion).toBeNull();
  });
});
