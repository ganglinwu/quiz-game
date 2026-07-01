import { describe, it, expect } from 'vitest';
import { getAllPokemon, getPokemonForGens, queryPokemon } from '../data/pokemon-db';
import { PokemonItem, StatName } from '../types';

// Seam test for the PokedexScreen filter — the headline of the objective ("the
// filter needs more work.. right now its doing a union but it should really be
// an intersection"). The union→intersection fix lives at the SCREEN level: the
// Pokédex `pokemon` useMemo decides which query to route through and, when a type
// filter is active, passes queryPokemon's `types` option (an AND per type) rather
// than `hasAnyOfTypes` (a single OR). The query-engine tests in pokemon-db.vitest.ts
// prove `types` intersects, but they would ALL still pass if PokedexScreen reverted
// to `hasAnyOfTypes` — this file guards the screen's wiring itself.
//
// Like answerPipeline.vitest.ts (which mirrors GameScreen.processInput rather than
// rendering the RN component), this mirrors the ~15-line `pokemon` useMemo of
// PokedexScreen.tsx against the genuine bundled assets/quiz.db. Keep it in sync with
// that useMemo; a divergence here means the screen's filter wiring changed.

interface FilterState {
  selectedGen: number | null;
  selectedStat: StatName | null;
  selectedTypes: string[];
  search: string;
}

// Verbatim mirror of PokedexScreen's `pokemon` useMemo (src/screens/PokedexScreen.tsx).
function pokedexFilter(s: FilterState): PokemonItem[] {
  let list: PokemonItem[] =
    s.selectedStat || s.selectedTypes.length > 0
      ? queryPokemon({
          generations: s.selectedGen ? [s.selectedGen] : undefined,
          types: s.selectedTypes.length > 0 ? s.selectedTypes : undefined,
          statRank: s.selectedStat ? { stat: s.selectedStat, topN: 20 } : undefined,
        })
      : s.selectedGen
        ? getPokemonForGens([s.selectedGen])
        : getAllPokemon();
  if (s.search.trim()) {
    const query = s.search.trim().toLowerCase();
    list = list.filter((p) => p.name.toLowerCase().includes(query));
  }
  return list;
}

const base: FilterState = {
  selectedGen: null,
  selectedStat: null,
  selectedTypes: [],
  search: '',
};
const names = (rows: PokemonItem[]) => rows.map((r) => r.name);

describe('PokedexScreen filter — query routing', () => {
  it('no filters → the full national dex (getAllPokemon, all 1025)', () => {
    expect(pokedexFilter(base)).toHaveLength(1025);
  });

  it('gen only → the light getPokemonForGens path (Gen 1 = 151), NOT queryPokemon', () => {
    expect(pokedexFilter({ ...base, selectedGen: 1 })).toHaveLength(151);
  });

  it('a type filter routes through queryPokemon even with no gen/stat selected', () => {
    // "All + Fire" spans every generation (81), proving the type branch is taken
    // rather than falling through to getAllPokemon.
    expect(pokedexFilter({ ...base, selectedTypes: ['fire'] })).toHaveLength(81);
  });

  it('a stat filter routes through queryPokemon (Top-20 by that stat)', () => {
    expect(pokedexFilter({ ...base, selectedStat: 'attack' })).toHaveLength(20);
  });
});

describe('PokedexScreen filter — the union→intersection fix, guarded at the screen', () => {
  it('two types INTERSECT: Gen-1 Fire + Flying = only Charizard & Moltres, not the 29-strong union', () => {
    const both = names(pokedexFilter({ ...base, selectedGen: 1, selectedTypes: ['fire', 'flying'] }));
    expect(both).toEqual(['Charizard', 'Moltres']);
  });

  it('the screen would return the 29-item union if it wrongly used hasAnyOfTypes — proving the two differ', () => {
    // If PokedexScreen ever reverts to `hasAnyOfTypes`, its result would match this
    // union set (29) instead of the intersection (2) asserted above. This makes the
    // regression the objective fixed concrete and screen-level, not just engine-level.
    const asUnion = queryPokemon({ generations: [1], hasAnyOfTypes: ['fire', 'flying'] });
    const asScreen = pokedexFilter({ ...base, selectedGen: 1, selectedTypes: ['fire', 'flying'] });
    expect(asUnion).toHaveLength(29);
    expect(asScreen).toHaveLength(2);
  });

  it('3+ types can never match (a Pokémon has ≤2 types) — the ListEmptyComponent case', () => {
    expect(pokedexFilter({ ...base, selectedTypes: ['fire', 'water', 'flying'] })).toHaveLength(0);
  });
});

describe('PokedexScreen filter — gen + stat + type combine as one AND', () => {
  it('all three intersect: Gen-1 ∩ Fire ∩ Top-20 Attack = Flareon & Arcanine', () => {
    const combo = names(
      pokedexFilter({ ...base, selectedGen: 1, selectedStat: 'attack', selectedTypes: ['fire'] }),
    );
    expect(combo).toEqual(['Flareon', 'Arcanine']);
  });

  it('statRank scopes its Top-20 to the selected gen (Gen-1 Attack leader is Dragonite, not all-gen Kartana)', () => {
    const gen1 = pokedexFilter({ ...base, selectedGen: 1, selectedStat: 'attack' });
    expect(gen1).toHaveLength(20);
    expect(gen1[0].name).toBe('Dragonite');

    const allGen = pokedexFilter({ ...base, selectedStat: 'attack' });
    expect(allGen[0].name).toBe('Kartana');
  });
});

describe('PokedexScreen filter — client-side search layered on the query result', () => {
  it('search alone substring-matches across the whole dex ("chu" → the four -chu names)', () => {
    expect(names(pokedexFilter({ ...base, search: 'chu' }))).toEqual([
      'Pikachu',
      'Raichu',
      'Pichu',
      'Smoochum',
    ]);
  });

  it('search narrows a type-filtered query result ("char" within Gen-1 Fire = the Charmander line)', () => {
    expect(
      names(pokedexFilter({ ...base, selectedGen: 1, selectedTypes: ['fire'], search: 'char' })),
    ).toEqual(['Charmander', 'Charmeleon', 'Charizard']);
  });

  it('trims and lowercases the query, and a no-hit search yields the empty list', () => {
    expect(pokedexFilter({ ...base, search: '   ' })).toHaveLength(1025); // whitespace-only = no filter
    expect(pokedexFilter({ ...base, search: '  PIKA ' })).toHaveLength(1); // trimmed + case-insensitive
    expect(pokedexFilter({ ...base, search: 'zzzznope' })).toHaveLength(0);
  });
});
