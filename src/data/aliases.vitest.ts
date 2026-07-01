import { describe, it, expect } from 'vitest';
import {
  getAllAliases,
  getAllPokemon,
  getGenForPokemon,
} from './pokemon-db';
import { aliases as sourceAliases } from './aliases';

// The ~630 speech-recognition aliases (Gen 1-3) are the CORE of the voice-input
// path: fuzzyMatch resolves a mishearing straight to its target and returns
// `{ match: target }` WITHOUT re-checking that target against the candidate
// list (fuzzyMatch.ts:66-72). So a broken alias — a target that isn't a real
// Pokemon, or a key the lookup can never reach — is silent and user-invisible:
// the game would either propose a phantom item or the mishearing would simply
// never be accepted. These integrity tests run against the genuine bundled
// quiz.db (the RUNTIME source, via the better-sqlite3 shim) so they guard the
// actual baked data, not just the aliases.ts build input.

// Mirror fuzzyMatch.ts's normalize() exactly — the reducer/dedup/gen-lookup all
// key off this normalized form, so it is what makes a "close enough" target
// still functional.
const normalize = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]/g, '');

describe('baked alias table — runtime voice-input source of truth (quiz.db)', () => {
  const aliases = getAllAliases();
  const keys = Object.keys(aliases);
  const targets = [...new Set(keys.map((k) => aliases[k]))];
  const canonicalNames = new Set(getAllPokemon().map((p) => p.name));
  const normalizedNames = new Set(getAllPokemon().map((p) => normalize(p.name)));

  it('bakes the full alias set without truncation', () => {
    // Relational floor guard: a botched generate-db run that drops most rows
    // (empty/short table) is the failure this catches, without pinning an exact
    // magic number that legitimate additions would trip.
    expect(keys.length).toBeGreaterThanOrEqual(600);
  });

  it('every alias resolves to a real, generation-resolvable Pokemon (no functionally-dead alias)', () => {
    // THE load-bearing guard. Because fuzzyMatch returns the alias target
    // verbatim, every target must normalize onto a genuine Pokemon so that
    // gen-detection, duplicate detection, and the confirm all operate on a real
    // item rather than a phantom string.
    const unresolvable = targets.filter(
      (t) => !normalizedNames.has(normalize(t)) || getGenForPokemon(t) === null,
    );
    expect(unresolvable).toEqual([]);
  });

  it('every alias key is reachable by the fuzzyMatch lookup (no silently-dead alias)', () => {
    // fuzzyMatch looks up `aliases[lowerInput] || aliases[normalized]`, where
    //   lowerInput = input.toLowerCase().trim()          (punctuation KEPT)
    //   normalized = same, then strip [^a-z0-9]           (punctuation STRIPPED)
    // A stored key is reachable iff it equals its own lowercased+trimmed form
    // (hit via lowerInput — this covers the multi-word "far fetched" keys whose
    // spaces survive) OR its own fully-normalized form. A key carrying stray
    // uppercase or leading/trailing whitespace would be dead on arrival.
    const unreachable = keys.filter(
      (k) => k !== k.toLowerCase().trim() && k !== normalize(k),
    );
    expect(unreachable).toEqual([]);

    // And no empty/whitespace-only key (would collide with blank input).
    expect(keys.filter((k) => k.trim() === '')).toEqual([]);
  });

  it("pins the sole non-canonical target: Farfetch'd aliases store \"Farfetchd\" yet still resolve", () => {
    // Characterization test. Exactly one distinct target is not an EXACT
    // canonical name: the three Farfetch'd aliases were authored without the
    // apostrophe ("Farfetchd"). It is cosmetic — normalization bridges the gap
    // so voice input, gen-detection and dedup all still work — but the stored/
    // displayed item reads "Farfetchd" rather than "Farfetch'd".
    //
    // Pinning it here means: a NEW typo'd target makes this array grow (caught),
    // and fixing Farfetch'd in aliases.ts + regenerating quiz.db makes it empty
    // (caught → update this pin, confirming the fix landed in the DB).
    const nonCanonicalTargets = targets.filter((t) => !canonicalNames.has(t));
    expect(nonCanonicalTargets).toEqual(['Farfetchd']);

    expect(canonicalNames.has('Farfetchd')).toBe(false);
    expect(canonicalNames.has("Farfetch'd")).toBe(true);
    // Proof the divergence is harmless: both spellings normalize to the same
    // Pokemon, so getGenForPokemon agrees and the voice path stays functional.
    expect(getGenForPokemon('Farfetchd')).toBe(getGenForPokemon("Farfetch'd"));
    expect(getGenForPokemon('Farfetchd')).not.toBeNull();
  });
});

describe('alias source <-> baked artifact (aliases.ts vs quiz.db)', () => {
  const baked = getAllAliases();
  const srcKeys = Object.keys(sourceAliases);
  const bakedKeys = Object.keys(baked);

  it('every aliases.ts entry survives verbatim into quiz.db', () => {
    // generate-db inserts alias keys/values verbatim (no casing/normalization),
    // so the shipped quiz.db mirrors the current aliases.ts one-for-one. Any
    // drift here means aliases.ts was edited without re-running
    // `npm run generate-db`, leaving stale voice data in the bundled asset.
    expect(srcKeys.length).toBe(bakedKeys.length);

    const sourceOnly = srcKeys.filter((k) => !(k in baked));
    const dbOnly = bakedKeys.filter((k) => !(k in sourceAliases));
    const valueMismatch = srcKeys.filter(
      (k) => k in baked && baked[k] !== sourceAliases[k],
    );

    // Clean sync: parseAliases() now uses a same-quote backreference regex, so
    // every key — including the apostrophe key "farfetch'd" — bakes into quiz.db
    // verbatim. (The prior /['"]([^'"]+)['"].../ stopped the key group at the
    // first quote char, mis-parsing "farfetch'd" into a bogus lone-letter `d`
    // alias and dropping the intended key; regex fixed + quiz.db regenerated.)
    expect(sourceOnly).toEqual([]);
    expect(dbOnly).toEqual([]);
    expect(valueMismatch).toEqual([]);
  });
});
