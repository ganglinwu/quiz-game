import { describe, it, expect } from 'vitest';
import { buildPromptText, constraintToLabel } from './quizQuestionGenerator';
import type { QuizConstraint } from '../types';

// The two quiz-banner text formatters, both previously untested directly.
//
//   • buildPromptText(constraints) -> question.promptText, rendered as the banner HEADER
//     ("Name a ... Pokemon"). It IGNORES input order and re-emits constraints in a fixed
//     display sequence with LOWERCASE wording.
//   • constraintToLabel(constraint) -> one banner CHECKLIST ROW (QuizQuestionBanner.tsx:30)
//     and the label on each per-constraint ✓/✗ feedback row. It formats ONE constraint at a
//     time with CAPITALIZED, differently-worded labels.
//
// They are deliberately divergent (header prose vs. bullet labels): a refactor that "dedupes"
// them into one formatter would silently change the on-screen text. These assertions pin the
// exact wording, casing, and — for buildPromptText — the order-independence that lets the
// question generator hand constraints in any shuffle order.
//
// Both are pure string builders (no DB), so this suite needs no quiz.db access even though the
// module also exports DB-backed query helpers.

// Realistic constraints — every shape below is one the live buildConstraintPool actually emits
// (legendary/mythical only ever value:true; dualType emits both true and false; statRank topN=20).
const GEN2: QuizConstraint = { kind: 'generation', generation: 2 };
const FIRE: QuizConstraint = { kind: 'type', pokemonType: 'fire' };
const FLYING: QuizConstraint = { kind: 'type', pokemonType: 'flying' };
const LEGEND: QuizConstraint = { kind: 'legendary', value: true };
const MYTH: QuizConstraint = { kind: 'mythical', value: true };
const DUAL: QuizConstraint = { kind: 'dualType', value: true };
const MONO: QuizConstraint = { kind: 'dualType', value: false };
const SE_WATER: QuizConstraint = { kind: 'superEffective', targetType: 'water' };
const SR_SPATK: QuizConstraint = { kind: 'statRank', stat: 'sp_attack', topN: 20 };

describe('buildPromptText — banner header ("Name a ... Pokemon")', () => {
  it('wraps a single gen constraint with capitalized "Gen"', () => {
    expect(buildPromptText([GEN2])).toBe('Name a Gen 2 Pokemon');
  });

  it('joins two type constraints with a slash into one "X/Y type" clause', () => {
    expect(buildPromptText([FIRE, FLYING])).toBe('Name a Fire/Flying type Pokemon');
  });

  it('re-emits constraints in a FIXED order regardless of input order (gen before type)', () => {
    const forward = buildPromptText([GEN2, FIRE]);
    const reversed = buildPromptText([FIRE, GEN2]);
    expect(forward).toBe('Name a Gen 2 Fire type Pokemon');
    expect(reversed).toBe(forward); // input order must not change the header
  });

  it('orders every dimension canonically: gen, legendary, stage, dual, type, superEffective... (independent of input order)', () => {
    // A deliberately scrambled input; output must follow the code's fixed sequence.
    const scrambled: QuizConstraint[] = [
      SR_SPATK,
      FIRE,
      { kind: 'evolutionStage', stage: 'final' },
      GEN2,
      LEGEND,
    ];
    expect(buildPromptText(scrambled)).toBe(
      'Name a Gen 2 Legendary fully evolved Fire type top 20 in Sp. Atk Pokemon',
    );
  });

  it('uses LOWERCASE prose for evolution stage, dual-type, super-effective and stat-rank', () => {
    expect(buildPromptText([{ kind: 'evolutionStage', stage: 'base' }])).toBe(
      'Name a unevolved Pokemon',
    );
    expect(buildPromptText([{ kind: 'evolutionStage', stage: 'middle' }])).toBe(
      'Name a middle evolution Pokemon',
    );
    expect(buildPromptText([DUAL])).toBe('Name a dual-type Pokemon');
    expect(buildPromptText([MONO])).toBe('Name a mono-type Pokemon');
    expect(buildPromptText([SE_WATER])).toBe('Name a strong against Water Pokemon');
    expect(buildPromptText([SR_SPATK])).toBe('Name a top 20 in Sp. Atk Pokemon');
  });

  it('includes legendary/mythical only when value is true (the only value the live pool emits)', () => {
    expect(buildPromptText([LEGEND])).toBe('Name a Legendary Pokemon');
    expect(buildPromptText([MYTH])).toBe('Name a Mythical Pokemon');
    // A value:false legendary is not part of the visible prose (never emitted live).
    expect(buildPromptText([{ kind: 'legendary', value: false }])).toBe('Name a  Pokemon');
  });
});

describe('constraintToLabel — banner checklist row / feedback label', () => {
  it('formats each constraint kind with capitalized, bullet-style wording', () => {
    expect(constraintToLabel(GEN2)).toBe('Gen 2');
    expect(constraintToLabel(FIRE)).toBe('Fire type');
    expect(constraintToLabel(LEGEND)).toBe('Legendary');
    expect(constraintToLabel(MYTH)).toBe('Mythical');
    expect(constraintToLabel(SE_WATER)).toBe('Strong against Water');
  });

  it('labels all three evolution stages with their capitalized names', () => {
    expect(constraintToLabel({ kind: 'evolutionStage', stage: 'base' })).toBe('Unevolved');
    expect(constraintToLabel({ kind: 'evolutionStage', stage: 'middle' })).toBe('Middle evolution');
    expect(constraintToLabel({ kind: 'evolutionStage', stage: 'final' })).toBe('Fully evolved');
  });

  it('labels dual/mono type from the boolean value', () => {
    expect(constraintToLabel(DUAL)).toBe('Dual-type');
    expect(constraintToLabel(MONO)).toBe('Mono-type');
  });

  it('maps every stat name to its short display label in the "Top N <stat>" form', () => {
    const stat = (s: QuizConstraint & { kind: 'statRank' }) => constraintToLabel(s);
    expect(stat({ kind: 'statRank', stat: 'hp', topN: 20 })).toBe('Top 20 HP');
    expect(stat({ kind: 'statRank', stat: 'attack', topN: 20 })).toBe('Top 20 Attack');
    expect(stat({ kind: 'statRank', stat: 'defense', topN: 20 })).toBe('Top 20 Defense');
    expect(stat({ kind: 'statRank', stat: 'sp_attack', topN: 20 })).toBe('Top 20 Sp. Atk');
    expect(stat({ kind: 'statRank', stat: 'sp_defense', topN: 20 })).toBe('Top 20 Sp. Def');
    expect(stat({ kind: 'statRank', stat: 'speed', topN: 20 })).toBe('Top 20 Speed');
  });

  it('labels legendary regardless of value (unlike buildPromptText, which hides value:false)', () => {
    // The row-label formatter always names the dimension; only the header prose gates on value.
    expect(constraintToLabel({ kind: 'legendary', value: false })).toBe('Legendary');
  });
});

describe('the two formatters diverge on purpose (a dedup refactor would break the UI)', () => {
  it('stage/dual/superEffective/statRank differ in casing and phrasing between header and row', () => {
    const stage: QuizConstraint = { kind: 'evolutionStage', stage: 'final' };
    // header prose is lowercase; the row label is capitalized
    expect(buildPromptText([stage])).toBe('Name a fully evolved Pokemon');
    expect(constraintToLabel(stage)).toBe('Fully evolved');

    // dual-type: lowercase in header, capitalized in row
    expect(buildPromptText([DUAL])).toContain('dual-type');
    expect(constraintToLabel(DUAL)).toBe('Dual-type');

    // super-effective: casing differs on "strong"/"Strong"
    expect(buildPromptText([SE_WATER])).toContain('strong against Water');
    expect(constraintToLabel(SE_WATER)).toBe('Strong against Water');

    // stat-rank: header inserts "in", the row does not
    expect(buildPromptText([SR_SPATK])).toContain('top 20 in Sp. Atk');
    expect(constraintToLabel(SR_SPATK)).toBe('Top 20 Sp. Atk');
  });
});
