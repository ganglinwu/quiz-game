import { describe, it, expect } from 'vitest';
import { queryPokemon } from '../data/pokemon-db';
import { buildBaselineQuery, constraintsToQuery } from './quizQuestionGenerator';
import type { QuizFilter } from '../types';

// These tests lock in the pre-game *filter* fixes that the bug report (QUIZ_MODE_BUGS.md)
// found and the run fixed, but which had only ever been verified by throwaway manual DB
// simulations:
//
//   • Bug 1  — "Type Pairing: Mono / Dual" was completely ignored. Now applied as a
//              baseline filter (buildBaselineQuery sets query.isDualType).
//   • Bug 3  — a single Evolution Stage selection ("fully evolved only") was a no-op.
//              Now applied as a *gen-relative* baseline filter (query.evolutionStage),
//              while a multi-stage selection is deliberately left as a pool-biaser only.
//   • The legendary / mythical baseline filters the two fixes above are modeled on are
//              guarded too, so a regression in any of the four reads the same way.
//
// They run buildBaselineQuery -> constraintsToQuery -> queryPokemon against the genuine
// bundled assets/quiz.db (via the better-sqlite3 shim aliased in vitest.config.ts), so a
// regression in either the generator logic OR the underlying query/data trips them. The
// concrete answer-pool expectations match the DB facts documented in QUIZ_MODE_BUGS.md.

const names = (rows: { name: string }[]) => rows.map((r) => r.name).sort();

// A "fire-type question in a Gen-1 quiz" answer pool, built exactly as generateQuestion
// would: the pre-game filter -> baseline, plus a per-question Fire type constraint.
const fireAnswerPool = (filter: QuizFilter) =>
  names(
    queryPokemon(
      constraintsToQuery(buildBaselineQuery(filter, [1], []), [
        { kind: 'type', pokemonType: 'fire' },
      ]),
    ),
  );

// Gen-1 Fire Pokemon, partitioned by the two dimensions the filters cut on, so the
// per-filter expectations below read against a single shared source of truth.
const ALL_GEN1_FIRE = [
  'Arcanine', 'Charizard', 'Charmander', 'Charmeleon', 'Flareon', 'Growlithe',
  'Magmar', 'Moltres', 'Ninetales', 'Ponyta', 'Rapidash', 'Vulpix',
];
const GEN1_FIRE_DUAL = ['Charizard', 'Moltres']; // both fire/flying

describe('buildBaselineQuery — Mono/Dual filter (Bug 1)', () => {
  const base: QuizFilter = { includeLegendary: true, includeMythical: true };

  it('maps allowDualType onto query.isDualType (Mono -> false, Dual -> true)', () => {
    expect(buildBaselineQuery({ ...base, allowDualType: false }, [1], []).isDualType).toBe(false);
    expect(buildBaselineQuery({ ...base, allowDualType: true }, [1], []).isDualType).toBe(true);
  });

  it('leaves isDualType unset when Type Pairing is "Any"', () => {
    expect(buildBaselineQuery(base, [1], []).isDualType).toBeUndefined();
  });

  it('Mono restricts the generated answer pool to mono-type Pokemon (excludes Charizard/Moltres)', () => {
    const mono = fireAnswerPool({ ...base, allowDualType: false });
    const expectedMono = ALL_GEN1_FIRE.filter((n) => !GEN1_FIRE_DUAL.includes(n));
    expect(mono).toEqual(expectedMono);
    expect(mono).toHaveLength(10);
    expect(mono).not.toContain('Charizard');
    expect(mono).not.toContain('Moltres');
  });

  it('Dual restricts the generated answer pool to dual-type Pokemon', () => {
    expect(fireAnswerPool({ ...base, allowDualType: true })).toEqual(GEN1_FIRE_DUAL);
  });

  it('"Any" leaves the full Fire pool (mono + dual) intact', () => {
    expect(fireAnswerPool(base)).toEqual([...ALL_GEN1_FIRE].sort());
  });
});

describe('buildBaselineQuery — single Evolution Stage filter (Bug 3)', () => {
  const base: QuizFilter = { includeLegendary: true, includeMythical: true };

  it('maps a single-stage selection onto query.evolutionStage', () => {
    expect(buildBaselineQuery({ ...base, evolutionStages: ['final'] }, [1], []).evolutionStage).toBe('final');
  });

  it('leaves evolutionStage unset for a multi-stage selection (kept a pool-biaser, still-open Bug 3 multi-stage)', () => {
    expect(
      buildBaselineQuery({ ...base, evolutionStages: ['base', 'middle'] }, [1], []).evolutionStage,
    ).toBeUndefined();
  });

  it('"Final only" restricts the pool to gen-relative final-stage Pokemon', () => {
    // Exactly the 5 final-stage Gen-1 Fire Pokemon. Magmar (evolves to Gen-4 Magmortar)
    // and Moltres (no evolution) are gen-relative *base* in Gen 1, so they are correctly
    // excluded from "final" — this is the iteration-1 gen-scoping flowing through the
    // Bug 3 baseline path.
    expect(fireAnswerPool({ ...base, evolutionStages: ['final'] })).toEqual([
      'Arcanine', 'Charizard', 'Flareon', 'Ninetales', 'Rapidash',
    ]);
  });

  it('"Final only" excludes base- and middle-stage Pokemon that an unfiltered pool keeps', () => {
    const finalPool = fireAnswerPool({ ...base, evolutionStages: ['final'] });
    for (const excluded of ['Charmander', 'Vulpix', 'Growlithe', 'Ponyta', 'Charmeleon', 'Magmar', 'Moltres']) {
      expect(finalPool).not.toContain(excluded);
    }
  });
});

describe('buildBaselineQuery — legendary / mythical filters (the model for Bugs 1 & 3)', () => {
  const psyAnswerPool = (filter: QuizFilter) =>
    names(
      queryPokemon(
        constraintsToQuery(buildBaselineQuery(filter, [1], []), [
          { kind: 'type', pokemonType: 'psychic' },
        ]),
      ),
    );

  it('maps the toggles onto isLegendary / isMythical only when excluding', () => {
    const off = buildBaselineQuery({ includeLegendary: false, includeMythical: false }, [1], []);
    expect(off.isLegendary).toBe(false);
    expect(off.isMythical).toBe(false);
    const on = buildBaselineQuery({ includeLegendary: true, includeMythical: true }, [1], []);
    expect(on.isLegendary).toBeUndefined();
    expect(on.isMythical).toBeUndefined();
  });

  it('excluding legendaries drops Mewtwo (legendary) but keeps Mew (mythical)', () => {
    const pool = psyAnswerPool({ includeLegendary: false, includeMythical: true });
    expect(pool).not.toContain('Mewtwo');
    expect(pool).toContain('Mew');
  });

  it('excluding both legendary and mythical drops Mewtwo and Mew', () => {
    const pool = psyAnswerPool({ includeLegendary: false, includeMythical: false });
    expect(pool).not.toContain('Mewtwo');
    expect(pool).not.toContain('Mew');
    expect(pool).toContain('Alakazam'); // ordinary psychic stays
  });
});
