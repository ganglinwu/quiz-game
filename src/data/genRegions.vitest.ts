import { describe, it, expect } from 'vitest';
import { GEN_REGIONS } from './genRegions';
import { ALL_GENS } from './pokemon-db';

// Regression guard for the gen-expansion-completeness bug class. The Gen 7-9
// expansion grew ALL_GENS to [1..9] but the (then-inline) GEN_REGIONS map was
// still 1-6 only, so PokemonCardModal silently dropped the "Gen X (Region)"
// subtitle for all 304 Gen 7/8/9 Pokémon (the render gate fails closed on a
// missing key). These tests fail loudly if a future generation is added to
// ALL_GENS without a matching region entry — exactly the gap that shipped before.
describe('GEN_REGIONS — gen-expansion completeness', () => {
  it('has a complete, non-empty entry for every generation in ALL_GENS', () => {
    for (const gen of ALL_GENS) {
      const entry = GEN_REGIONS[gen];
      expect(entry, `missing GEN_REGIONS entry for Gen ${gen}`).toBeDefined();
      expect(entry.numeral.length, `empty numeral for Gen ${gen}`).toBeGreaterThan(0);
      expect(entry.region.length, `empty region for Gen ${gen}`).toBeGreaterThan(0);
    }
  });

  it('does not define regions for generations outside ALL_GENS (kept in sync)', () => {
    const known = new Set(ALL_GENS);
    for (const key of Object.keys(GEN_REGIONS)) {
      expect(known.has(Number(key)), `stray GEN_REGIONS entry for Gen ${key}`).toBe(true);
    }
  });

  it('maps each generation to its canonical region (incl. the Gen 7-9 fix)', () => {
    expect(GEN_REGIONS[1].region).toBe('Kanto');
    expect(GEN_REGIONS[6].region).toBe('Kalos');
    // The three that were missing before the iter-5 fix:
    expect(GEN_REGIONS[7]).toEqual({ numeral: 'VII', region: 'Alola' });
    expect(GEN_REGIONS[8]).toEqual({ numeral: 'VIII', region: 'Galar' });
    expect(GEN_REGIONS[9]).toEqual({ numeral: 'IX', region: 'Paldea' });
  });
});
