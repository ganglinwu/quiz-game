import * as SQLite from 'expo-sqlite';
import { PokemonItem, FruitItem } from '../types';

let db: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('quiz.db');
  }
  return db;
}

export const ALL_GENS = [1, 2, 3];

export function getPokemonForGens(gens: number[]): PokemonItem[] {
  if (gens.length === 0) return [];
  const placeholders = gens.map(() => '?').join(',');
  return getDb().getAllSync<PokemonItem>(
    `SELECT name, id as pokedexNumber FROM pokemon WHERE generation IN (${placeholders}) ORDER BY id`,
    gens
  );
}

export function getAllPokemon(): PokemonItem[] {
  return getDb().getAllSync<PokemonItem>(
    'SELECT name, id as pokedexNumber FROM pokemon ORDER BY id'
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
}

export interface PokemonDetailItem extends PokemonItem {
  type1: string;
  type2: string | null;
  generation: number;
  isLegendary: number;
  isMythical: number;
  height: number;
  weight: number;
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

  if (query.evolutionStage === 'base') {
    conditions.push('evolves_from_id IS NULL');
  } else if (query.evolutionStage === 'middle') {
    conditions.push('evolves_from_id IS NOT NULL');
    conditions.push('id IN (SELECT DISTINCT evolves_from_id FROM pokemon WHERE evolves_from_id IS NOT NULL)');
  } else if (query.evolutionStage === 'final') {
    conditions.push('evolves_from_id IS NOT NULL');
    conditions.push('id NOT IN (SELECT DISTINCT evolves_from_id FROM pokemon WHERE evolves_from_id IS NOT NULL)');
  }

  if (query.isDualType === true) {
    conditions.push('type2 IS NOT NULL');
  } else if (query.isDualType === false) {
    conditions.push('type2 IS NULL');
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return getDb().getAllSync<PokemonDetailItem>(
    `SELECT id as pokedexNumber, name, type1, type2, generation,
     is_legendary as isLegendary, is_mythical as isMythical,
     height, weight FROM pokemon ${where} ORDER BY id`,
    params
  );
}
