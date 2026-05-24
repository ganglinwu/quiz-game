import { queryPokemon, PokemonQuery } from '../data/pokemon-db';
import {
  QuizConfig,
  QuizConstraint,
  QuizDifficulty,
  QuizFilter,
  QuizQuestion,
} from '../types';

const ALL_POKEMON_TYPES = [
  'bug', 'dark', 'dragon', 'electric', 'fairy', 'fighting', 'fire', 'flying',
  'ghost', 'grass', 'ground', 'ice', 'normal', 'poison', 'psychic', 'rock',
  'steel', 'water',
];

function constraintCount(difficulty: QuizDifficulty): number {
  switch (difficulty) {
    case 'easy': return 1;
    case 'medium': return 2;
    case 'hard': return 3;
  }
}

export function buildBaselineQuery(
  filter: QuizFilter,
  activeGens: number[],
  usedItems: string[],
): PokemonQuery {
  const query: PokemonQuery = {
    generations: activeGens,
    excludeNames: usedItems.length > 0 ? usedItems : undefined,
  };
  if (!filter.includeLegendary) query.isLegendary = false;
  if (!filter.includeMythical) query.isMythical = false;
  return query;
}

function buildConstraintPool(
  filter: QuizFilter,
  activeGens: number[],
): QuizConstraint[] {
  const pool: QuizConstraint[] = [];

  if (activeGens.length > 1) {
    for (const gen of activeGens) {
      pool.push({ kind: 'generation', generation: gen });
    }
  }

  const allowedTypes =
    filter.types && filter.types.length > 0 ? filter.types : ALL_POKEMON_TYPES;
  for (const t of allowedTypes) {
    pool.push({ kind: 'type', pokemonType: t });
  }

  if (filter.includeLegendary) {
    pool.push({ kind: 'legendary', value: true });
  }
  if (filter.includeMythical) {
    pool.push({ kind: 'mythical', value: true });
  }

  const stages =
    filter.evolutionStages && filter.evolutionStages.length > 0
      ? filter.evolutionStages
      : (['base', 'middle', 'final'] as const);
  if (stages.length > 1) {
    for (const stage of stages) {
      pool.push({ kind: 'evolutionStage', stage });
    }
  }

  if (filter.allowDualType === undefined) {
    pool.push({ kind: 'dualType', value: true });
    pool.push({ kind: 'dualType', value: false });
  }

  return pool;
}

function areCompatible(constraints: QuizConstraint[]): boolean {
  const kinds = constraints.map((c) => c.kind);
  const nonTypeKinds = kinds.filter((k) => k !== 'type');
  if (new Set(nonTypeKinds).size !== nonTypeKinds.length) return false;

  const typeCount = kinds.filter((k) => k === 'type').length;
  if (typeCount > 2) return false;
  if (typeCount === 2) {
    if (constraints.some((c) => c.kind === 'dualType' && !c.value)) return false;
    const types = constraints
      .filter((c): c is Extract<QuizConstraint, { kind: 'type' }> => c.kind === 'type')
      .map((c) => c.pokemonType);
    if (types[0] === types[1]) return false;
  }

  return true;
}

export function constraintsToQuery(
  baseline: PokemonQuery,
  constraints: QuizConstraint[],
): PokemonQuery {
  const query = { ...baseline };
  for (const c of constraints) {
    switch (c.kind) {
      case 'generation':
        query.generations = [c.generation];
        break;
      case 'type':
        query.types = [...(query.types ?? []), c.pokemonType];
        break;
      case 'legendary':
        query.isLegendary = c.value;
        break;
      case 'mythical':
        query.isMythical = c.value;
        break;
      case 'evolutionStage':
        query.evolutionStage = c.stage;
        break;
      case 'dualType':
        query.isDualType = c.value;
        break;
    }
  }
  return query;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function constraintToLabel(constraint: QuizConstraint): string {
  switch (constraint.kind) {
    case 'generation':
      return `Gen ${constraint.generation}`;
    case 'type':
      return `${capitalize(constraint.pokemonType)} type`;
    case 'legendary':
      return 'Legendary';
    case 'mythical':
      return 'Mythical';
    case 'evolutionStage': {
      const labels = { base: 'Unevolved', middle: 'Middle evolution', final: 'Fully evolved' };
      return labels[constraint.stage];
    }
    case 'dualType':
      return constraint.value ? 'Dual-type' : 'Mono-type';
  }
}

export function buildPromptText(constraints: QuizConstraint[]): string {
  const parts: string[] = [];

  const gen = constraints.find(
    (c): c is Extract<QuizConstraint, { kind: 'generation' }> => c.kind === 'generation',
  );
  if (gen) parts.push(`Gen ${gen.generation}`);

  const legendary = constraints.find(
    (c): c is Extract<QuizConstraint, { kind: 'legendary' }> => c.kind === 'legendary',
  );
  if (legendary && legendary.value) parts.push('Legendary');

  const mythical = constraints.find(
    (c): c is Extract<QuizConstraint, { kind: 'mythical' }> => c.kind === 'mythical',
  );
  if (mythical && mythical.value) parts.push('Mythical');

  const stage = constraints.find(
    (c): c is Extract<QuizConstraint, { kind: 'evolutionStage' }> => c.kind === 'evolutionStage',
  );
  if (stage) {
    const labels = { base: 'unevolved', middle: 'middle evolution', final: 'fully evolved' };
    parts.push(labels[stage.stage]);
  }

  const dual = constraints.find(
    (c): c is Extract<QuizConstraint, { kind: 'dualType' }> => c.kind === 'dualType',
  );
  if (dual) parts.push(dual.value ? 'dual-type' : 'mono-type');

  const types = constraints.filter(
    (c): c is Extract<QuizConstraint, { kind: 'type' }> => c.kind === 'type',
  );
  if (types.length > 0) {
    parts.push(types.map((t) => capitalize(t.pokemonType)).join('/') + ' type');
  }

  return `Name a ${parts.join(' ')} Pokemon`;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const MAX_ATTEMPTS = 50;

export function generateQuestion(
  config: QuizConfig,
  activeGens: number[],
  usedItems: string[],
): QuizQuestion | null {
  const { difficulty, filter } = config;
  const numConstraints = constraintCount(difficulty);
  const baseline = buildBaselineQuery(filter, activeGens, usedItems);
  const pool = buildConstraintPool(filter, activeGens);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const shuffled = shuffle(pool);
    const picked: QuizConstraint[] = [];

    for (const candidate of shuffled) {
      if (picked.length >= numConstraints) break;
      if (areCompatible([...picked, candidate])) {
        picked.push(candidate);
      }
    }

    if (picked.length < numConstraints) continue;

    const query = constraintsToQuery(baseline, picked);
    const results = queryPokemon(query);

    if (results.length === 0) continue;

    return {
      constraints: picked,
      promptText: buildPromptText(picked),
      validAnswerCount: results.length,
      difficulty,
    };
  }

  if (numConstraints > 1) {
    const fallback: QuizDifficulty = numConstraints === 3 ? 'medium' : 'easy';
    return generateQuestion({ ...config, difficulty: fallback }, activeGens, usedItems);
  }

  return null;
}

export function validateAnswerAgainstQuestion(
  pokemonName: string,
  question: QuizQuestion,
  activeGens: number[],
): boolean {
  const query = constraintsToQuery({ generations: activeGens }, question.constraints);
  const results = queryPokemon(query);
  return results.some((p) => p.name === pokemonName);
}

export type ConstraintFeedback = { label: string; passed: boolean }[];

export function validateAnswerPerConstraint(
  pokemonName: string,
  question: QuizQuestion,
  activeGens: number[],
): ConstraintFeedback {
  const results: ConstraintFeedback = [];

  const hasGenConstraint = question.constraints.some((c) => c.kind === 'generation');
  if (!hasGenConstraint) {
    const genResults = queryPokemon({ generations: activeGens });
    results.push({
      label: activeGens.length === 1 ? `Gen ${activeGens[0]}` : `Gen ${activeGens.join(', ')}`,
      passed: genResults.some((p) => p.name === pokemonName),
    });
  }

  for (const constraint of question.constraints) {
    const query = constraintsToQuery({}, [constraint]);
    const matches = queryPokemon(query);
    results.push({
      label: constraintToLabel(constraint),
      passed: matches.some((p) => p.name === pokemonName),
    });
  }

  return results;
}
