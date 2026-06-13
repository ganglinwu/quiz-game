import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CACHE_PATH = path.join(__dirname, 'pokeapi-cache.json');
const DB_PATH = path.join(PROJECT_ROOT, 'assets', 'quiz.db');
const ALIASES_PATH = path.join(PROJECT_ROOT, 'src', 'data', 'aliases.ts');
const FRUITS_PATH = path.join(PROJECT_ROOT, 'src', 'data', 'fruits.json');

const TOTAL_POKEMON = 721;
const FETCH_DELAY_MS = 100;

const GEN_RANGES: [number, number, number][] = [
  [1, 1, 151],
  [2, 152, 251],
  [3, 252, 386],
  [4, 387, 493],
  [5, 494, 649],
  [6, 650, 721],
];

export interface CachedPokemon {
  name: string;
  types: string[];
  height: number;
  weight: number;
  is_legendary: boolean;
  is_mythical: boolean;
  evolution_chain_id: number | null;
  evolves_from_id: number | null;
  stats?: {
    hp: number;
    attack: number;
    defense: number;
    sp_atk: number;
    sp_def: number;
    speed: number;
  };
}

type Cache = Record<string, CachedPokemon>;

function getGeneration(pokedexNumber: number): number {
  for (const [gen, start, end] of GEN_RANGES) {
    if (pokedexNumber >= start && pokedexNumber <= end) return gen;
  }
  throw new Error(`Pokedex number ${pokedexNumber} out of range`);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPokemonData(id: number): Promise<CachedPokemon> {
  const pokemonRes = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
  if (!pokemonRes.ok) throw new Error(`Failed to fetch pokemon/${id}: ${pokemonRes.status}`);
  const pokemon = await pokemonRes.json();

  const speciesRes = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
  if (!speciesRes.ok) throw new Error(`Failed to fetch pokemon-species/${id}: ${speciesRes.status}`);
  const species = await speciesRes.json();

  const evolutionChainUrl: string | null = species.evolution_chain?.url ?? null;
  let evolutionChainId: number | null = null;
  if (evolutionChainUrl) {
    const match = evolutionChainUrl.match(/\/evolution-chain\/(\d+)\//);
    if (match) evolutionChainId = parseInt(match[1], 10);
  }

  const evolvesFromId: number | null = species.evolves_from_species
    ? parseInt(species.evolves_from_species.url.match(/\/pokemon-species\/(\d+)\//)?.[1] ?? '', 10) || null
    : null;

  const statMap: Record<string, number> = {};
  for (const s of pokemon.stats) {
    statMap[s.stat.name] = s.base_stat;
  }

  return {
    name: formatName(pokemon.name, id),
    types: pokemon.types
      .sort((a: any, b: any) => a.slot - b.slot)
      .map((t: any) => t.type.name),
    height: pokemon.height,
    weight: pokemon.weight,
    is_legendary: species.is_legendary,
    is_mythical: species.is_mythical,
    evolution_chain_id: evolutionChainId,
    evolves_from_id: evolvesFromId,
    stats: {
      hp: statMap['hp'] ?? 0,
      attack: statMap['attack'] ?? 0,
      defense: statMap['defense'] ?? 0,
      sp_atk: statMap['special-attack'] ?? 0,
      sp_def: statMap['special-defense'] ?? 0,
      speed: statMap['speed'] ?? 0,
    },
  };
}

function formatName(apiName: string, id: number): string {
  const overrides: Record<number, string> = {
    29: 'Nidoran Female',
    32: 'Nidoran Male',
    83: "Farfetch'd",
    122: 'Mr. Mime',
    250: 'Ho-Oh',
    386: 'Deoxys',
    413: 'Wormadam',
    421: 'Cherrim',
    422: 'Shellos',
    423: 'Gastrodon',
    439: 'Mime Jr.',
    474: 'Porygon-Z',
    487: 'Giratina',
    492: 'Shaymin',
    550: 'Basculin',
    555: 'Darmanitan',
    641: 'Tornadus',
    642: 'Thundurus',
    645: 'Landorus',
    647: 'Keldeo',
    648: 'Meloetta',
    681: 'Aegislash',
    710: 'Pumpkaboo',
    711: 'Gourgeist',
    718: 'Zygarde',
  };
  if (overrides[id]) return overrides[id];

  return apiName
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export async function fetchAllPokemon(): Promise<Cache> {
  let cache: Cache = {};
  if (fs.existsSync(CACHE_PATH)) {
    cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    console.log(`Loaded cache with ${Object.keys(cache).length} entries`);
  }

  const missing: number[] = [];
  for (let id = 1; id <= TOTAL_POKEMON; id++) {
    if (!cache[String(id)] || !cache[String(id)].stats) missing.push(id);
  }

  if (missing.length === 0) {
    console.log('Cache is complete, no API calls needed');
    return cache;
  }

  console.log(`Fetching ${missing.length} Pokemon from PokeAPI...`);
  for (let i = 0; i < missing.length; i++) {
    const id = missing[i];
    process.stdout.write(`  Fetching #${id}... `);
    cache[String(id)] = await fetchPokemonData(id);
    console.log(cache[String(id)].name);

    if (i < missing.length - 1) await sleep(FETCH_DELAY_MS);

    if ((i + 1) % 50 === 0) {
      fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
      console.log(`  [checkpoint saved at ${i + 1}/${missing.length}]`);
    }
  }

  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  console.log(`Cache saved with ${Object.keys(cache).length} entries`);
  return cache;
}

export function parseAliases(): Record<string, string> {
  const content = fs.readFileSync(ALIASES_PATH, 'utf-8');
  const aliases: Record<string, string> = {};

  const regex = /['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    aliases[match[1]] = match[2];
  }

  return aliases;
}

export function parseFruits(): string[] {
  const data = JSON.parse(fs.readFileSync(FRUITS_PATH, 'utf-8'));
  return data.map((f: { name: string }) => f.name);
}

export function generateDatabase(cache: Cache, aliases: Record<string, string>, fruits: string[]): void {
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

  const db = new Database(DB_PATH);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = OFF');

  db.exec(`
    CREATE TABLE pokemon (
      id              INTEGER PRIMARY KEY,
      name            TEXT NOT NULL UNIQUE,
      generation      INTEGER NOT NULL,
      type1           TEXT NOT NULL,
      type2           TEXT,
      height          INTEGER,
      weight          INTEGER,
      is_legendary    INTEGER NOT NULL DEFAULT 0,
      is_mythical     INTEGER NOT NULL DEFAULT 0,
      evolution_chain_id INTEGER,
      evolves_from_id INTEGER REFERENCES pokemon(id),
      hp              INTEGER NOT NULL DEFAULT 0,
      attack          INTEGER NOT NULL DEFAULT 0,
      defense         INTEGER NOT NULL DEFAULT 0,
      sp_attack       INTEGER NOT NULL DEFAULT 0,
      sp_defense      INTEGER NOT NULL DEFAULT 0,
      speed           INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX idx_pokemon_generation ON pokemon(generation);
    CREATE INDEX idx_pokemon_type1 ON pokemon(type1);
    CREATE INDEX idx_pokemon_type2 ON pokemon(type2);
    CREATE INDEX idx_pokemon_is_legendary ON pokemon(is_legendary);

    CREATE TABLE aliases (
      alias        TEXT PRIMARY KEY,
      pokemon_name TEXT NOT NULL
    );

    CREATE TABLE fruits (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE metadata (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const insertPokemon = db.prepare(`
    INSERT INTO pokemon (id, name, generation, type1, type2, height, weight, is_legendary, is_mythical, evolution_chain_id, evolves_from_id, hp, attack, defense, sp_attack, sp_defense, speed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAlias = db.prepare('INSERT OR IGNORE INTO aliases (alias, pokemon_name) VALUES (?, ?)');
  const insertFruit = db.prepare('INSERT INTO fruits (name) VALUES (?)');
  const insertMeta = db.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)');

  const insertAll = db.transaction(() => {
    for (let id = 1; id <= TOTAL_POKEMON; id++) {
      const p = cache[String(id)];
      if (!p) throw new Error(`Missing cache entry for Pokemon #${id}`);

      insertPokemon.run(
        id,
        p.name,
        getGeneration(id),
        p.types[0],
        p.types[1] ?? null,
        p.height,
        p.weight,
        p.is_legendary ? 1 : 0,
        p.is_mythical ? 1 : 0,
        p.evolution_chain_id,
        p.evolves_from_id,
        p.stats?.hp ?? 0,
        p.stats?.attack ?? 0,
        p.stats?.defense ?? 0,
        p.stats?.sp_atk ?? 0,
        p.stats?.sp_def ?? 0,
        p.stats?.speed ?? 0
      );
    }

    for (const [alias, pokemonName] of Object.entries(aliases)) {
      insertAlias.run(alias, pokemonName);
    }

    for (const fruit of fruits) {
      insertFruit.run(fruit);
    }

    insertMeta.run('schema_version', '1');
    insertMeta.run('generated_at', new Date().toISOString());
  });

  insertAll();

  db.pragma('user_version = 1');

  const pokemonCount = (db.prepare('SELECT COUNT(*) as count FROM pokemon').get() as any).count;
  const aliasCount = (db.prepare('SELECT COUNT(*) as count FROM aliases').get() as any).count;
  const fruitCount = (db.prepare('SELECT COUNT(*) as count FROM fruits').get() as any).count;

  const integrity = db.pragma('integrity_check');
  console.log(`Integrity check: ${(integrity as any)[0]?.integrity_check}`);

  db.close();

  const fileSize = fs.statSync(DB_PATH).size;
  console.log(`\nGenerated ${DB_PATH}`);
  console.log(`  Pokemon: ${pokemonCount}`);
  console.log(`  Aliases: ${aliasCount}`);
  console.log(`  Fruits:  ${fruitCount}`);
  console.log(`  Size:    ${(fileSize / 1024).toFixed(1)} KB`);
}

async function main() {
  console.log('=== Quiz Game DB Generator ===\n');

  const cache = await fetchAllPokemon();
  const aliases = parseAliases();
  const fruits = parseFruits();

  console.log(`\nParsed ${Object.keys(aliases).length} aliases`);
  console.log(`Parsed ${fruits.length} fruits`);

  generateDatabase(cache, aliases, fruits);
  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
