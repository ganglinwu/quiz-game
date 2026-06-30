import { describe, it, expect } from 'vitest';
import { getEvolutionChain, queryPokemon } from './pokemon-db';

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

describe('queryPokemon — type filter (the Pokédex type-filter feature)', () => {
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

  it('treats multiple selected types as a union (OR): Gen-1 Fire-or-Water = 44', () => {
    const gen1FireWater = queryPokemon({ generations: [1], hasAnyOfTypes: ['fire', 'water'] });
    expect(gen1FireWater).toHaveLength(44);
  });

  it('applies the type filter across all generations when no gen is selected (All Fire = 81 across Gen 1-9)', () => {
    const allFire = queryPokemon({ hasAnyOfTypes: ['fire'] });
    expect(allFire).toHaveLength(81);
  });

  it('intersects the type filter with the gen filter (Gen-1 Dragon = the Dratini line)', () => {
    const gen1Dragon = names(queryPokemon({ generations: [1], hasAnyOfTypes: ['dragon'] }));
    expect(gen1Dragon).toEqual(['Dratini', 'Dragonair', 'Dragonite']);
  });
});
