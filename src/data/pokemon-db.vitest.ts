import { describe, it, expect } from 'vitest';
import { getEvolutionChain, getGenForPokemon, queryPokemon } from './pokemon-db';

// These tests lock in the fix for the user's #1 reported bug: in a single-
// generation context, an evolution chain (and the base/middle/final classification
// derived from it) must be relative to the active generations, not the full
// real-world chain. The canonical example is Pichu (Gen 2) → Pikachu (Gen 1) →
// Raichu (Gen 1): in a Gen-1-only game the chain is just Pikachu → Raichu, and
// Pikachu is a *base* Pokemon there even though Pichu evolves into it in later gens.
//
// They run against the genuine bundled assets/quiz.db (via the better-sqlite3 shim
// aliased in vitest.config.ts), so they also guard the data itself.

const names = (rows: { name: string }[]) => rows.map((r) => r.name);

describe('getEvolutionChain — generation scoping (the #1 reported bug)', () => {
  it('returns the full real-world chain when no generations are passed', () => {
    expect(names(getEvolutionChain(25))).toEqual(['Pichu', 'Pikachu', 'Raichu']);
  });

  it('drops the Gen-2 baby (Pichu) in a Gen-1 context, re-rooting to Pikachu → Raichu', () => {
    expect(names(getEvolutionChain(25, [1]))).toEqual(['Pikachu', 'Raichu']);
  });

  it('keeps the full chain once Gen 2 is also active', () => {
    expect(names(getEvolutionChain(25, [1, 2]))).toEqual([
      'Pichu',
      'Pikachu',
      'Raichu',
    ]);
  });

  it('re-roots a branchy chain when later-gen members are filtered out (Eevee in Gen 1)', () => {
    const chain = names(getEvolutionChain(133, [1]));
    expect(chain[0]).toBe('Eevee');
    expect(chain).toContain('Vaporeon'); // Gen 1 eeveelution stays
    expect(chain).not.toContain('Espeon'); // Gen 2 eeveelution dropped
    expect(chain).not.toContain('Sylveon'); // Gen 6 eeveelution dropped
  });
});

describe('getEvolutionChain — Gen 7-9 cross-generation lineages', () => {
  // The Gen 7-9 expansion (721 → 1025 Pokémon) added many evolutions that link
  // back to much-earlier-gen pre-evolutions via evolves_from_id. These guard that
  // (a) the Pokédex full chain traces the whole real-world lineage across the new
  // data, and (b) gen-scoping still produces a contiguous, correctly re-rooted
  // chain when the active member's pre-evolution sits in an inactive generation —
  // the user's two stated requirements, exercised against the modern cross-gen data.

  it('Pokédex full chain spans Gen 1 → 2 → 8 for Scyther → Scizor → Kleavor', () => {
    expect(names(getEvolutionChain(123))).toEqual(['Scyther', 'Scizor', 'Kleavor']);
  });

  it('Pokédex full chain spans Gen 1 → 9 for Mankey → Primeape → Annihilape', () => {
    expect(names(getEvolutionChain(56))).toEqual(['Mankey', 'Primeape', 'Annihilape']);
  });

  it('Pokédex full chain spans Gen 2 → 9 for Girafarig → Farigiraf', () => {
    expect(names(getEvolutionChain(203))).toEqual(['Girafarig', 'Farigiraf']);
  });

  it('drops the Gen-8/9 evolutions in a Gen-1 context (Scyther alone, Mankey → Primeape)', () => {
    expect(names(getEvolutionChain(123, [1]))).toEqual(['Scyther']);
    expect(names(getEvolutionChain(56, [1]))).toEqual(['Mankey', 'Primeape']);
  });

  it('re-roots a Gen-9 evolution to stand alone when its earlier-gen pre-evo is inactive', () => {
    // Annihilape (Gen 9) evolves from Primeape (Gen 1); in a Gen-9-only context the
    // chain re-roots to just Annihilape rather than orphaning it / returning nothing.
    expect(names(getEvolutionChain(56, [9]))).toEqual(['Annihilape']);
    expect(names(getEvolutionChain(203, [9]))).toEqual(['Farigiraf']);
    // Kingambit (Gen 9) re-roots even though BOTH Pawniard and Bisharp (Gen 5) are inactive.
    expect(names(getEvolutionChain(625, [9]))).toEqual(['Kingambit']);
  });

  it('re-roots a surviving multi-member sub-chain when only the base is inactive', () => {
    // Scyther chain scoped to {2,8} drops the Gen-1 base (Scyther); Scizor's parent
    // is now absent so it re-roots, and Kleavor stays its child: Scizor → Kleavor.
    // This exercises the BFS re-root branch on Gen 7-9 data (≥2 surviving members),
    // not just the single-member early return.
    expect(names(getEvolutionChain(123, [2, 8]))).toEqual(['Scizor', 'Kleavor']);
  });

  it('keeps only the contiguous in-gen prefix when a middle member is inactive', () => {
    // Kleavor (Gen 8) is excluded from {1,2,9}, so the chain truncates at Scyther → Scizor.
    expect(names(getEvolutionChain(123, [1, 2, 9]))).toEqual(['Scyther', 'Scizor']);
    // The full Mankey line is contiguous across {1,2,9} (no inactive gap), so all three show.
    expect(names(getEvolutionChain(56, [1, 2, 9]))).toEqual(['Mankey', 'Primeape', 'Annihilape']);
  });
});

describe('queryPokemon — generation-relative evolution stage', () => {
  const gen1Stage = (stage: 'base' | 'middle' | 'final') =>
    names(queryPokemon({ generations: [1], evolutionStage: stage }));

  it('classes Pikachu as BASE in a Gen-1-only quiz (its pre-evo Pichu is Gen 2)', () => {
    expect(gen1Stage('base')).toContain('Pikachu');
    expect(gen1Stage('middle')).not.toContain('Pikachu');
    expect(gen1Stage('final')).not.toContain('Pikachu');
  });

  it('classes Raichu as FINAL in Gen 1', () => {
    expect(gen1Stage('final')).toContain('Raichu');
    expect(gen1Stage('base')).not.toContain('Raichu');
  });

  it('classes Pikachu as MIDDLE across all generations (Pichu → Pikachu → Raichu)', () => {
    const middleAll = names(queryPokemon({ evolutionStage: 'middle' }));
    expect(middleAll).toContain('Pikachu');

    const baseAll = names(queryPokemon({ evolutionStage: 'base' }));
    expect(baseAll).not.toContain('Pikachu');
    expect(baseAll).toContain('Pichu');
  });
});

describe('getGenForPokemon — digit-bearing names keep their own generation', () => {
  // The name→generation lookup keys on the digit-preserving normalized name.
  // Stripping digits collided Porygon (Gen 1) and Porygon2 (Gen 2) onto the same
  // "porygon" key, so whichever row was inserted last silently overwrote the
  // other's generation — getGenForPokemon('Porygon') used to return 2.
  it('reports Porygon as Gen 1 and Porygon2 as Gen 2 (no key collision)', () => {
    expect(getGenForPokemon('Porygon')).toBe(1);
    expect(getGenForPokemon('Porygon2')).toBe(2);
  });

  it('still resolves a plain name and is punctuation/case insensitive', () => {
    expect(getGenForPokemon('pikachu')).toBe(1);
    expect(getGenForPokemon("Farfetch'd")).toBe(1);
  });
});

describe('queryPokemon — hasAnyOfTypes (the query engine OR capability, used by quiz mode)', () => {
  // `hasAnyOfTypes` is a UNION over the listed types. The Pokédex type filter no
  // longer uses it (it uses `types`, an intersection — see the block below); the
  // remaining consumer is quiz mode's "strong against" constraint, which needs OR.
  it('matches a type on either slot (type1 OR type2): Gen-1 Fire is exactly the 12 fire Pokémon', () => {
    const gen1Fire = names(queryPokemon({ generations: [1], hasAnyOfTypes: ['fire'] }));
    expect(gen1Fire).toEqual([
      'Charmander', 'Charmeleon', 'Charizard', 'Vulpix', 'Ninetales',
      'Growlithe', 'Arcanine', 'Ponyta', 'Rapidash', 'Magmar', 'Flareon', 'Moltres',
    ]);
  });

  it('includes a Pokémon via its secondary type (Charizard is fire/flying, so it appears under Flying)', () => {
    const gen1Flying = names(queryPokemon({ generations: [1], hasAnyOfTypes: ['flying'] }));
    expect(gen1Flying).toContain('Charizard');
  });

  it('treats multiple types as a union (OR): Gen-1 Fire-or-Water = 44', () => {
    const gen1FireWater = queryPokemon({ generations: [1], hasAnyOfTypes: ['fire', 'water'] });
    expect(gen1FireWater).toHaveLength(44);
  });

  it('applies across all generations when no gen is selected (All Fire = 81 across Gen 1-9)', () => {
    const allFire = queryPokemon({ hasAnyOfTypes: ['fire'] });
    expect(allFire).toHaveLength(81);
  });

  it('intersects the type filter with the gen filter (Gen-1 Dragon = the Dratini line)', () => {
    const gen1Dragon = names(queryPokemon({ generations: [1], hasAnyOfTypes: ['dragon'] }));
    expect(gen1Dragon).toEqual(['Dratini', 'Dragonair', 'Dragonite']);
  });
});

describe('queryPokemon — types (the Pokédex type filter, an INTERSECTION/AND)', () => {
  // The Pokédex funnel selects `types`, where each selected type is a separate
  // AND condition: a Pokémon must carry EVERY selected type (in either slot).
  // This locks in the union→intersection fix the objective asked for.
  it('a single type behaves like OR-on-slots: Gen-1 Fire is still the 12 fire Pokémon', () => {
    const gen1Fire = names(queryPokemon({ generations: [1], types: ['fire'] }));
    expect(gen1Fire).toHaveLength(12);
    expect(gen1Fire).toContain('Charizard'); // fire/flying, matched via type1
  });

  it('two types intersect: Gen-1 Fire AND Flying = only the dual-typed Charizard & Moltres', () => {
    const gen1FireFlying = names(queryPokemon({ generations: [1], types: ['fire', 'flying'] }));
    expect(gen1FireFlying).toEqual(['Charizard', 'Moltres']);
  });

  it('intersection is far narrower than union for the same pair (2 vs 29 in Gen 1)', () => {
    const intersection = queryPokemon({ generations: [1], types: ['fire', 'flying'] });
    const union = queryPokemon({ generations: [1], hasAnyOfTypes: ['fire', 'flying'] });
    expect(intersection).toHaveLength(2);
    expect(union).toHaveLength(29);
  });

  it('3+ types can never match (a Pokémon has at most 2 types): Fire AND Water AND Flying = empty', () => {
    const impossible = queryPokemon({ types: ['fire', 'water', 'flying'] });
    expect(impossible).toHaveLength(0);
  });

  it('spans generations when no gen is selected: Water AND Flying returns the cross-gen dual-types', () => {
    const waterFlying = names(queryPokemon({ types: ['water', 'flying'] }));
    expect(waterFlying).toEqual(
      expect.arrayContaining(['Gyarados', 'Wingull', 'Pelipper', 'Swanna']),
    );
  });
});
