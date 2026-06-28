import { describe, it, expect } from 'vitest';
import { validateAnswerPerConstraint } from './quizQuestionGenerator';
import type { QuizConstraint, QuizQuestion } from '../types';

// `validateAnswerPerConstraint` is the quiz-mode answer-GRADING gate: GameScreen accepts an
// answer iff `validateAnswerPerConstraint(...).every(f => f.passed)`, and the per-row
// { label, passed } pairs are exactly what QuizQuestionBanner renders as the ✓/✗ feedback.
//
// Until now only the question-GENERATION path (buildBaselineQuery -> constraintsToQuery ->
// queryPokemon) was tested (quizQuestionGenerator.vitest.ts). This suite locks the grading
// gate, which is where two things the rest of the run depends on actually live:
//
//   • The iteration-1 gen-scoping fix for the user's #1 complaint — evolutionStage (and
//     statRank) are evaluated relative to the active generations, so Pikachu is "Unevolved"
//     in a Gen-1 quiz rather than "Middle" (Pichu is Gen 2). Tested at queryPokemon level by
//     pokemon-db.vitest.ts; tested here at the gate the player actually hits.
//   • The banner ↔ feedback index alignment: displayRows is [implicit-gen row?, ...constraints
//     mapped to labels] under the same `hasGenConstraint` condition, so feedback[i] must line
//     up with displayRows[i]. A reorder or a changed gen-prepend condition would mis-paint the
//     ✓/✗ on the wrong constraint; the label assertions below pin the exact sequence.
//
// Runs against the genuine bundled assets/quiz.db via the better-sqlite3 shim aliased in
// vitest.config.ts, so a regression in the validation logic OR the underlying query/data
// trips these tests.

// Only `constraints` is read by validateAnswerPerConstraint; the other QuizQuestion fields
// are inert here.
const question = (constraints: QuizConstraint[]): QuizQuestion => ({
  constraints,
  promptText: '',
  validAnswerCount: 0,
  difficulty: 'easy',
});

// Mirror of GameScreen's accept/reject gate, so tests read as user-facing accept/reject.
const accepts = (name: string, q: QuizQuestion, gens: number[]): boolean =>
  validateAnswerPerConstraint(name, q, gens).every((f) => f.passed);

const labels = (name: string, q: QuizQuestion, gens: number[]): string[] =>
  validateAnswerPerConstraint(name, q, gens).map((f) => f.label);

describe('validateAnswerPerConstraint — gen-scoped evolution stage (the #1 complaint, at the grading gate)', () => {
  // Chain 10: Pichu (Gen 2) -> Pikachu (Gen 1) -> Raichu (Gen 1). In a Gen-1 quiz Pichu is
  // excluded, so the in-gen chain is Pikachu -> Raichu: Pikachu is gen-relative *base*
  // (no in-gen parent) and Raichu is *final*. The pre-iteration-1 (gen-blind) logic treated
  // Pikachu as "middle" because of Pichu — exactly the bug the user reported.
  const finalQ = question([{ kind: 'evolutionStage', stage: 'final' }]);
  const middleQ = question([{ kind: 'evolutionStage', stage: 'middle' }]);
  const baseQ = question([{ kind: 'evolutionStage', stage: 'base' }]);

  it('"Fully evolved" Gen-1 question REJECTS Pikachu (gen-relative base) and ACCEPTS Raichu', () => {
    expect(accepts('Pikachu', finalQ, [1])).toBe(false);
    expect(accepts('Raichu', finalQ, [1])).toBe(true);
  });

  it('"Unevolved" Gen-1 question ACCEPTS Pikachu and REJECTS Raichu', () => {
    expect(accepts('Pikachu', baseQ, [1])).toBe(true);
    expect(accepts('Raichu', baseQ, [1])).toBe(false);
  });

  it('gen scoping is what flips Pikachu: across all gens (Pichu present) Pikachu is "middle", not "base"', () => {
    const allGens = [1, 2, 3, 4, 5, 6];
    expect(accepts('Pikachu', baseQ, allGens)).toBe(false); // Pichu is the base when it's in scope
    expect(accepts('Pikachu', middleQ, allGens)).toBe(true);
  });

  it('within a single gen, a true middle stage is classified correctly (Charmander/Charmeleon/Charizard)', () => {
    // Chain 2 lives entirely in Gen 1, so it is unaffected by gen scoping — a control case.
    expect(accepts('Charmeleon', middleQ, [1])).toBe(true);
    expect(accepts('Charmander', middleQ, [1])).toBe(false); // base
    expect(accepts('Charizard', middleQ, [1])).toBe(false); // final
  });
});

describe('validateAnswerPerConstraint — generation enforcement', () => {
  it('the implicit-gen row rejects a type-correct answer from outside the active gens', () => {
    // Gen-1 quiz, "Psychic type" question (no gen constraint -> implicit "Gen 1" row).
    const psychicQ = question([{ kind: 'type', pokemonType: 'psychic' }]);
    expect(accepts('Alakazam', psychicQ, [1])).toBe(true); // Gen-1 psychic
    expect(accepts('Espeon', psychicQ, [1])).toBe(false); // Gen-2 psychic: type ✓ but gen ✗
    // It fails specifically on the gen row, not the type row:
    expect(validateAnswerPerConstraint('Espeon', psychicQ, [1])).toEqual([
      { label: 'Gen 1', passed: false },
      { label: 'Psychic type', passed: true },
    ]);
  });

  it('an explicit generation constraint pins the gen even when more gens are active', () => {
    // Active gens [1, 2], but the question constrains to Gen 1.
    const gen1PsychicQ = question([
      { kind: 'generation', generation: 1 },
      { kind: 'type', pokemonType: 'psychic' },
    ]);
    expect(accepts('Alakazam', gen1PsychicQ, [1, 2])).toBe(true); // Gen 1 ✓
    expect(accepts('Espeon', gen1PsychicQ, [1, 2])).toBe(false); // Gen 2 pinned out by the gen constraint
  });
});

describe('validateAnswerPerConstraint — feedback labels align with QuizQuestionBanner rows', () => {
  it('prepends an implicit-gen row when the question has no generation constraint', () => {
    const q = question([{ kind: 'type', pokemonType: 'fire' }]);
    expect(labels('Charizard', q, [1])).toEqual(['Gen 1', 'Fire type']);
  });

  it('joins multiple active gens into the implicit-gen row label', () => {
    const q = question([{ kind: 'type', pokemonType: 'fire' }]);
    expect(labels('Charizard', q, [1, 2])[0]).toBe('Gen 1, 2');
  });

  it('uses the constraint row (no implicit prepend) when a generation constraint is present', () => {
    const q = question([
      { kind: 'generation', generation: 1 },
      { kind: 'type', pokemonType: 'fire' },
    ]);
    expect(labels('Charizard', q, [1])).toEqual(['Gen 1', 'Fire type']);
  });

  it('emits one feedback row per constraint, in question order, with the banner labels', () => {
    // Two constraints + implicit gen -> three rows, indexed exactly as displayRows renders them.
    const q = question([
      { kind: 'type', pokemonType: 'psychic' },
      { kind: 'legendary', value: true },
    ]);
    expect(labels('Mewtwo', q, [1])).toEqual(['Gen 1', 'Psychic type', 'Legendary']);
  });
});
