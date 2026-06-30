// Display metadata for each Pokémon generation: Roman numeral + home region.
// Kept as a pure module (no react-native imports) so it can be unit-tested for
// completeness against ALL_GENS. A 1–6-bounded version of this exact map once
// lived inline in PokemonCardModal and silently dropped the "Gen X (Region)"
// subtitle for all 304 Gen 7–9 Pokémon when generations were expanded, because
// the render gate (GEN_REGIONS[generation] && …) fails closed on a missing key.
// The genRegions.vitest.ts regression now asserts every active generation has an
// entry, so the next generation expansion can't reintroduce that gap unnoticed.
export interface GenRegion {
  numeral: string;
  region: string;
}

export const GEN_REGIONS: Record<number, GenRegion> = {
  1: { numeral: 'I', region: 'Kanto' },
  2: { numeral: 'II', region: 'Johto' },
  3: { numeral: 'III', region: 'Hoenn' },
  4: { numeral: 'IV', region: 'Sinnoh' },
  5: { numeral: 'V', region: 'Unova' },
  6: { numeral: 'VI', region: 'Kalos' },
  7: { numeral: 'VII', region: 'Alola' },
  8: { numeral: 'VIII', region: 'Galar' },
  9: { numeral: 'IX', region: 'Paldea' },
};
