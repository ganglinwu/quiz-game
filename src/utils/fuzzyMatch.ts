import { levenshtein } from './levenshtein';
import { getAllAliases } from '../data/pokemon-db';

let _aliases: Record<string, string> | null = null;
function getAliases(): Record<string, string> {
  if (!_aliases) _aliases = getAllAliases();
  return _aliases;
}

export interface MatchResult {
  match: string | null;
  distance: number;
  confidence: 'exact' | 'close' | 'none';
  generation?: number;
}

function normalize(s: string): string {
  // Keep digits: stripping them collapses distinct names onto one key (e.g.
  // "Porygon2" -> "porygon" == "Porygon"), which would falsely flag Porygon2 as
  // a duplicate of Porygon and make it unnameable when both are in the pool.
  return s.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

function getThreshold(input: string): number {
  const len = input.length;
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  return 2;
}

export function findDuplicate(input: string, usedItems: string[]): string | null {
  const normalized = normalize(input);
  const a = getAliases();
  const resolved = a[input.toLowerCase().trim()] || a[normalized] || null;

  const exactMatch = usedItems.find((item) => normalize(item) === normalized);
  if (exactMatch) {
    console.log(`[fuzzyMatch] duplicate check: "${input}" → exact duplicate "${exactMatch}"`);
    return exactMatch;
  }

  if (resolved) {
    const aliasMatch = usedItems.find((item) => item === resolved);
    if (aliasMatch) {
      console.log(`[fuzzyMatch] duplicate check: "${input}" → alias "${resolved}" already used`);
      return aliasMatch;
    }
  }

  return null;
}

export function fuzzyMatch(
  input: string,
  itemList: string[],
  usedItems: string[]
): MatchResult {
  const normalized = normalize(input);
  if (!normalized) {
    console.log(`[fuzzyMatch] empty input after normalization`);
    return { match: null, distance: Infinity, confidence: 'none' };
  }

  const lowerInput = input.toLowerCase().trim();
  const aliases = getAliases();
  const aliasMatch = aliases[lowerInput] || aliases[normalized];
  if (aliasMatch) {
    const usedSet = new Set(usedItems.map(normalize));
    if (!usedSet.has(normalize(aliasMatch))) {
      console.log(`[fuzzyMatch] alias hit: "${input}" → "${aliasMatch}"`);
      return { match: aliasMatch, distance: 0, confidence: 'exact' };
    }
  }

  const usedSet = new Set(usedItems.map(normalize));
  const available = itemList.filter((item) => !usedSet.has(normalize(item)));

  let bestMatch: string | null = null;
  let bestDistance = Infinity;

  for (const item of available) {
    const dist = levenshtein(normalized, normalize(item));
    if (dist < bestDistance) {
      bestDistance = dist;
      bestMatch = item;
    }
  }

  const maxAllowedDistance = getThreshold(normalized);

  console.log(
    `[fuzzyMatch] input="${input}" normalized="${normalized}" bestMatch="${bestMatch}" distance=${bestDistance} threshold=${maxAllowedDistance}`
  );

  if (bestDistance === 0) {
    return { match: bestMatch, distance: 0, confidence: 'exact' };
  } else if (bestDistance <= maxAllowedDistance) {
    return { match: bestMatch, distance: bestDistance, confidence: 'close' };
  } else {
    return { match: null, distance: bestDistance, confidence: 'none' };
  }
}

export function fuzzyMatchWithGenDetection(
  input: string,
  activeItems: string[],
  allItems: string[],
  usedItems: string[],
  getGen: (name: string) => number | null
): MatchResult {
  const activeResult = fuzzyMatch(input, activeItems, usedItems);
  // An exact (or alias) match in the active set is the unambiguous common case.
  if (activeResult.confidence === 'exact') {
    return { ...activeResult, generation: getGen(activeResult.match!) ?? undefined };
  }

  // Before accepting a merely *close* active-gen match, see if the input is an
  // exact match for some Pokemon in another generation. Gen 7-9 added many
  // near-twins that straddle the active/inactive line within the edit-distance
  // threshold (e.g. Gen-1 Diglett vs Gen-9 Wiglett, Gen-1 Mr. Mime vs Gen-8
  // Mr. Rime). Without this, naming the inactive twin by its exact name would be
  // silently credited as the active twin AND report the wrong generation,
  // suppressing the "expand generation?" vote. Exact intent must win over a fuzzy
  // near-miss.
  const allResult = fuzzyMatch(input, allItems, usedItems);
  if (allResult.confidence === 'exact') {
    return { ...allResult, generation: getGen(allResult.match!) ?? undefined };
  }

  // Neither set has an exact hit: prefer a close active-gen match, else the
  // close all-gens match (the original active -> all fallback order).
  if (activeResult.confidence !== 'none') {
    return { ...activeResult, generation: getGen(activeResult.match!) ?? undefined };
  }
  if (allResult.confidence !== 'none') {
    return { ...allResult, generation: getGen(allResult.match!) ?? undefined };
  }

  return { match: null, distance: Infinity, confidence: 'none' };
}
