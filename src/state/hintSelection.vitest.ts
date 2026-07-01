import { describe, it, expect } from 'vitest';
import { createInitialState, gameReducer } from './gameReducer';
import {
  buildBaselineQuery,
  constraintsToQuery,
  validateAnswerPerConstraint,
} from '../utils/quizQuestionGenerator';
import { queryPokemon, getPokemonForGens } from '../data/pokemon-db';
import { GameState, HintRecord, QuizConfig, QuizConstraint } from '../types';

// Integration / seam suite for the HINT path.
//
// The hint feature has three untested selection stages, all living inside GameScreen
// (a React component with audio/navigation wiring, so no direct unit coverage) but each
// of which runs pure selection logic over the real bundled assets/quiz.db:
//
//   • QUIZ-MODE hint pick (GameScreen.tsx:295-303) — CLAUDE.md's design promise that
//     "hints in quiz mode pick from valid answers for the current question". The candidate
//     pool is constraintsToQuery(buildBaselineQuery(...), currentQuestion.constraints), so
//     every offered silhouette must satisfy EVERY current constraint AND respect usedItems.
//   • NORMAL-mode hint pick (GameScreen.tsx:305-308) — a random UNUSED pokemon scoped to the
//     ACTIVE generations only.
//   • POST-GAME learning section (GameScreen.tsx:331-344) — on game end, revealed hints that
//     were never named survive as silhouettes and the remaining slots (up to 5) are padded
//     with random unnamed 'bonus' pokemon.
//
// gamePaths.vitest.ts covers the reducer's REVEAL_HINT/SHOW_HINT bookkeeping (hintsUsed, the
// 5-slot record cap), but the SELECTION of WHICH pokemon a hint offers — and how the end-game
// learning list is assembled — has no coverage. The picks use Math.random(), so these tests
// assert invariants over the candidate SET (membership / validity), never which element is
// drawn, and are therefore deterministic. Below the mirrored branch structure everything is
// production code: buildBaselineQuery, constraintsToQuery, validateAnswerPerConstraint,
// queryPokemon and getPokemonForGens against the genuine quiz.db.

const permissive: QuizConfig = {
  difficulty: 'easy',
  filter: { includeLegendary: true, includeMythical: true },
  hardcore: false,
};

// A Gen-1 quiz game already showing `constraints` as its current question — mirrors
// quizAnswerFlow.vitest.ts's fixture (quizConfig MUST be the top-level arg, not just nested
// in the category, or state.quizConfig is null and the game isn't a quiz).
function quizGame(constraints: QuizConstraint[], usedItems: string[] = []): GameState {
  let state = createInitialState({
    category: { type: 'pokemon', generations: [1], quizConfig: permissive },
    players: ['A', 'B'],
    quizConfig: permissive,
  });
  state = gameReducer(state, {
    type: 'SET_QUESTION',
    question: { constraints, promptText: '', validAnswerCount: 1, difficulty: 'easy' },
  });
  return { ...state, usedItems };
}

// Faithful restatement of GameScreen.handleHint's QUIZ branch (GameScreen.tsx:295-303):
// build the current-question query off the baseline and return the pool the random pick is
// drawn from (null models the `validPokemon.length === 0 -> return` guard: no SHOW_HINT).
function quizHintPool(state: GameState): { name: string; pokedexNumber: number }[] | null {
  const query = constraintsToQuery(
    buildBaselineQuery(permissive.filter, state.activeGenerations, state.usedItems),
    state.currentQuestion!.constraints,
  );
  const valid = queryPokemon(query);
  return valid.length === 0 ? null : valid;
}

// Faithful restatement of GameScreen.handleHint's NORMAL branch (GameScreen.tsx:305-308):
// the unused pokemon within the active generations.
function normalHintPool(state: GameState): { name: string; pokedexNumber: number }[] | null {
  const unused = getPokemonForGens(state.activeGenerations).filter(
    (p) => !state.usedItems.includes(p.name),
  );
  return unused.length === 0 ? null : unused;
}

// Faithful restatement of the end-game learning-section builder (GameScreen.tsx:331-344):
// surviving (un-named) revealed hints, padded with random 'bonus' unnamed pokemon up to 5.
function buildLearningSection(state: GameState, isPokemon: boolean): HintRecord[] {
  const hints = state.revealedHints.filter((h) => !state.usedItems.includes(h.pokemonName));
  if (isPokemon && hints.length < 5) {
    const taken = new Set(hints.map((h) => h.pokemonName));
    const pool = getPokemonForGens(state.activeGenerations).filter(
      (p) => !state.usedItems.includes(p.name) && !taken.has(p.name),
    );
    while (hints.length < 5 && pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length);
      const pick = pool.splice(idx, 1)[0];
      hints.push({ pokemonName: pick.name, pokemonId: pick.pokedexNumber, source: 'bonus' });
    }
  }
  return hints;
}

// ---------------------------------------------------------------------------
// QUIZ-MODE hint pick — every offered silhouette is a VALID answer
// ---------------------------------------------------------------------------
describe('quiz-mode hint pick — offers only valid answers to the current question', () => {
  const fireQ: QuizConstraint[] = [{ kind: 'type', pokemonType: 'fire' }];

  it('the candidate pool is non-empty and gen+constraint scoped', () => {
    const pool = quizHintPool(quizGame(fireQ))!;
    const names = pool.map((p) => p.name);
    expect(pool.length).toBeGreaterThan(0);
    expect(names).toContain('Charizard'); // Gen-1 fire -> in
    expect(names).not.toContain('Blastoise'); // Gen-1 water -> wrong constraint, out
    expect(names).not.toContain('Chikorita'); // Gen-2 -> outside active gens, out
  });

  it('EVERY candidate passes the real per-constraint grade (hints can never be a wrong answer)', () => {
    // The pick GameScreen offers as a silhouette is drawn from this exact pool, so the
    // hint-selection query and the answer-grading gate must agree: no offered hint could
    // be typed back and rejected. This cross-checks the two independent production paths.
    const pool = quizHintPool(quizGame(fireQ))!;
    for (const p of pool) {
      const feedback = validateAnswerPerConstraint(
        p.name,
        { constraints: fireQ, promptText: '', validAnswerCount: 1, difficulty: 'easy' },
        [1],
      );
      expect(feedback.every((f) => f.passed)).toBe(true);
    }
  });

  it('excludes already-used pokemon from the candidate pool', () => {
    const full = quizHintPool(quizGame(fireQ))!.length;
    const pool = quizHintPool(quizGame(fireQ, ['Charizard']))!;
    expect(pool.map((p) => p.name)).not.toContain('Charizard');
    expect(pool.length).toBe(full - 1);
  });

  it('returns no pick (the length===0 guard) when every valid answer is already used', () => {
    // Exhaust the whole valid set -> the guard fires and NO silhouette is shown.
    const allValid = quizHintPool(quizGame(fireQ))!.map((p) => p.name);
    expect(quizHintPool(quizGame(fireQ, allValid))).toBeNull();
  });

  it('respects a multi-constraint (hard) question: picks satisfy ALL constraints', () => {
    const hardQ: QuizConstraint[] = [
      { kind: 'type', pokemonType: 'water' },
      { kind: 'statRank', stat: 'speed', topN: 20 },
    ];
    const pool = quizHintPool(quizGame(hardQ))!;
    expect(pool.length).toBeGreaterThan(0);
    for (const p of pool) {
      const feedback = validateAnswerPerConstraint(
        p.name,
        { constraints: hardQ, promptText: '', validAnswerCount: 1, difficulty: 'hard' },
        [1],
      );
      expect(feedback.every((f) => f.passed)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// NORMAL-mode hint pick — a random UNUSED pokemon within the active gens
// ---------------------------------------------------------------------------
describe('normal-mode hint pick — unused pokemon scoped to the active generations', () => {
  function normalGame(activeGens: number[], usedItems: string[] = []): GameState {
    const state = createInitialState({
      category: { type: 'pokemon', generations: activeGens },
      players: ['A', 'B'],
    });
    return { ...state, usedItems };
  }

  it('the candidate pool is the full active-gen set when nothing is used', () => {
    const pool = normalHintPool(normalGame([1]))!;
    expect(pool.length).toBe(151); // all of Gen 1
    expect(pool.map((p) => p.name)).toContain('Bulbasaur');
    expect(pool.map((p) => p.name)).not.toContain('Chikorita'); // Gen 2 stays out
  });

  it('excludes used items from the pool', () => {
    const pool = normalHintPool(normalGame([1], ['Bulbasaur', 'Charmander']))!;
    const names = pool.map((p) => p.name);
    expect(names).not.toContain('Bulbasaur');
    expect(names).not.toContain('Charmander');
    expect(pool.length).toBe(151 - 2);
  });

  it('returns no pick (the length===0 guard) when the whole active board is used up', () => {
    const allGen1 = getPokemonForGens([1]).map((p) => p.name);
    expect(normalHintPool(normalGame([1], allGen1))).toBeNull();
  });

  it('widens the pool when a second generation is active', () => {
    const gen1 = normalHintPool(normalGame([1]))!.length;
    const gen12 = normalHintPool(normalGame([1, 2]))!.length;
    expect(gen12).toBeGreaterThan(gen1);
    expect(normalHintPool(normalGame([1, 2]))!.map((p) => p.name)).toContain('Chikorita');
  });
});

// ---------------------------------------------------------------------------
// POST-GAME learning section — surviving hints + 'bonus' padding to 5
// ---------------------------------------------------------------------------
describe('post-game learning section — un-named hints padded with bonus suggestions', () => {
  function endedGame(revealedHints: HintRecord[], usedItems: string[]): GameState {
    const state = createInitialState({
      category: { type: 'pokemon', generations: [1] },
      players: ['A', 'B'],
    });
    return { ...state, revealedHints, usedItems };
  }

  const hint = (name: string, id: number): HintRecord => ({
    pokemonName: name,
    pokemonId: id,
    source: 'hint',
  });

  it('drops hints whose pokemon were subsequently named, then pads to exactly 5', () => {
    const revealed: HintRecord[] = [hint('Pikachu', 25), hint('Mewtwo', 150)];
    // Pikachu ended up named -> it must NOT survive as a silhouette.
    const result = buildLearningSection(endedGame(revealed, ['Pikachu']), true);
    const surviving = result.filter((h) => h.source === 'hint');
    expect(surviving).toEqual([hint('Mewtwo', 150)]);
    expect(result).toHaveLength(5);
    expect(result.filter((h) => h.source === 'bonus')).toHaveLength(4);
  });

  it('every bonus pick is an unnamed, non-duplicate, active-gen pokemon (invariant over 20 runs)', () => {
    const revealed: HintRecord[] = [hint('Mewtwo', 150)];
    const used = ['Charizard', 'Blastoise'];
    const gen1 = new Set(getPokemonForGens([1]).map((p) => p.name));
    for (let i = 0; i < 20; i++) {
      const result = buildLearningSection(endedGame(revealed, used), true);
      const bonus = result.filter((h) => h.source === 'bonus');
      const names = new Set<string>();
      for (const b of bonus) {
        expect(gen1.has(b.pokemonName)).toBe(true); // active-gen scoped
        expect(used).not.toContain(b.pokemonName); // never a used item
        expect(b.pokemonName).not.toBe('Mewtwo'); // never duplicates a surviving hint
        expect(names.has(b.pokemonName)).toBe(false); // no bonus duplicates itself
        names.add(b.pokemonName);
      }
      expect(result).toHaveLength(5);
    }
  });

  it('adds NO bonus padding when 5 hints already survive', () => {
    const revealed: HintRecord[] = [
      hint('Mewtwo', 150),
      hint('Articuno', 144),
      hint('Zapdos', 145),
      hint('Moltres', 146),
      hint('Dragonite', 149),
    ];
    const result = buildLearningSection(endedGame(revealed, []), false /* isPokemon irrelevant, but */);
    // isPokemon must be true for padding; even when true, a full-5 list is left untouched.
    const resultPokemon = buildLearningSection(endedGame(revealed, []), true);
    expect(result).toEqual(revealed);
    expect(resultPokemon).toEqual(revealed);
    expect(resultPokemon.every((h) => h.source === 'hint')).toBe(true);
  });

  it('does not pad for a non-pokemon (fruits) game — no learning silhouettes', () => {
    const state = createInitialState({ category: { type: 'fruits' }, players: ['A', 'B'] });
    const result = buildLearningSection({ ...state, revealedHints: [], usedItems: [] }, false);
    expect(result).toEqual([]);
  });
});
