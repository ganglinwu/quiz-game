import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createInitialState, gameReducer } from './gameReducer';
import {
  generateQuestion,
  buildBaselineQuery,
  constraintsToQuery,
} from '../utils/quizQuestionGenerator';
import { getPokemonForGens, queryPokemon } from '../data/pokemon-db';
import { Category, GameAction, GameState, QuizConfig } from '../types';

// Integration / seam suite for the QUIZ-MODE QUESTION-GENERATION EFFECT.
//
// Each quiz turn a useEffect (GameScreen.tsx:83-95) mints the next question:
//
//   if (!isQuizMode || state.currentQuestion || state.isGameOver) return;      // regen guard
//   const question = generateQuestion(quizConfig, state.activeGenerations, state.usedItems);
//   dispatch(question ? { type: 'SET_QUESTION', question }                     // pool has answers
//                     : { type: 'QUESTION_POOL_EXHAUSTED' });                  // pool is dry -> draw
//
// The PURE generator is unit-tested (quizGeneration.vitest.ts: invariants + auto-degrade) and
// both reducer transitions exist as fixtures/assertions elsewhere (quizAnswerFlow seeds a question
// with SET_QUESTION; gamePaths ends a game with QUESTION_POOL_EXHAUSTED). But the SEAM — the
// effect's GUARD (skip when not-quiz / question-already-present / game-over), its ROUTING of
// generateQuestion's return, and its threading of LIVE game state (activeGenerations + the
// usedItems the reducer accumulates as answers are confirmed) — has no coverage. quizAnswerFlow
// stops after clearing the question on a correct answer; this picks up there and drives the
// regeneration.
//
// Everything below the mirrored effect logic is production code — generateQuestion and gameReducer
// running against the genuine bundled assets/quiz.db (via the vitest expo-sqlite -> better-sqlite3
// alias).

const quizConfig: QuizConfig = {
  difficulty: 'easy',
  filter: { includeLegendary: true, includeMythical: true },
  hardcore: false,
};

// Faithful restatement of GameScreen.tsx:61-95 — isPokemon / isQuizMode derivation, the regen
// guard, generateQuestion's arguments, and the SET_QUESTION vs QUESTION_POOL_EXHAUSTED routing.
// Returns the action the effect would dispatch, or null when the guard makes it a no-op.
function runQuestionGenEffect(state: GameState, category: Category): GameAction | null {
  const isPokemon = category.type === 'pokemon';
  const isQuizMode = isPokemon && !!category.quizConfig;
  if (!isQuizMode || state.currentQuestion || state.isGameOver) return null;
  const question = generateQuestion(
    category.quizConfig!,
    state.activeGenerations,
    state.usedItems,
  );
  return question
    ? { type: 'SET_QUESTION', question }
    : { type: 'QUESTION_POOL_EXHAUSTED' };
}

// Run the effect and, when it would dispatch, apply that action through the real reducer.
function applyQuestionGenEffect(
  state: GameState,
  category: Category,
): { action: GameAction | null; state: GameState } {
  const action = runQuestionGenEffect(state, category);
  return { action, state: action ? gameReducer(state, action) : state };
}

// A Gen-1 quiz game with no current question yet (the state the effect fires against on turn 1).
// quizConfig must be BOTH createInitialState's top-level arg (so state.quizConfig is set) AND on
// the category (so the effect's isQuizMode/generateQuestion see it) — same wiring as production.
const quizCategory: Category = { type: 'pokemon', generations: [1], quizConfig };
function freshQuizGame(players = ['A', 'B']): GameState {
  return createInitialState({ category: quizCategory, players, quizConfig });
}

describe('quiz question effect — mints a question on a fresh quiz turn (SET_QUESTION route)', () => {
  it('generates an answerable Gen-1 easy question and stores it in currentQuestion', () => {
    const { action, state } = applyQuestionGenEffect(freshQuizGame(), quizCategory);

    expect(action?.type).toBe('SET_QUESTION');
    expect(state.currentQuestion).not.toBeNull();
    // Easy = exactly one constraint, and the generator only returns questions it verified have
    // at least one un-used answer.
    expect(state.currentQuestion!.constraints).toHaveLength(1);
    expect(state.currentQuestion!.difficulty).toBe('easy');
    expect(state.currentQuestion!.validAnswerCount).toBeGreaterThan(0);
    // Minting a question must not end the game.
    expect(state.isGameOver).toBe(false);
  });
});

describe('quiz question effect — routes to QUESTION_POOL_EXHAUSTED when no valid question remains', () => {
  it('ends the game as a draw once every active-gen answer has been used', () => {
    // Exhaust the pool: with every Gen-1 name already used, every candidate constraint queries
    // to zero and generateQuestion returns null.
    const allGen1 = getPokemonForGens([1]).map((p) => p.name);
    const exhausted: GameState = { ...freshQuizGame(), usedItems: allGen1 };

    const { action, state } = applyQuestionGenEffect(exhausted, quizCategory);

    expect(action?.type).toBe('QUESTION_POOL_EXHAUSTED');
    expect(state.isGameOver).toBe(true);
    expect(state.isDraw).toBe(true);
    expect(state.winner).toBeNull();
    expect(state.currentQuestion).toBeNull();

    // Load-bearing: the exhaustion only happens because the effect threads state.usedItems into
    // generateQuestion. With an empty usedItems the same config still finds a question, so a
    // regression that passed [] would silently keep the game running past a truly dry pool.
    expect(generateQuestion(quizConfig, [1], [])).not.toBeNull();
    expect(generateQuestion(quizConfig, [1], allGen1)).toBeNull();
  });
});

describe('quiz question effect — the regen guard is a no-op', () => {
  it('does nothing for a non-quiz game (never mints a question)', () => {
    const normalCategory: Category = { type: 'pokemon', generations: [1] };
    const normalGame = createInitialState({ category: normalCategory, players: ['A', 'B'] });

    const { action, state } = applyQuestionGenEffect(normalGame, normalCategory);

    expect(action).toBeNull();
    expect(state.currentQuestion).toBeNull();
  });

  it('does not clobber a question that is already showing', () => {
    // Seed a question, then let the effect run again — it must leave the current question intact
    // (the guard is what stops it re-rolling mid-turn, which would make the game trivially gameable).
    const seeded = gameReducer(freshQuizGame(), {
      type: 'SET_QUESTION',
      question: {
        constraints: [{ kind: 'type', pokemonType: 'fire' }],
        promptText: '',
        validAnswerCount: 1,
        difficulty: 'easy',
      },
    });

    const { action, state } = applyQuestionGenEffect(seeded, quizCategory);

    expect(action).toBeNull();
    expect(state).toBe(seeded); // reference-equal: genuine no-op
    expect(state.currentQuestion!.constraints).toEqual([{ kind: 'type', pokemonType: 'fire' }]);
  });

  it('does not mint a question once the game is over', () => {
    const over: GameState = { ...freshQuizGame(), isGameOver: true };

    const { action, state } = applyQuestionGenEffect(over, quizCategory);

    expect(action).toBeNull();
    expect(state.currentQuestion).toBeNull();
  });
});

describe('quiz question effect — the confirm -> regenerate loop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('regenerates a fresh, non-repeating question after a correct answer clears the current one', () => {
    // Turn 1: a Fire question is showing; A answers Charizard (Gen-1 fire), which CONFIRM_ITEM
    // scores + records + clears currentQuestion, arming the regeneration effect for turn 2.
    const turn1 = gameReducer(freshQuizGame(), {
      type: 'SET_QUESTION',
      question: {
        constraints: [{ kind: 'type', pokemonType: 'fire' }],
        promptText: '',
        validAnswerCount: 1,
        difficulty: 'easy',
      },
    });
    const proposed = gameReducer(turn1, { type: 'PROPOSE_ITEM', item: 'Charizard' });
    const afterConfirm = gameReducer(proposed, { type: 'CONFIRM_ITEM' });

    expect(afterConfirm.usedItems).toEqual(['Charizard']);
    expect(afterConfirm.currentPlayer).toBe('B'); // turn advanced
    expect(afterConfirm.currentQuestion).toBeNull(); // question cleared -> effect will fire

    // Turn 2: the effect mints the next question against the UPDATED usedItems.
    const { action, state } = applyQuestionGenEffect(afterConfirm, quizCategory);
    expect(action?.type).toBe('SET_QUESTION');
    const q2 = state.currentQuestion!;
    expect(q2.validAnswerCount).toBeGreaterThan(0);

    // The new question's answer pool (rebuilt from its constraints over a used-excluded baseline)
    // is non-empty AND excludes Charizard — so the just-named Pokemon can never be re-offered as
    // an answer, and the game can always continue.
    const pool = queryPokemon(
      constraintsToQuery(
        buildBaselineQuery(quizConfig.filter, state.activeGenerations, state.usedItems),
        q2.constraints,
      ),
    );
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.some((p) => p.name === 'Charizard')).toBe(false);
  });
});
