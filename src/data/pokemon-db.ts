import * as SQLite from 'expo-sqlite';
import { PokemonItem, FruitItem } from '../types';

let db: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('quiz.db');
  }
  return db;
}

export const ALL_GENS = [1, 2, 3, 4, 5, 6];

export function getPokemonForGens(gens: number[]): PokemonItem[] {
  if (gens.length === 0) return [];
  const placeholders = gens.map(() => '?').join(',');
  return getDb().getAllSync<PokemonItem>(
    `SELECT name, id as pokedexNumber, is_legendary as isLegendary, is_mythical as isMythical FROM pokemon WHERE generation IN (${placeholders}) ORDER BY id`,
    gens
  );
}

export function getAllPokemon(): PokemonItem[] {
  return getDb().getAllSync<PokemonItem>(
    'SELECT name, id as pokedexNumber, is_legendary as isLegendary, is_mythical as isMythical FROM pokemon ORDER BY id'
  );
}

let _genLookup: Map<string, number> | null = null;

function getGenLookup(): Map<string, number> {
  if (_genLookup) return _genLookup;
  _genLookup = new Map();
  const rows = getDb().getAllSync<{ name: string; generation: number }>(
    'SELECT name, generation FROM pokemon'
  );
  for (const row of rows) {
    _genLookup.set(row.name.toLowerCase().replace(/[^a-z]/g, ''), row.generation);
  }
  return _genLookup;
}

export function getGenForPokemon(name: string): number | null {
  return getGenLookup().get(name.toLowerCase().replace(/[^a-z]/g, '')) ?? null;
}

export function getPokemonCountByGen(gen: number): number {
  const row = getDb().getFirstSync<{ count: number }>(
    'SELECT COUNT(*) as count FROM pokemon WHERE generation = ?',
    [gen]
  );
  return row?.count ?? 0;
}

export function resolveAlias(input: string): string | null {
  const normalized = input.toLowerCase().trim();
  const row = getDb().getFirstSync<{ pokemon_name: string }>(
    'SELECT pokemon_name FROM aliases WHERE alias = ?',
    [normalized]
  );
  return row?.pokemon_name ?? null;
}

export function getAllAliases(): Record<string, string> {
  const rows = getDb().getAllSync<{ alias: string; pokemon_name: string }>(
    'SELECT alias, pokemon_name FROM aliases'
  );
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.alias] = row.pokemon_name;
  }
  return result;
}

export interface EvolutionChainMember {
  id: number;
  name: string;
}

export function getEvolutionChain(
  pokemonId: number,
  generations?: number[]
): EvolutionChainMember[] {
  const chainRow = getDb().getFirstSync<{ evolution_chain_id: number | null }>(
    'SELECT evolution_chain_id FROM pokemon WHERE id = ?',
    [pokemonId]
  );
  if (!chainRow?.evolution_chain_id) return [];
  let members = getDb().getAllSync<
    EvolutionChainMember & { evolves_from_id: number | null; generation: number }
  >(
    'SELECT id, name, evolves_from_id, generation FROM pokemon WHERE evolution_chain_id = ?',
    [chainRow.evolution_chain_id]
  );

  // Generation-scope the chain so a Gen-1 context shows Pikachu → Raichu rather
  // than Pichu → Pikachu → Raichu (Pichu is Gen 2). Members in inactive
  // generations are dropped; the BFS below re-roots any survivor whose parent
  // was dropped, keeping the visible chain contiguous. When no generations are
  // passed the full real-world chain is returned (unchanged behavior).
  if (generations && generations.length > 0) {
    const active = new Set(generations);
    members = members.filter((m) => active.has(m.generation));
  }

  if (members.length <= 1) return members;

  const ids = new Set(members.map((m) => m.id));
  const byParent = new Map<number | null, (typeof members)[number][]>();
  for (const m of members) {
    // Treat a member whose parent isn't in the (possibly filtered) set as a
    // root, so dropping an inactive base/intermediate doesn't orphan the rest.
    const key =
      m.evolves_from_id !== null && ids.has(m.evolves_from_id) ? m.evolves_from_id : null;
    const arr = byParent.get(key);
    if (arr) arr.push(m);
    else byParent.set(key, [m]);
  }

  const sorted: EvolutionChainMember[] = [];
  const queue = byParent.get(null) ?? [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push({ id: current.id, name: current.name });
    const children = byParent.get(current.id);
    if (children) queue.push(...children);
  }
  return sorted;
}

export interface PokemonMeta {
  generation: number;
  is_legendary: number;
  is_mythical: number;
}

export function getPokemonMeta(pokemonId: number): PokemonMeta | null {
  return getDb().getFirstSync<PokemonMeta>(
    'SELECT generation, is_legendary, is_mythical FROM pokemon WHERE id = ?',
    [pokemonId]
  );
}

export function getAllFruits(): FruitItem[] {
  return getDb().getAllSync<FruitItem>('SELECT name FROM fruits ORDER BY name');
}

export interface PokemonQuery {
  generations?: number[];
  types?: string[];
  isLegendary?: boolean;
  isMythical?: boolean;
  evolvesFromId?: number;
  excludeNames?: string[];
  evolutionStage?: 'base' | 'middle' | 'final';
  isDualType?: boolean;
  hasAnyOfTypes?: string[];
  statRank?: { stat: string; topN: number };
}

export interface PokemonDetailItem extends PokemonItem {
  type1: string;
  type2: string | null;
  generation: number;
  isLegendary: number;
  isMythical: number;
  height: number;
  weight: number;
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
}

export function queryPokemon(query: PokemonQuery): PokemonDetailItem[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (query.generations?.length) {
    conditions.push(`generation IN (${query.generations.map(() => '?').join(',')})`);
    params.push(...query.generations);
  }

  if (query.types?.length) {
    for (const type of query.types) {
      conditions.push('(LOWER(type1) = ? OR LOWER(type2) = ?)');
      params.push(type.toLowerCase(), type.toLowerCase());
    }
  }

  if (query.isLegendary !== undefined) {
    conditions.push('is_legendary = ?');
    params.push(query.isLegendary ? 1 : 0);
  }

  if (query.isMythical !== undefined) {
    conditions.push('is_mythical = ?');
    params.push(query.isMythical ? 1 : 0);
  }

  if (query.evolvesFromId !== undefined) {
    conditions.push('evolves_from_id = ?');
    params.push(query.evolvesFromId);
  }

  if (query.excludeNames?.length) {
    conditions.push(`name NOT IN (${query.excludeNames.map(() => '?').join(',')})`);
    params.push(...query.excludeNames);
  }

  if (query.evolutionStage) {
    // Evolution stage is relative to the active generation set. A Pokemon whose
    // pre-evolution lives in an inactive generation counts as "base" within the
    // active scope (e.g. Pikachu is base in a Gen-1-only quiz because Pichu is
    // Gen 2). Likewise a Pokemon whose evolution is inactive counts as "final"
    // (e.g. Golbat in Gen 1, since Crobat is Gen 2).
    const gens = query.generations;
    if (gens?.length) {
      const genIn = `generation IN (${gens.map(() => '?').join(',')})`;
      const hasParentInGens = `evolves_from_id IN (SELECT id FROM pokemon WHERE ${genIn})`;
      const isParentInGens = `id IN (SELECT evolves_from_id FROM pokemon WHERE evolves_from_id IS NOT NULL AND ${genIn})`;
      if (query.evolutionStage === 'base') {
        conditions.push(
          `(evolves_from_id IS NULL OR evolves_from_id NOT IN (SELECT id FROM pokemon WHERE ${genIn}))`
        );
        params.push(...gens);
      } else if (query.evolutionStage === 'middle') {
        conditions.push(hasParentInGens);
        params.push(...gens);
        conditions.push(isParentInGens);
        params.push(...gens);
      } else if (query.evolutionStage === 'final') {
        conditions.push(hasParentInGens);
        params.push(...gens);
        conditions.push(`NOT (${isParentInGens})`);
        params.push(...gens);
      }
    } else if (query.evolutionStage === 'base') {
      conditions.push('evolves_from_id IS NULL');
    } else if (query.evolutionStage === 'middle') {
      conditions.push('evolves_from_id IS NOT NULL');
      conditions.push('id IN (SELECT DISTINCT evolves_from_id FROM pokemon WHERE evolves_from_id IS NOT NULL)');
    } else if (query.evolutionStage === 'final') {
      conditions.push('evolves_from_id IS NOT NULL');
      conditions.push('id NOT IN (SELECT DISTINCT evolves_from_id FROM pokemon WHERE evolves_from_id IS NOT NULL)');
    }
  }

  if (query.isDualType === true) {
    conditions.push('type2 IS NOT NULL');
  } else if (query.isDualType === false) {
    conditions.push('type2 IS NULL');
  }

  if (query.hasAnyOfTypes?.length) {
    const placeholders = query.hasAnyOfTypes.map(() => '?').join(',');
    conditions.push(`(LOWER(type1) IN (${placeholders}) OR LOWER(type2) IN (${placeholders}))`);
    params.push(...query.hasAnyOfTypes.map(t => t.toLowerCase()));
    params.push(...query.hasAnyOfTypes.map(t => t.toLowerCase()));
  }

  if (query.statRank) {
    const validStats = ['hp', 'attack', 'defense', 'sp_attack', 'sp_defense', 'speed'];
    const { stat, topN } = query.statRank;
    if (!validStats.includes(stat)) throw new Error(`Invalid stat: ${stat}`);
    const genFilter = query.generations?.length
      ? `WHERE generation IN (${query.generations.map(() => '?').join(',')})`
      : '';
    conditions.push(`id IN (SELECT id FROM pokemon ${genFilter} ORDER BY ${stat} DESC LIMIT ?)`);
    if (query.generations?.length) params.push(...query.generations);
    params.push(topN);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderBy = query.statRank ? `${query.statRank.stat} DESC` : 'id';
  return getDb().getAllSync<PokemonDetailItem>(
    `SELECT id as pokedexNumber, name, type1, type2, generation,
     is_legendary as isLegendary, is_mythical as isMythical,
     height, weight,
     hp, attack, defense,
     sp_attack as spAttack, sp_defense as spDefense, speed
     FROM pokemon ${where} ORDER BY ${orderBy}`,
    params
  );
}
