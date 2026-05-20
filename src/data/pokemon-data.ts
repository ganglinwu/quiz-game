import { PokemonItem } from '../types';
import gen1 from './pokemon-gen1.json';
import gen2 from './pokemon-gen2.json';
import gen3 from './pokemon-gen3.json';

export const POKEMON_BY_GEN: Record<number, PokemonItem[]> = {
  1: gen1,
  2: gen2,
  3: gen3,
};

export const ALL_GENS = [1, 2, 3];

export function getPokemonForGens(gens: number[]): PokemonItem[] {
  return gens.flatMap((g) => POKEMON_BY_GEN[g] ?? []);
}

export function getAllPokemon(): PokemonItem[] {
  return getPokemonForGens(ALL_GENS);
}

let genLookup: Map<string, number> | null = null;

function buildGenLookup(): Map<string, number> {
  if (genLookup) return genLookup;
  genLookup = new Map();
  for (const gen of ALL_GENS) {
    for (const p of POKEMON_BY_GEN[gen]) {
      genLookup.set(p.name.toLowerCase().replace(/[^a-z]/g, ''), gen);
    }
  }
  return genLookup;
}

export function getGenForPokemon(name: string): number | null {
  const lookup = buildGenLookup();
  return lookup.get(name.toLowerCase().replace(/[^a-z]/g, '')) ?? null;
}
