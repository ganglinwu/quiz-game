import { describe, it, expect } from 'vitest';
import { levenshtein } from './levenshtein';
import {
  fuzzyMatch,
  findDuplicate,
  fuzzyMatchWithGenDetection,
} from './fuzzyMatch';

// Characterization / regression suite for the answer-acceptance gate.
//
// This module decides whether a typed or spoken answer is accepted in BOTH normal
// and quiz mode, so its threshold design ("0 for 1-3 chars, 1 for 4-5, max 2 for 6+",
// per CLAUDE.md) is the anti-gaming guarantee — loosening any threshold would let
// guess-and-check answers slip through. It had no automated coverage before.
//
// `fuzzyMatch` takes `itemList` as a parameter, so the threshold/match assertions use
// small explicit lists and are computable by hand. The alias paths read the real
// bundled `assets/quiz.db` (via the vitest expo-sqlite -> better-sqlite3 alias); the
// asserted aliases ("he can" -> Ekans, "volt orb" -> Voltorb) are documented in
// CLAUDE.md and confirmed present in the shipped data.

describe('levenshtein', () => {
  it('is 0 for identical strings', () => {
    expect(levenshtein('pikachu', 'pikachu')).toBe(0);
  });

  it('counts a single insert / delete / substitute as distance 1', () => {
    expect(levenshtein('pikachu', 'pikachb')).toBe(1); // substitute
    expect(levenshtein('me', 'mew')).toBe(1); // insert
    expect(levenshtein('mew', 'me')).toBe(1); // delete
  });

  it('equals the longer length when one string is empty', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('matches the classic textbook distances', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('flaw', 'lawn')).toBe(2);
  });
});

describe('fuzzyMatch — threshold design (anti-gaming gate)', () => {
  it('1-3 char inputs require an EXACT match (threshold 0)', () => {
    // "mew" exact -> accepted
    const exact = fuzzyMatch('mew', ['Mew'], []);
    expect(exact).toMatchObject({ match: 'Mew', distance: 0, confidence: 'exact' });

    // "me" is distance 1 from "mew" but only threshold 0 is allowed at length 2 -> rejected
    const tooLoose = fuzzyMatch('me', ['Mew'], []);
    expect(tooLoose).toMatchObject({ match: null, confidence: 'none' });
  });

  it('4-5 char inputs allow distance 1 but not 2', () => {
    expect(fuzzyMatch('abro', ['Abra'], [])).toMatchObject({
      match: 'Abra',
      distance: 1,
      confidence: 'close',
    });
    // "abxx" is distance 2 from "Abra"; length 4 allows only 1 -> rejected
    expect(fuzzyMatch('abxx', ['Abra'], [])).toMatchObject({
      match: null,
      confidence: 'none',
    });
  });

  it('6+ char inputs allow distance up to 2 but not 3', () => {
    expect(fuzzyMatch('pikachb', ['Pikachu'], [])).toMatchObject({
      match: 'Pikachu',
      distance: 1,
      confidence: 'close',
    });
    // "pikxxxu" is distance 3 from "Pikachu"; max allowed is 2 -> rejected
    expect(fuzzyMatch('pikxxxu', ['Pikachu'], [])).toMatchObject({
      match: null,
      confidence: 'none',
    });
  });

  it('returns "none" for empty / punctuation-only input', () => {
    expect(fuzzyMatch('   ', ['Pikachu'], [])).toMatchObject({
      match: null,
      confidence: 'none',
    });
    expect(fuzzyMatch('!!!', ['Pikachu'], [])).toMatchObject({
      match: null,
      confidence: 'none',
    });
  });

  it('normalizes case and punctuation before matching', () => {
    expect(fuzzyMatch('  PIKACHU! ', ['Pikachu'], [])).toMatchObject({
      match: 'Pikachu',
      distance: 0,
      confidence: 'exact',
    });
  });

  it('excludes already-used items from the candidate pool', () => {
    // Bulbasaur is the only close match but it is used -> no fallback to a far item
    const result = fuzzyMatch('bulbasaur', ['Bulbasaur', 'Charizard'], ['Bulbasaur']);
    expect(result).toMatchObject({ match: null, confidence: 'none' });
  });
});

describe('fuzzyMatch — alias layer (real quiz.db)', () => {
  it('an alias bypasses the Levenshtein threshold entirely', () => {
    // "he can" -> Ekans: normalized "hecan" is distance 3 from "ekans" (well past the
    // length-5 threshold of 1), so only the alias map can produce this match.
    const result = fuzzyMatch('he can', ['Ekans'], []);
    expect(result).toMatchObject({ match: 'Ekans', distance: 0, confidence: 'exact' });
  });

  it('matches a multi-word alias regardless of the candidate list', () => {
    // The alias resolves to the canonical name directly, without consulting itemList.
    const result = fuzzyMatch('volt orb', [], []);
    expect(result).toMatchObject({ match: 'Voltorb', distance: 0, confidence: 'exact' });
  });

  it('does NOT return an alias target that is already used (falls through to Levenshtein)', () => {
    // When the alias points at a used item, the alias shortcut is skipped and the
    // Levenshtein pass runs over the (used-filtered) list. Duplicate *detection* of this
    // case is handled separately by findDuplicate, which the caller runs first.
    const result = fuzzyMatch('he can', ['Ekans'], ['Ekans']);
    expect(result).toMatchObject({ match: null, confidence: 'none' });
  });
});

describe('findDuplicate (real quiz.db)', () => {
  it('detects a normalized exact duplicate ignoring case and punctuation', () => {
    expect(findDuplicate('PIKACHU!!', ['Pikachu'])).toBe('Pikachu');
  });

  it('detects a duplicate reached through an alias', () => {
    expect(findDuplicate('he can', ['Ekans'])).toBe('Ekans');
  });

  it('returns null when the item has not been used', () => {
    expect(findDuplicate('charizard', ['Pikachu'])).toBeNull();
  });

  it('does NOT treat Porygon2 as a duplicate of Porygon (digits are significant)', () => {
    // normalize() keeps digits, so "Porygon2" -> "porygon2" stays distinct from
    // "Porygon" -> "porygon". Stripping digits used to collapse them, making
    // Porygon2 unnameable once Porygon was used (and vice versa).
    expect(findDuplicate('Porygon2', ['Porygon'])).toBeNull();
    expect(findDuplicate('Porygon', ['Porygon2'])).toBeNull();
    // a real re-entry is still caught
    expect(findDuplicate('Porygon2', ['Porygon2'])).toBe('Porygon2');
  });
});

describe('fuzzyMatch — digit-bearing names stay distinct (Porygon / Porygon2)', () => {
  it('lets Porygon2 be named while Porygon is already used', () => {
    const result = fuzzyMatch('Porygon2', ['Porygon', 'Porygon2'], ['Porygon']);
    expect(result).toMatchObject({ match: 'Porygon2', distance: 0, confidence: 'exact' });
  });

  it('matches the exact-named member rather than its digit-twin', () => {
    expect(fuzzyMatch('Porygon', ['Porygon', 'Porygon2'], [])).toMatchObject({
      match: 'Porygon',
      distance: 0,
    });
    expect(fuzzyMatch('Porygon2', ['Porygon', 'Porygon2'], [])).toMatchObject({
      match: 'Porygon2',
      distance: 0,
    });
  });
});

describe('fuzzyMatchWithGenDetection (active -> all-gens fallback)', () => {
  const getGen = (name: string): number | null =>
    ({ Pikachu: 1, Mudkip: 3 } as Record<string, number>)[name] ?? null;

  it('matches within the active set and tags its generation', () => {
    const result = fuzzyMatchWithGenDetection(
      'pikachu',
      ['Pikachu'],
      ['Pikachu', 'Mudkip'],
      [],
      getGen
    );
    expect(result).toMatchObject({ match: 'Pikachu', confidence: 'exact', generation: 1 });
  });

  it('falls back to the full list and surfaces the inactive generation (drives the gen vote)', () => {
    // This is the user's core scenario: a Pokemon from an inactive generation is found
    // via the all-items fallback with its real generation attached, so the caller can
    // trigger the "expand generation?" vote instead of rejecting the answer.
    const result = fuzzyMatchWithGenDetection(
      'mudkip',
      ['Pikachu'],
      ['Pikachu', 'Mudkip'],
      [],
      getGen
    );
    expect(result).toMatchObject({ match: 'Mudkip', generation: 3 });
    expect(result.confidence).not.toBe('none');
  });

  it('returns "none" with no generation when nothing matches in either set', () => {
    const result = fuzzyMatchWithGenDetection(
      'zzzzzz',
      ['Pikachu'],
      ['Pikachu', 'Mudkip'],
      [],
      getGen
    );
    expect(result).toMatchObject({ match: null, confidence: 'none' });
    expect(result.generation).toBeUndefined();
  });

  it('an EXACT inactive-gen name beats a CLOSE active-gen near-twin (drives the right gen vote)', () => {
    // Gen 7-9 introduced many edit-distance-1 near-twins of earlier Pokemon
    // (Diglett/Wiglett, Dugtrio/Wugtrio, Mr. Mime/Mr. Rime, Corsola/Cursola).
    // Naming the inactive twin by its exact name must surface THAT Pokemon and
    // its real generation, not be silently credited as the active twin — which
    // would also report the wrong generation and suppress the expansion vote.
    const gen = (name: string): number | null =>
      ({ Diglett: 1, Wiglett: 9 } as Record<string, number>)[name] ?? null;

    // Gen-1 game, player names the Gen-9 "Wiglett": must resolve to Wiglett/9.
    const inGen1 = fuzzyMatchWithGenDetection(
      'Wiglett',
      ['Diglett'],
      ['Diglett', 'Wiglett'],
      [],
      gen
    );
    expect(inGen1).toMatchObject({ match: 'Wiglett', generation: 9 });

    // Gen-9 game, player names the Gen-1 "Diglett": must resolve to Diglett/1.
    const inGen9 = fuzzyMatchWithGenDetection(
      'Diglett',
      ['Wiglett'],
      ['Diglett', 'Wiglett'],
      [],
      gen
    );
    expect(inGen9).toMatchObject({ match: 'Diglett', generation: 1 });
  });

  it('still prefers a CLOSE active-gen match when neither set has an exact hit', () => {
    // "pikachb" is a typo of active Pikachu (distance 1) and matches nothing
    // exactly anywhere, so the close active-gen match must still win.
    const result = fuzzyMatchWithGenDetection(
      'pikachb',
      ['Pikachu'],
      ['Pikachu', 'Mudkip'],
      [],
      getGen
    );
    expect(result).toMatchObject({ match: 'Pikachu', confidence: 'close', generation: 1 });
  });
});
