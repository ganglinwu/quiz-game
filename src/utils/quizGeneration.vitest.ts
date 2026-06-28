import { describe, it, expect } from 'vitest';
import {
  getTypesStrongAgainst,
  areCompatible,
  buildConstraintPool,
  constraintsToQuery,
  generateQuestion,
} from './quizQuestionGenerator';
import { queryPokemon } from '../data/pokemon-db';
import type { QuizConstraint, QuizFilter } from '../types';

// These tests lock in the quiz question-GENERATION orchestration — the core that
// turns a pre-game filter into a concrete, answerable per-turn question. Prior
// suites covered the baseline-filter mapping (quizQuestionGenerator.vitest.ts) and
// the answer-GRADING gate (quizAnswerValidation.vitest.ts); this one pins the
// previously-untested middle layer:
//
//   • getTypesStrongAgainst — the type-effectiveness inverse used by "Strong against X".
//   • areCompatible         — the gate that blocks nonsensical/impossible combos.
//   • buildConstraintPool   — which filters become per-question constraints vs. which
//                             are dropped to be applied as a global baseline. This is
//                             where QUIZ_MODE_BUGS.md's documented gated behaviors live
//                             (single-stage dropped, multi-stage kept as a pool-biaser,
//                             Mono/Dual dropped, and Bug 5: superEffective ignores the
//                             type filter). Pinning them means a future change to any of
//                             those boundaries is surfaced explicitly.
//   • generateQuestion      — end-to-end invariants + the difficulty auto-degrade.
//
// areCompatible/buildConstraintPool/getTypesStrongAgainst are pure & deterministic, so
// they get exact assertions. generateQuestion samples randomly, so it is checked via
// invariants that must hold for ANY output (no flakiness) plus one structurally-forced
// auto-degrade scenario with a deterministic outcome.

// ---------------------------------------------------------------------------
// getTypesStrongAgainst — inverse of the TYPE_EFFECTIVENESS table
// ---------------------------------------------------------------------------
describe('getTypesStrongAgainst', () => {
  it('returns the attacking types super-effective against a target', () => {
    // water/ground/rock all list fire as a target.
    expect(getTypesStrongAgainst('fire').sort()).toEqual(['ground', 'rock', 'water']);
    // only fighting is strong against normal.
    expect(getTypesStrongAgainst('normal')).toEqual(['fighting']);
    // grass is countered by fire/ice/poison/flying/bug.
    expect(getTypesStrongAgainst('grass').sort()).toEqual(
      ['bug', 'fire', 'flying', 'ice', 'poison'].sort(),
    );
  });

  it('is case-insensitive on the target type', () => {
    expect(getTypesStrongAgainst('FIRE').sort()).toEqual(getTypesStrongAgainst('fire').sort());
  });
});

// ---------------------------------------------------------------------------
// areCompatible — the constraint-combination gate
// ---------------------------------------------------------------------------
describe('areCompatible', () => {
  const type = (t: string): QuizConstraint => ({ kind: 'type', pokemonType: t });
  const se = (t: string): QuizConstraint => ({ kind: 'superEffective', targetType: t });
  const stat: QuizConstraint = { kind: 'statRank', stat: 'attack', topN: 20 };
  const stage: QuizConstraint = { kind: 'evolutionStage', stage: 'final' };
  const legendary: QuizConstraint = { kind: 'legendary', value: true };
  const mono: QuizConstraint = { kind: 'dualType', value: false };
  const dual: QuizConstraint = { kind: 'dualType', value: true };

  it('accepts an empty / single constraint', () => {
    expect(areCompatible([])).toBe(true);
    expect(areCompatible([type('fire')])).toBe(true);
    expect(areCompatible([se('grass')])).toBe(true);
  });

  it('rejects duplicate non-type kinds', () => {
    expect(areCompatible([stat, { kind: 'statRank', stat: 'speed', topN: 20 }])).toBe(false);
    expect(areCompatible([stage, { kind: 'evolutionStage', stage: 'base' }])).toBe(false);
  });

  it('allows two DIFFERENT types but rejects identical or >2 types', () => {
    expect(areCompatible([type('fire'), type('flying')])).toBe(true);
    expect(areCompatible([type('fire'), type('fire')])).toBe(false);
    expect(areCompatible([type('fire'), type('flying'), type('water')])).toBe(false);
  });

  it('rejects two types when Mono is required, allows them when Dual is required', () => {
    expect(areCompatible([type('fire'), type('flying'), mono])).toBe(false);
    expect(areCompatible([type('fire'), type('flying'), dual])).toBe(true);
  });

  it('rejects superEffective combined with a type or with statRank', () => {
    expect(areCompatible([se('grass'), type('fire')])).toBe(false);
    expect(areCompatible([se('grass'), stat])).toBe(false);
  });

  it('allows superEffective alongside non-type, non-statRank constraints', () => {
    expect(areCompatible([se('grass'), stage])).toBe(true);
    expect(areCompatible([se('grass'), legendary])).toBe(true);
  });

  it('allows a realistic hard combo (type + statRank + dualType)', () => {
    expect(areCompatible([type('fire'), stat, dual])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildConstraintPool — filter -> per-question constraint pool
// (the gated-behavior boundary documented in QUIZ_MODE_BUGS.md)
// ---------------------------------------------------------------------------
describe('buildConstraintPool', () => {
  const base: QuizFilter = { includeLegendary: false, includeMythical: false };
  const kindsOf = (pool: QuizConstraint[], kind: QuizConstraint['kind']) =>
    pool.filter((c) => c.kind === kind);

  it('adds generation constraints only when more than one gen is active', () => {
    expect(kindsOf(buildConstraintPool(base, [1]), 'generation')).toHaveLength(0);
    const multi = kindsOf(buildConstraintPool(base, [1, 2]), 'generation').map(
      (c) => (c as Extract<QuizConstraint, { kind: 'generation' }>).generation,
    );
    expect(multi.sort()).toEqual([1, 2]);
  });

  it('uses all 18 types when no type filter is set, else exactly the chosen types', () => {
    expect(kindsOf(buildConstraintPool(base, [1]), 'type')).toHaveLength(18);
    const chosen = kindsOf(buildConstraintPool({ ...base, types: ['fire', 'water'] }, [1]), 'type')
      .map((c) => (c as Extract<QuizConstraint, { kind: 'type' }>).pokemonType)
      .sort();
    expect(chosen).toEqual(['fire', 'water']);
  });

  it('adds legendary/mythical constraints only when those are INCLUDED', () => {
    const off = buildConstraintPool({ includeLegendary: false, includeMythical: false }, [1]);
    expect(kindsOf(off, 'legendary')).toHaveLength(0);
    expect(kindsOf(off, 'mythical')).toHaveLength(0);
    const on = buildConstraintPool({ includeLegendary: true, includeMythical: true }, [1]);
    expect(kindsOf(on, 'legendary')).toHaveLength(1);
    expect(kindsOf(on, 'mythical')).toHaveLength(1);
  });

  it('keeps evolution-stage constraints ONLY for a multi-stage selection (the gated Bug 3 boundary)', () => {
    // No selection -> default all-3 stages -> all 3 appear (pool variety).
    expect(kindsOf(buildConstraintPool(base, [1]), 'evolutionStage')).toHaveLength(3);
    // Single-stage -> dropped from the pool (applied as a baseline filter instead).
    expect(
      kindsOf(buildConstraintPool({ ...base, evolutionStages: ['final'] }, [1]), 'evolutionStage'),
    ).toHaveLength(0);
    // Multi-stage -> kept in the pool as a biaser (NOT yet a hard baseline restriction).
    const multi = kindsOf(
      buildConstraintPool({ ...base, evolutionStages: ['base', 'middle'] }, [1]),
      'evolutionStage',
    ).map((c) => (c as Extract<QuizConstraint, { kind: 'evolutionStage' }>).stage);
    expect(multi.sort()).toEqual(['base', 'middle']);
  });

  it('keeps dualType constraints only when Type Pairing is "Any" (the gated Bug 1 boundary)', () => {
    expect(kindsOf(buildConstraintPool(base, [1]), 'dualType')).toHaveLength(2);
    expect(
      kindsOf(buildConstraintPool({ ...base, allowDualType: false }, [1]), 'dualType'),
    ).toHaveLength(0);
    expect(
      kindsOf(buildConstraintPool({ ...base, allowDualType: true }, [1]), 'dualType'),
    ).toHaveLength(0);
  });

  it('always includes superEffective constraints, ignoring the type filter (Bug 5)', () => {
    // Even with types restricted to water, "Strong against X" targets for all types
    // remain in the pool — that's the documented Bug 5 design gap, pinned here.
    const pool = buildConstraintPool({ ...base, types: ['water'] }, [1]);
    const se = kindsOf(pool, 'superEffective').map(
      (c) => (c as Extract<QuizConstraint, { kind: 'superEffective' }>).targetType,
    );
    expect(se.length).toBeGreaterThan(1);
    expect(se).toContain('fire'); // water/ground/rock counter fire -> target stays in pool
  });

  it('uses the 6 default stats when none are chosen, else exactly the chosen stats', () => {
    expect(kindsOf(buildConstraintPool(base, [1]), 'statRank')).toHaveLength(6);
    const one = kindsOf(buildConstraintPool({ ...base, stats: ['speed'] }, [1]), 'statRank');
    expect(one).toHaveLength(1);
    expect((one[0] as Extract<QuizConstraint, { kind: 'statRank' }>).stat).toBe('speed');
  });
});

// ---------------------------------------------------------------------------
// generateQuestion — end-to-end invariants + auto-degrade
// ---------------------------------------------------------------------------
describe('generateQuestion', () => {
  const permissive: QuizFilter = { includeLegendary: true, includeMythical: true };

  // Invariants that must hold for ANY non-null output, so running with real
  // randomness over many iterations is robust rather than flaky.
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    it(`produces internally-valid ${difficulty} questions (Gen 1, permissive filter)`, () => {
      for (let i = 0; i < 40; i++) {
        const q = generateQuestion({ difficulty, filter: permissive, hardcore: false }, [1], []);
        expect(q).not.toBeNull();
        if (!q) continue;
        // Every returned constraint set is mutually compatible.
        expect(areCompatible(q.constraints)).toBe(true);
        // At most the requested number of constraints (may be fewer if auto-degraded).
        expect(q.constraints.length).toBeGreaterThanOrEqual(1);
        expect(q.constraints.length).toBeLessThanOrEqual(
          difficulty === 'hard' ? 3 : difficulty === 'medium' ? 2 : 1,
        );
        // validAnswerCount is real: it matches an actual non-empty DB query, so a
        // question is never presented with zero answerable Pokemon.
        expect(q.validAnswerCount).toBeGreaterThan(0);
        const actual = queryPokemon(constraintsToQuery({ generations: [1] }, q.constraints));
        expect(actual.length).toBe(q.validAnswerCount);
      }
    });
  }

  it('respects the type filter: any type-kind constraint comes from the allowed set', () => {
    for (let i = 0; i < 40; i++) {
      const q = generateQuestion(
        { difficulty: 'easy', filter: { ...permissive, types: ['fire', 'water'] }, hardcore: false },
        [1],
        [],
      );
      if (!q) continue;
      for (const c of q.constraints) {
        if (c.kind === 'type') expect(['fire', 'water']).toContain(c.pokemonType);
      }
    }
  });

  it('auto-degrades hard -> easy when the pool cannot form a 2+ constraint combo', () => {
    // Construct a filter whose pool is {one type constraint} + {superEffective targets}.
    // superEffective can't pair with a type or with another superEffective (areCompatible),
    // and there is no other non-type kind, so no compatible 2-set exists at all —
    // forcing the recursion hard -> medium -> easy with a deterministic 1-constraint result.
    const narrow: QuizFilter = {
      includeLegendary: false,
      includeMythical: false,
      types: ['fire'],
      stats: [], // no statRank constraints
      evolutionStages: ['final'], // single -> dropped from pool, applied as baseline
      allowDualType: false, // Mono -> dropped from pool, applied as baseline
    };
    const q = generateQuestion({ difficulty: 'hard', filter: narrow, hardcore: false }, [1], []);
    expect(q).not.toBeNull();
    expect(q!.constraints).toHaveLength(1);
    expect(q!.difficulty).toBe('easy');
    expect(q!.validAnswerCount).toBeGreaterThan(0);
  });

  it('excludes already-used Pokemon from the generated answer pool', () => {
    // A question always has at least one answerable Pokemon that is not in usedItems.
    for (let i = 0; i < 20; i++) {
      const used = ['Charizard', 'Pikachu', 'Bulbasaur'];
      const q = generateQuestion(
        { difficulty: 'easy', filter: permissive, hardcore: false },
        [1],
        used,
      );
      if (!q) continue;
      const pool = queryPokemon(
        constraintsToQuery({ generations: [1], excludeNames: used }, q.constraints),
      );
      expect(pool.length).toBe(q.validAnswerCount);
      for (const name of used) expect(pool.map((p) => p.name)).not.toContain(name);
    }
  });
});
