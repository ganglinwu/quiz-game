# Quiz Mode — Bug Report

_Static code audit + SQLite verification against `assets/quiz.db`. No app run (no simulator in this environment); every finding below is traced through code and confirmed against the real data._

Bug #1 from the original request (evolution-stage classification ignoring the active generation, e.g. Pikachu being treated as "middle" because of Pichu) was **already fixed** in the previous iteration (commit `c75bcf1`). That fix was re-verified and holds — see "What I verified as correct" at the bottom.

This report covers the **other bugs** found while tracing the quiz-mode code paths.

## Summary

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 1 | **"Type Pairing: Mono / Dual" filter is completely ignored** | High | Confirmed |
| 2 | **Pre-game filters (no-legendary / no-mythical) are NOT enforced on answers** | High | Confirmed |
| 3 | **Selecting a single Evolution Stage filter does nothing** | Medium | Confirmed |
| 4 | Type / Stat / multi-stage filters only *bias the question pool*, they don't restrict answers | Low (design) | Confirmed |
| 5 | "Strong against X" questions ignore the Type filter | Low (design) | Confirmed |

**Root cause for #1, #2, #4:** answer validation (`validateAnswerPerConstraint`) only checks the per-question *constraints*. It never sees the pre-game *filter* at all — the function signature doesn't even take it (`quizQuestionGenerator.ts:341`). And the baseline-query builder (`buildBaselineQuery`, `quizQuestionGenerator.ts:56`) only applies the legendary/mythical filters, not dual-type. So filters either aren't applied when the question pool is built, aren't re-checked when an answer is graded, or both.

---

## Bug 1 — "Type Pairing: Mono / Dual" filter is completely ignored (High)

**Where:** `src/utils/quizQuestionGenerator.ts:105-108` (pool) and `:56-68` (baseline).

**What happens:** In Filters → *Type Pairing* you can pick **Any / Mono / Dual**. Picking **Mono** or **Dual** has zero effect on the quiz.

**Why:** `allowDualType` is read in exactly one place:

```ts
// buildConstraintPool
if (filter.allowDualType === undefined) {        // only when "Any"
  pool.push({ kind: 'dualType', value: true });
  pool.push({ kind: 'dualType', value: false });
}
```

When the user picks Mono (`false`) or Dual (`true`), the code *removes* dual-type from the per-question constraint pool — clearly intending to apply it globally instead — but `buildBaselineQuery` never adds it to the baseline. So nothing enforces it: not at question generation, not at answer validation. `grep allowDualType src/` shows it's used nowhere else.

**Repro (click-through):** Home → Quiz Mode on → Filters → Type Pairing = **Mono** → start a Gen-1 quiz. Get a "Fire type" question and answer **Charizard** (Fire/**Flying**, a dual-type). It is accepted even though you asked for mono-type only.

**Evidence (`assets/quiz.db`):** dual-type Fire Pokémon in Gen 1 that a "Mono + Fire" quiz wrongly accepts:

```
Charizard  fire/flying
Moltres    fire/flying
```

**Recommended fix (low risk):** apply the filter in the baseline so it covers both generation and validation:

```ts
// buildBaselineQuery, alongside the legendary/mythical lines
if (filter.allowDualType !== undefined) query.isDualType = filter.allowDualType;
```

`queryPokemon` already supports `isDualType` (`pokemon-db.ts:232-236`). Because the baseline flows into both `generateQuestion` and the answer pool, this single line fixes generation. Validation still needs Bug 2's fix to be fully airtight, but generation alone gets you 90% there.

---

## Bug 2 — Pre-game filters are not enforced when grading an answer (High)

**Where:** `src/utils/quizQuestionGenerator.ts:341` (`validateAnswerPerConstraint`) and `src/screens/GameScreen.tsx:200-228` (the accept/reject gate).

**What happens:** Turn OFF "Include Legendary" (or "Include Mythical") in Filters. Questions are *generated* without legendaries (good), but if a player simply **names a legendary that fits the visible constraints, it's accepted** — the filter is silently bypassed.

**Why:** the accept/reject decision is `feedback.every(f => f.passed)` where `feedback = validateAnswerPerConstraint(item, question, activeGens)`. That function only iterates `question.constraints` (gen + type + …). It is never passed the `filter`, so it can't know legendaries are disallowed. The exclusion exists only in the *generation* baseline (`buildBaselineQuery`), never in *validation*.

**Repro (click-through):** Home → Quiz Mode → Filters → toggle **Legendary OFF** → Gen-1 quiz. Question: "Name a Psychic type Pokémon." Answer **Mewtwo**. Validation checks Gen 1 ✓ and Psychic ✓ → **accepted**, despite "no legendaries". The banner shows no legendary row, so it doesn't even look wrong to the player.

**Evidence (`assets/quiz.db`):** Gen-1 legendaries/mythicals that slip through when excluded:

```
Articuno  ice/flying      legendary
Zapdos    electric/flying legendary
Moltres   fire/flying     legendary
Mewtwo    psychic         legendary
Mew       psychic         mythical
```

**Recommended fix (medium risk — touches the grading gate):** pass the `filter` into `validateAnswerPerConstraint` and add feedback rows / pass-checks for any active baseline filter (legendary, mythical, dual-type). This is the *same root cause* as Bug 1, so a unified fix is ideal:

- Give `validateAnswerPerConstraint` the `filter` argument.
- After the constraint loop, if `!filter.includeLegendary` push `{ label: 'Not legendary', passed: <pokemon is not legendary> }`, similarly for mythical and `allowDualType`.
- These extra rows feed `feedback.every(...)`, so a disallowed Pokémon is rejected. The banner already renders all rows generically, so this needs no banner change.

Decision needed from you: should these baseline filters show as **visible constraint rows** in the question banner (so the player knows "no legendaries"), or stay invisible and only reject on submit? I'd lean toward visible — silent rejection of a type-correct answer is confusing.

---

## Bug 3 — Selecting a single Evolution Stage filter does nothing (Medium)

**Where:** `src/utils/quizQuestionGenerator.ts:95-103`.

**What happens:** In Filters → *Evolution Stage*, selecting exactly one stage (e.g. only **Final**, "fully evolved only" per the README) has **no effect** — base and middle Pokémon are still valid answers.

**Why:**

```ts
const stages = filter.evolutionStages?.length ? filter.evolutionStages : ['base','middle','final'];
if (stages.length > 1) {                 // <-- single selection is skipped entirely
  for (const stage of stages) pool.push({ kind: 'evolutionStage', stage });
}
```

A single-stage selection is dropped from the pool by the `length > 1` guard, and the baseline never applies evolution stage either. So "Final only" is a no-op. (Contrast: a single *type* selection still gets pushed as a constraint, so the two filters behave inconsistently.)

**Repro (click-through):** Filters → Evolution Stage = **Final** only → Gen-1 quiz → "Fire type" question → answer **Charmander** (unevolved). Accepted, despite "fully evolved only".

**Evidence (`assets/quiz.db`):** base-stage Fire Pokémon in Gen 1 wrongly accepted under "Final only": `Charmander, Vulpix, Growlithe, Ponyta`.

**Recommended fix:** because evolution stage is *generation-relative* (the whole theme of the iteration-1 fix) and a multi-select, the clean fix is to let the baseline carry the selected stages and teach `queryPokemon` to accept an **array** of stages (currently `evolutionStage` is a single value). Then drop the `length > 1` guard. This also improves Bug 4 for stages. Larger change — worth discussing scope before implementing.

---

## Bug 4 — Type / Stat / multi-stage filters only bias the question pool (Low / design)

The README frames filters as restricting "the question pool," and indeed `types`, `stats`, and a 2-of-3 `evolutionStages` selection only control **which constraints can appear in a question** — they do **not** globally restrict answers. Consequences a user may not expect:

- "Fire/Water only" quiz, easy difficulty: a question can be "Name a Legendary Pokémon" (no type constraint) and accept any-type Mewtwo.
- Evolution Stage = Base + Middle (excluding Final): a plain "Fire type" question still accepts Charizard (final).

This matches the documented design, so it's listed as **design, not a defect** — but the Filters UI gives no hint of it, and combined with Bugs 1–3 the overall impression is "filters don't work." Worth a product decision: should filters be hard answer-restrictions, or pool-biasers? The fix for Bug 2 naturally makes them hard restrictions if you want that.

---

## Bug 5 — "Strong against X" questions ignore the Type filter (Low / design)

**Where:** `src/utils/quizQuestionGenerator.ts:110-114`.

`superEffective` constraints for **all** target types are added to the pool regardless of `filter.types`. So a "Fire/Water only" quiz can still produce "Strong against Dragon" and accept an Ice/Dragon/Fairy Pokémon — types the user excluded. Same family as Bug 4; only relevant if you decide filters should be hard restrictions.

---

## What I verified as correct (audit coverage)

- **Iteration-1 fix holds:** gen-scoped base/middle/final partition (Gen-1: 79 base + 16 middle + 56 final = 151 ✓), and `validateAnswerPerConstraint` gen-scopes both `statRank` and `evolutionStage`.
- **Banner ↔ feedback alignment:** `QuizQuestionBanner.displayRows` and `validateAnswerPerConstraint` prepend the implicit-gen row under the same condition and iterate `question.constraints` in the same order, so `feedback[i]` lines up with each row (no off-by-one when the ✓/✗ shows).
- **Answer matching:** fuzzy-match thresholds and cross-gen detection in quiz mode are correct; duplicates are caught before matching; used items are excluded from generation, hints, and matching.
- **Difficulty auto-degrade** (hard→medium→easy→exhausted) and `areCompatible` (≤2 types, no superEffective+type, no superEffective+statRank, mono blocks 2 types) behave as intended.
- **Hardcore mode** correctly suppresses feedback rows and the "N possible" count on wrong answers, and the quiz turn flow (per-turn question regen, reject-keeps-turn, give-up elimination, pool-exhausted draw) is sound.

## Suggested priority

1. **Bug 1** — one-line baseline fix, immediate win.
2. **Bug 2** — unify with Bug 1 by passing `filter` into validation; needs your call on visible-vs-silent rows.
3. **Bug 3** — needs the `evolutionStage`-as-array change; bundle with Bug 4 if you want filters to be hard restrictions.
4. **Bugs 4 & 5** — product decision first (pool-bias vs hard restriction), then mechanical.
