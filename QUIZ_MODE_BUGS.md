# Quiz Mode — Bug Report

_Static code audit + SQLite verification against `assets/quiz.db`. No app run (no simulator in this environment); every finding below is traced through code and confirmed against the real data._

Bug #1 from the original request (evolution-stage classification ignoring the active generation, e.g. Pikachu being treated as "middle" because of Pichu) was **already fixed** in the previous iteration (commit `c75bcf1`). That fix was re-verified and holds — see "What I verified as correct" at the bottom.

This report covers the **other bugs** found while tracing the quiz-mode code paths. The original request also asked me to "click through the app and see if you find any other bugs," so a **whole-app pass beyond quiz mode** has been added at the bottom — see **[Whole-app pass (beyond quiz mode)](#whole-app-pass-beyond-quiz-mode)**, which includes a **High-severity** broken-feature bug (the "Remove generation" button — **now fixed**: removal was structurally impossible and an approved "remove" vote duplicated the gen, e.g. header `Gen 1, 2, 2`; a real `add`/`remove` discriminator now makes the existing vote actually remove the generation). Four further passes follow it: a **[Pokédex & card-modal pass](#pokédex--card-modal-pass-ui-subsystems)** (Bugs 10–14 — **Bug 10 now fixed**: the Pokédex search box was silently ignored whenever a stat filter was active, search now narrows the stat-ranked list too; **Bug 11 now fixed**: the card modal's evolution-member fetch is now cancellation-guarded so a stale response can't show one Pokémon's stats under another's name/artwork; **Bug 12 now fixed**: a failed PokeAPI fetch now shows an explicit "Couldn't load — tap to retry" error card (with an `r.ok` check so non-OK HTTP responses are treated as failures) instead of a blank fake "normal-type" card; **Bug 13 re-classified as masked** — a genuine `NetworkImage` code smell that a full call-site audit shows never actually manifests today; **Bug 14 now fixed** — `PlayerSetupScreen` no longer mutates the route-param `generations` array in place during render), a **[Voice input pass](#voice-input-pass-micbutton--speech-recognition)** (Bugs 15–16, verified against the `expo-speech-recognition` native iOS source — **now both fixed**: the mic no longer soft-locks on an unrecognized utterance and a release-before-start no longer orphans a recognition session), an **[Evolution-chain display pass](#evolution-chain-display-pass-your-original-example-in-the-card-modal)** (Bug 17) — most relevant to your original complaint — and a **[Core reducer / turn-order pass](#core-reducer--turn-order-pass-the-game-state-machine)** (Bug 18), which audits the game state machine itself and found — and **now fixes** — a **gameplay** bug: in a 3+ player game, a mid-order player giving up sent the turn to the wrong player. **Bug 17 was your exact example resurfacing**: the Pokémon card modal still showed `Pichu → Pikachu → Raichu` in a Gen-1 context, because the iteration-1 fix corrected quiz-mode *stage classification* but the card modal's *displayed chain* was never gen-scoped. **Bug 17 is now fixed** — the card modal's evolution chain is generation-scoped, so a Gen-1 context shows `Pikachu → Raichu`. See the [Bug 17 section](#bug-17--card-modal-evolution-chain-ignores-the-active-generation-medium) for the implementation and verification.

## Summary

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 1 | **"Type Pairing: Mono / Dual" filter is completely ignored** | High | **Fixed** (generation) — validation gap is Bug 2 |
| 2 | **Pre-game filters (no-legendary / no-mythical) are NOT enforced on answers** | High | Confirmed |
| 3 | **Selecting a single Evolution Stage filter does nothing** | Medium | **Fixed** (single-stage generation) — multi-stage + validation gap remain |
| 4 | Type / Stat / multi-stage filters only *bias the question pool*, they don't restrict answers | Low (design) | Confirmed |
| 5 | "Strong against X" questions ignore the Type filter | Low (design) | Confirmed |

**Root cause for #1, #2, #3, #4:** answer validation (`validateAnswerPerConstraint`) only checks the per-question *constraints*. It never sees the pre-game *filter* at all — the function signature doesn't even take it (`quizQuestionGenerator.ts:357`). The baseline-query builder (`buildBaselineQuery`, `quizQuestionGenerator.ts:56`) now applies legendary, mythical, dual-type (Bug 1 fix) **and** a single evolution-stage selection (Bug 3 fix), but those baseline filters are still only honored at *generation*, never re-checked when an answer is *graded*. So the remaining defect (Bug 2) is purely on the validation side: every baseline filter shapes the question pool correctly but a hand-typed answer that fits the visible constraints can still slip past a disallowed legendary/mythical/dual-type/wrong-stage Pokémon.

---

## Bug 1 — "Type Pairing: Mono / Dual" filter is completely ignored (High)

**Where:** `src/utils/quizQuestionGenerator.ts:121-124` (pool) and `:56-84` (baseline).

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

**Fix applied (generation path, low risk).** The filter is now applied in the baseline, alongside the legendary/mythical lines (`buildBaselineQuery`, `quizQuestionGenerator.ts:71`):

```ts
// Mono/Dual is a global filter like legendary/mythical: dropped from the
// per-question constraint pool, applied here so it restricts the whole pool.
if (filter.allowDualType !== undefined) query.isDualType = filter.allowDualType;
```

`queryPokemon` already supports `isDualType` (`pokemon-db.ts:252-256`). The baseline flows into `generateQuestion` and the answer/hint pool, so picking **Mono** now generates questions whose valid answers are mono-type only (and **Dual** → dual-type only) — `allowDualType` behaves exactly like the `includeLegendary`/`includeMythical` baseline filters. **Any** is unchanged (the filter stays unset, so a "Mono-type"/"Dual-type" constraint can still appear as a per-question banner row).

**Verification.** `npx tsc --noEmit` passes. DB-checked against `assets/quiz.db` that the restriction never starves the generator: Gen-1 has 84 mono / 67 dual Pokémon, a Mono+Fire question keeps 10 valid answers (Charizard/Moltres now correctly excluded), and a Mono "Strong against Grass" question keeps 23 — every realistic combo stays non-empty, and any genuinely-impossible combo (e.g. a 2-type question under Mono) is dropped by the existing empty-pool guard (`generateQuestion`, `:327`) rather than crashing.

**Residual gap (Bug 2, not yet fixed):** generation now respects Mono/Dual, but **answer validation still doesn't** — `validateAnswerPerConstraint` never receives the filter, so a player can still *answer* dual-type Charizard on a Mono "Fire type" question and have it accepted. This is the same root cause as Bug 2 (legendary/mythical have the identical validation gap) and is left for the visible-vs-silent product decision below — `allowDualType` is now exactly parallel to the legendary/mythical filters: applied in the baseline, not yet re-checked at grading.

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

**Where:** `src/utils/quizQuestionGenerator.ts:111-119` (pool) and `:56-84` (baseline).

**What happens:** In Filters → *Evolution Stage*, selecting exactly one stage (e.g. only **Final**, "fully evolved only" per the README) had **no effect** — base and middle Pokémon were still valid answers.

**Why:**

```ts
const stages = filter.evolutionStages?.length ? filter.evolutionStages : ['base','middle','final'];
if (stages.length > 1) {                 // <-- single selection is skipped entirely
  for (const stage of stages) pool.push({ kind: 'evolutionStage', stage });
}
```

A single-stage selection is dropped from the pool by the `length > 1` guard (so it can be applied globally instead), but `buildBaselineQuery` never applied evolution stage either. So "Final only" was a no-op. (Contrast: a single *type* selection still gets pushed as a constraint, so the two filters behaved inconsistently.) This is **structurally the same bug as Bug 1** (Mono/Dual): a filter dropped from the per-question pool with the clear intent of applying it as a global baseline, but the baseline never picked it up.

**Repro (click-through):** Filters → Evolution Stage = **Final** only (tap **Base** and **Middle** off — the chips default to all-active) → Gen-1 quiz → "Fire type" question → answer **Charmander** (unevolved). Was accepted, despite "fully evolved only".

**Evidence (`assets/quiz.db`):** base-stage Fire Pokémon in Gen 1 that "Final only" wrongly accepted: `Charmander, Vulpix, Growlithe, Ponyta` (plus middle-stage `Charmeleon`).

**Fix applied — single-stage (generation path, low risk).** The fix is exactly parallel to Bug 1: a single-stage selection is now applied in the baseline (`buildBaselineQuery`, `quizQuestionGenerator.ts:80-82`):

```ts
// A single evolution-stage selection ("fully evolved only") is the same shape of
// global filter as Mono/Dual: buildConstraintPool's `length > 1` guard drops it
// from the per-question pool, so it's applied here to restrict the whole pool.
if (filter.evolutionStages && filter.evolutionStages.length === 1) {
  query.evolutionStage = filter.evolutionStages[0];
}
```

`queryPokemon` already supports a single `evolutionStage` and **gen-scopes it** (the iteration-1 fix, `pokemon-db.ts:214-250`), and the baseline sets `generations: activeGens`, so "Final only" now restricts the generated-question/hint pool to *gen-relative* final-stage Pokémon — Pikachu counts as a valid "fully evolved" answer in a Gen-1 quiz even though Pichu→Pikachu→Raichu exists, because Pichu is Gen 2. **Any/all-stages** is unchanged (filter unset → no restriction), and a **multi-stage** selection is deliberately left untouched (see below).

**Verification.** `npx tsc --noEmit` passes. DB-checked against `assets/quiz.db`: "Final only" + Fire in Gen 1 now yields exactly the 5 final-stage Fire Pokémon `{Charizard, Ninetales, Arcanine, Rapidash, Flareon}`, correctly excluding base Charmander/Vulpix/Growlithe/Ponyta, middle Charmeleon, and the gen-relative-base Magmar/Moltres (their Gen-1 chains have no in-gen parent). The restriction never starves the generator: every Gen-1 type except `dark` (which has no Gen-1 members at all) has ≥1 final-stage Pokémon, statRank intersections stay healthy (e.g. Final ∩ Top-20 Attack = 13), and the rare empty combo is dropped by the existing empty-pool guard (`generateQuestion`, `:327`).

**Still open — multi-stage + validation gap.**

- *Multi-stage selection* (e.g. Base **and** Middle, excluding Final) still only **biases the question pool** (it stays in the per-question constraint pool), it does not hard-restrict answers — that's the same pool-bias-vs-hard-restriction design question as **Bug 4**, and turning it into a hard restriction needs `queryPokemon` to accept an **array** of stages plus the `length > 1` guard dropped. Left for the product decision.
- *Validation gap* — like Bug 1, the single-stage fix is on the *generation* path only; `validateAnswerPerConstraint` never receives the filter, so a player can still *type* a base-stage Pokémon on a non-stage question under "Final only" and have it accepted. This is the same unified **Bug 2** validation gap (now covering legendary, mythical, dual-type, **and** single-stage evolution).

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

- **Iteration-1 fix holds:** gen-scoped base/middle/final partition (Gen-1: 79 base + 16 middle + 56 final = 151 ✓), and `validateAnswerPerConstraint` gen-scopes both `statRank` and `evolutionStage`. **Now regression-tested at the grading gate** (`src/utils/quizAnswerValidation.vitest.ts`): a Gen-1 "Fully evolved" question rejects Pikachu (gen-relative base, because Pichu is Gen 2) and accepts Raichu, while "Unevolved" accepts Pikachu and rejects Raichu; across all gens the same Pikachu flips to "middle" — proven non-tautological by reverting the iteration-1 gen-scoping in `queryPokemon` and watching the Pikachu-base assertion fail. (Complements `pokemon-db.vitest.ts`, which pins the same fix at the `queryPokemon` level.)
- **Banner ↔ feedback alignment:** `QuizQuestionBanner.displayRows` and `validateAnswerPerConstraint` prepend the implicit-gen row under the same condition and iterate `question.constraints` in the same order, so `feedback[i]` lines up with each row (no off-by-one when the ✓/✗ shows). **Now regression-tested** (`src/utils/quizAnswerValidation.vitest.ts`): the feedback label sequence is pinned for the implicit-gen, multi-gen (`Gen 1, 2`), explicit-gen-constraint, and two-constraint cases, plus the gen-row enforcement (a Gen-2 Psychic answer fails only the `Gen 1` row on a Gen-1 Psychic question), so a reorder or changed gen-prepend condition is caught.
- **Answer matching:** fuzzy-match thresholds and cross-gen detection in quiz mode are correct; duplicates are caught before matching; used items are excluded from generation, hints, and matching. **Now regression-tested** (`src/utils/fuzzyMatch.vitest.ts`): the anti-gaming threshold design (exact-only ≤3 chars, dist ≤1 for 4-5, ≤2 for 6+), the real-DB alias bypass (`he can`→Ekans, `volt orb`→Voltorb), `findDuplicate`, used-item exclusion, and the active→all-gens fallback that tags an inactive-gen Pokémon with its generation (the gen-vote trigger) — proven non-tautological by loosening the thresholds and watching the tight-threshold tests fail.
- **Difficulty auto-degrade** (hard→medium→easy→exhausted) and `areCompatible` (≤2 types, no superEffective+type, no superEffective+statRank, mono blocks 2 types) behave as intended. **Now regression-tested** (`src/utils/quizGeneration.vitest.ts`): `areCompatible` has exact per-rule coverage; `generateQuestion` is checked via output invariants over many randomized runs (every result is internally compatible, has ≤ the requested constraint count, and a real non-empty answer pool that matches `validAnswerCount`); and the auto-degrade is pinned by a structurally-forced scenario (a pool that can't form any 2-constraint combo deterministically degrades `hard`→`easy`). Proven non-tautological by mutation — removing the `superEffective+type` rule or loosening the single-stage pool guard fails exactly the dependent tests. `buildConstraintPool` is also characterization-tested, which pins the **gated** boundaries the report documents (single-stage dropped vs. multi-stage kept in the pool for **Bug 3**; Mono/Dual dropped for **Bug 1**; and **Bug 5** — `superEffective` targets stay in the pool regardless of the type filter), so any future change to those product-gated boundaries is surfaced explicitly.
- **Hardcore mode** correctly suppresses feedback rows and the "N possible" count on wrong answers, and the quiz turn flow (per-turn question regen, reject-keeps-turn, give-up elimination, pool-exhausted draw) is sound.

## Suggested priority

1. ~~**Bug 1** — one-line baseline fix, immediate win.~~ **Done** (generation path). Mono/Dual now restricts generated questions + hints; only the validation side (Bug 2) remains.
2. ~~**Bug 3 (single-stage)** — same one-line baseline pattern as Bug 1.~~ **Done** (generation path). "Fully evolved only" (and any single-stage pick) now restricts generated questions + hints, gen-relative; only the validation side (Bug 2) and the multi-stage case (Bug 4) remain.
3. **Bug 2** — pass `filter` into validation so legendary/mythical/**dual-type**/**single-stage evolution** are re-checked at grading; needs your call on visible-vs-silent rows. (After Bugs 1 & 3, all four baseline filters share this single unified validation gap.)
4. **Bug 3 (multi-stage) & Bugs 4 & 5** — product decision first (pool-bias vs hard restriction); multi-stage additionally needs `evolutionStage`-as-array support in `queryPokemon`, then mechanical.

---

# Whole-app pass (beyond quiz mode)

The original request was "click through the app and see if you find any other bugs." The quiz-mode bugs above are all in the question-generation/validation logic. This section covers the rest of the app (the normal Pokémon mode, the result screen, stats). Each finding is traced through code; data-dependent claims are checked against `assets/quiz.db`.

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 6 | **"Remove generation" button doesn't remove — it re-adds the gen (duplicate) and the vote even says "Add"** | **High** | **Fixed** |
| 7 | `state.activeGenerations.sort()` mutates reducer state during render | Low | **Fixed** |
| 8 | Per-turn stats: a give-up inflates the next player's turn time | Low | **Fixed** (give-up bleed) |
| 9 | "Try these next time!" post-game suggestions ignore the quiz filters | Low (design) | Confirmed |

---

## Bug 6 — "Remove generation" is completely broken (High)

**Where:** `src/screens/GameScreen.tsx:519-531` (the modal wiring), `src/state/gameReducer.ts:152-171` & `:204-266` (`PROPOSE_GEN_CHANGE` / `CAST_GEN_VOTE`), `src/types/index.ts:129` (the action type), `src/components/GenerationVoteOverlay.tsx:25,28` (the overlay text).

**What happens:** In normal Pokémon mode (not quiz), the ⚙ settings modal (`GenerationSettingsModal`) offers an **Add** and a **Remove** button per generation. Clicking **Remove** never removes the generation. Worse: if the vote passes, the generation gets **duplicated** in the active set and the header shows e.g. `Pokemon Gen 1, 2, 2`.

**Why:** both buttons dispatch the *same* action with no add/remove discriminator:

```ts
// GameScreen.tsx:525-530
onProposeAdd={(gen) =>
  dispatch({ type: 'PROPOSE_GEN_CHANGE', generation: gen, triggerPokemon: null, source: 'settings' })
}
onProposeRemove={(gen) =>
  dispatch({ type: 'PROPOSE_GEN_CHANGE', generation: gen, triggerPokemon: null, source: 'settings' })  // identical!
}
```

There is no `REMOVE_GEN` action in `GameAction` (`types/index.ts:129` lists only `PROPOSE_GEN_CHANGE` and `CAST_GEN_VOTE`), and the reducer's only mutation of the active set is an **append**:

```ts
// gameReducer.ts:227 (CAST_GEN_VOTE, vote approved)
const newGens = [...state.activeGenerations, state.pendingGenVote.generation];
```

Since **Remove** is only offered for a gen that is *already active* (`GenerationSettingsModal.tsx:36`: `canRemove = active && activeGenerations.length > 1 && !hasUsedItems`), approving the vote appends an already-present gen → a duplicate. And the vote overlay is hard-coded to ask **"Add Gen X?"** (`GenerationVoteOverlay.tsx:25,28`), so a player who pressed *Remove* is asked to *Add*.

**Repro (click-through):** Home → Pokémon, select **Gen 1 + Gen 2**, Quiz Mode **off** → start, don't name anything yet → tap ⚙ → tap **Remove** on Gen 2. A vote pops up reading **"Add Gen 2?"**. Vote **Yes** (all players). Result: Gen 2 is *not* removed; the header now reads `Pokemon Gen 1, 2, 2`. (Vote **No** also leaves Gen 2 active — so removal is impossible either way.)

**Evidence (`assets/quiz.db`):** `totalItems` is recomputed via `getPokemonForGens([1,2,2])` → `WHERE generation IN (1,2,2)`. SQL `IN` dedups, so the count is still correct (251 for Gen 1+2), which is exactly why the duplicate slips through silently in the data while showing up in the header label and in `activeGenerations`.

**Fix applied (option a — real remove-via-vote, honoring the existing vote-based UI).** The existing UI already routes *both* Add and Remove through `PROPOSE_GEN_CHANGE` → the vote overlay, so the design intent is unambiguous (removal is a voted change); it was just structurally impossible. The fix gives `PROPOSE_GEN_CHANGE`/`GenerationVote` an `action: 'add' | 'remove'` discriminator and makes the approved-vote branch act on it, rather than inventing a new direct-remove UX:

- `GenerationVote` (`types/index.ts:64`) and the `PROPOSE_GEN_CHANGE` action (`:130`) carry `action: 'add' | 'remove'`.
- `PROPOSE_GEN_CHANGE` stores `action` on `pendingGenVote` (`gameReducer.ts:171`); on an approved `CAST_GEN_VOTE` the active set is now computed by branch (`gameReducer.ts:237-240`):

  ```ts
  const newGens =
    state.pendingGenVote.action === 'remove'
      ? state.activeGenerations.filter((g) => g !== state.pendingGenVote!.generation)
      : [...state.activeGenerations, state.pendingGenVote.generation];
  ```

  `computeTotalItems` then recomputes against the shrunken set, so removal correctly shrinks the pool.
- `GameScreen.tsx`'s three dispatch sites pass `action`: auto-detect and `onProposeAdd` → `'add'`, `onProposeRemove` → `'remove'`.
- `GenerationVoteOverlay` derives a `verb` from `vote.action`, so a Remove proposal now reads **"Remove Gen X?"** instead of "Add Gen X?".

**Why this can't duplicate or orphan items:** add is only ever proposed for an *inactive* gen (the modal shows Add only when `!active`; auto-detect fires only when `!activeGenerations.includes(gen)`), so append never duplicates; remove is only ever offered for an *active* gen with `activeGenerations.length > 1` and **no items named from it** (`canRemove`, `GenerationSettingsModal.tsx:36`), so the `filter` always leaves ≥1 gen and can never drop a gen a used item belongs to (`usedItems.length ≤ newTotalItems` holds, so no spurious pool-exhaustion). Removal goes through the plain settings branch, which doesn't run the auto-detect exhaustion check anyway.

**Verification.** `npx tsc --noEmit` passes. Simulated the fixed `newGens` branch + verified pool sizes against `assets/quiz.db`: removing Gen 2 from `[1,2]` now yields `[1]` (151 Pokémon, header reads "Pokemon Gen 1") instead of the old broken append `[1,2,2]`; add still works (`[1,2]` + Gen 3 → `[1,2,3]`, 386); removing Gen 2 from `[1,2,3]` → `[1,3]`. The overlay verb flips to "Remove" for a remove proposal. **Now regression-tested** (`src/state/gameReducer.vitest.ts`): an approved remove vote on `[1,2]`/Gen 2 yields `[1]`/151 items (DB-backed), add still grows to `[1,2]`/251, and a rejected vote is a no-op — failing if the always-append regression returns (`[1,2,2]`/251).

---

## Bug 7 — `activeGenerations.sort()` mutates reducer state during render (Low)

**Where:** `src/screens/GameScreen.tsx:362`.

```ts
const categoryLabel = isPokemon
  ? `Pokemon Gen ${state.activeGenerations.sort((a, b) => a - b).join(', ')}`
  : 'Fruits';
```

`Array.prototype.sort` sorts **in place**, so this mutates the `activeGenerations` array held in reducer state, during render. Reducer state must be treated as immutable; mutating it during render is a React anti-pattern (can tear under StrictMode/concurrent rendering and makes the state object lie about its own contents). In practice it's currently benign because the sort is idempotent and query order doesn't matter — but it's latent, and it's what turns Bug 6's duplicate into the visible `1, 2, 2` ordering.

**Fix applied (one-line, behavior-preserving).** The array is now copied before sorting (`GameScreen.tsx:363`):

```ts
const categoryLabel = isPokemon
  ? `Pokemon Gen ${[...state.activeGenerations].sort((a, b) => a - b).join(', ')}`
  : 'Fruits';
```

`[...state.activeGenerations]` produces a fresh array, so `sort()` no longer touches reducer state. The displayed label is identical (same numeric sort, same join), so this is purely the removal of the render-time mutation hazard.

**Verification.** `npx tsc --noEmit` passes. A repo-wide grep for in-place `.sort()` on shared/state arrays confirms the only two genuine cases were this and Bug 14 (the `HomeScreen` sorts are on a fresh `Array.from(selectedGens)`, so they're safe).

---

## Bug 8 — A give-up inflates the next player's turn time in the stats (Low)

**Where:** `src/utils/statsCalculator.ts:8-15` (the differencing) and `src/state/gameReducer.ts` (`GIVE_UP` never reset the turn clock).

**What happened:** Turn time was computed as `thisRecord.timestamp - previousRecord.timestamp` — differencing adjacent turn records:

```ts
const turnTimes = turnRecords.map((record, i) => {
  const prevTime = i === 0 ? gameStartTime : turnRecords[i - 1].timestamp;
  return { player: record.player, time: record.timestamp - prevTime, item: record.item };
});
```

Because a give-up (or elimination) creates **no turn record**, the *next* player's recorded turn spanned all the way back to the last *successful* answer — so it silently absorbed the give-up deliberation time and was over-counted. (A 4-second turn that followed a player thinking for 12 seconds before quitting was logged as 16 seconds; see the verification below.) This only affected the end-of-game stats panel (cosmetic), hence Low — but it's a genuine accuracy bug with one unambiguous correct behavior, no product decision involved.

> _Note on the "first turn includes setup time" angle from earlier drafts:_ the first turn is measured from `gameStartTime`, but that **is** the moment player 1's turn begins (the game screen mounts straight into player 1's turn — there is no separate "setup done" event), so it's not a real inaccuracy. The fix preserves the first turn's value exactly and targets only the give-up bleed.

**Fix applied (low risk — uses the already-maintained `turnStartTime`).** The reducer already tracked `turnStartTime` (set at game start and reset on every confirm) but it was **dead state — set in three places, read nowhere**. The fix puts it to use:

- `TurnRecord` (`types/index.ts:52`) gains a `durationMs: number` — the wall-clock time the player actually spent on the turn, **captured at record creation** as `now - state.turnStartTime` (in both record-creating reducer paths: `CONFIRM_ITEM` and the auto-detect `CAST_GEN_VOTE`).
- `GIVE_UP` now resets `turnStartTime: Date.now()` in its continue branch (`gameReducer.ts`), so the next player's turn clock starts at the give-up rather than at the last successful answer — the give-up deliberation is charged to no one (the giver-upper completed no turn, so they correctly have no turn time).
- `statsCalculator` uses the stored `record.durationMs` instead of differencing adjacent timestamps. `timestamp` is retained on the record (the History modal still uses it for the time-of-day label).

**Why this changes nothing else:** for the first turn, `turnStartTime` equals `gameStartTime`, so `durationMs` is identical to the old `timestamp - gameStartTime`; for any two consecutive confirms with no give-up between them, `turnStartTime` equals the previous record's timestamp, so `durationMs` equals the old difference. The **only** value that changes is a turn that immediately follows a give-up — exactly the bug.

**Verification.** `npx tsc --noEmit` passes. A faithful simulation of the reducer accounting (`[A,B,C,D]`, with C deliberating 12 s then giving up before D's 4 s turn) confirms the post-give-up turn drops from the old **16 s** to the correct **4 s**, while every non-give-up turn (3 s, 5 s, 3 s) is byte-for-byte unchanged from the old model. **Now regression-tested** (`src/state/gameReducer.vitest.ts`, using `vi.setSystemTime` for deterministic clocks): a confirm records its own `durationMs`, and a give-up followed by a 2 s turn records 2 s — not the 6 s it would absorb if the give-up clock reset regressed.

---

## Bug 9 — Post-game "Try these next time!" suggestions ignore quiz filters (Low / design)

**Where:** `src/screens/GameScreen.tsx:330-343` (`pokemonItems` = `getPokemonForGens(activeGenerations)`).

When a quiz-mode game ends, the result screen pads its learning section with random unused Pokémon drawn from **all** active-gen Pokémon, with no regard for the quiz's filters. So a "no legendaries" quiz can still suggest a legendary, and a "Fire/Water only" quiz can suggest an Electric Pokémon, under "Try these next time!". Arguably fine (it's a general "learn more Pokémon" nudge, not a quiz answer), but it's inconsistent with the filters the player set, so it's flagged as a design call rather than a hard defect.

---

## Whole-app pass — what I verified as correct

- **Normal-mode generation *Add* flow** (auto-detect on naming an inactive-gen Pokémon, and manual Add) works: the vote tallies correctly (`yesCount > totalVoters / 2`, unanimity for 2 players), the trigger Pokémon is recorded and the turn advances on approval (`gameReducer.ts:231-258`).
- **Duplicate detection** (exact + alias, `findDuplicate`) runs before fuzzy matching and correctly short-circuits, with the voice "Show me when" path intact.
- **Hint/elimination/turn flow** in normal mode: hint countdown reveal, `revealedHints` cap of 5, bonus padding excluding used + already-hinted Pokémon, and one-countdown-at-a-time on the result screen (`countdownActive` gate) all behave as intended.
- **Fuzzy match thresholds** (0 / 1 / 2 by input length) and the active-then-all-gens fallback in `fuzzyMatchWithGenDetection` are correct; aliases that resolve to inactive-gen Pokémon flow into the gen-vote path in normal mode and into per-constraint rejection in quiz mode.

---

# Pokédex & card-modal pass (UI subsystems)

The two passes above cover quiz logic and the core Pokémon/result/stats flow. This third pass covers the standalone **Pokédex browser** (`PokedexScreen`, reachable from Home — note it isn't documented in `CLAUDE.md`) and the **Pokémon card modal** (`PokemonCardModal`, shared by the Pokédex and the result screen), plus the `NetworkImage` helper and player setup. These subsystems hadn't been audited before. Each finding below is traced through code; the network/data behaviour is reasoned from the code paths (no simulator/network in this environment).

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 10 | **Pokédex search box is silently ignored whenever a stat filter is active** | Medium | **Fixed** |
| 11 | Card modal: switching evolution members has no fetch cancellation — out-of-order responses can show the wrong Pokémon's stats | Low | **Fixed** |
| 12 | Card modal: a failed PokeAPI fetch renders a blank "normal-type" card with 0.0 m / 0.0 kg and no error/retry | Low | **Fixed** |
| 13 | `NetworkImage` doesn't reset on `uri` change — swapping artwork shows the previous image with no loader | Low | **Masked** (not reproducible in current usage) |
| 14 | `PlayerSetupScreen` mutates the route-param `category.generations` array in place during render (`.sort()`) | Low | **Fixed** |

---

## Bug 10 — Pokédex search is silently dropped when a stat filter is active (Medium)

**Where:** `src/screens/PokedexScreen.tsx:48-61` (the `pokemon` `useMemo`).

**What happens:** In the Pokédex, the search box and the stat chips (HP / Attack / … "Top 20") are both always visible. If you tap a stat chip and then type in the search box — or type first, then tap a stat — **the search text does nothing**. The list stays as the unfiltered "Top 20 <stat>" set, while the search box still shows your text as if it were filtering.

**Why:** the memo early-returns on `selectedStat` *before* the search filter is ever applied:

```ts
const pokemon = useMemo(() => {
  if (selectedStat) {
    return queryPokemon({                       // <-- returns here…
      generations: selectedGen ? [selectedGen] : undefined,
      statRank: { stat: selectedStat, topN: 20 },
    });
  }
  let list = selectedGen ? getPokemonForGens([selectedGen]) : getAllPokemon();
  if (search.trim()) {                          // <-- …so this is never reached
    const query = search.trim().toLowerCase();
    list = list.filter((p) => p.name.toLowerCase().includes(query));
  }
  return list;
}, [selectedGen, selectedStat, search]);
```

`search` is in the dependency array (so typing *does* recompute the memo), but the `selectedStat` branch discards the result. Generation + stat compose correctly (the gen is passed into `queryPokemon`); only **search** is the dropped dimension.

**Repro (click-through):** Home → Pokédex → tap **Attack** (list becomes "Top 20 Attack") → type `char` in the search box. Nothing filters; "Charizard" is not isolated. Clearing the stat chip makes search work again.

**Fix applied (low risk).** The `pokemon` memo no longer early-returns on `selectedStat`; the stat-ranked query is just one way of computing the base `list`, and the search filter is then applied to *whatever* list was produced:

```ts
const pokemon = useMemo(() => {
  let list = selectedStat
    ? queryPokemon({ generations: selectedGen ? [selectedGen] : undefined, statRank: { stat: selectedStat, topN: 20 } })
    : selectedGen ? getPokemonForGens([selectedGen]) : getAllPokemon();
  if (search.trim()) {
    const query = search.trim().toLowerCase();
    list = list.filter((p) => p.name.toLowerCase().includes(query));
  }
  return list;
}, [selectedGen, selectedStat, search]);
```

Searching within "Top 20 Attack" now searches *only those 20* (the stat chip stays highlighted, so this is the least-surprising behavior — the search narrows the visible stat-ranked set rather than silently clearing the chip). All three pre-existing paths (no-stat/no-search, no-stat/with-search, stat/no-search) are byte-for-byte equivalent to before; only the previously-broken stat+search combination changes.

**Verification.** `npx tsc --noEmit` passes. Traced all four filter combinations: only the stat-active + non-empty-search case differs from the old behavior, and it now applies the search filter that was previously discarded.

---

## Bug 11 — Card modal: no fetch cancellation when switching evolution members (Low)

**Where:** `src/components/PokemonCardModal.tsx:87-121` (the fetch `useEffect`) and `:123-126` (`switchToEvolution`).

**What happens:** The card modal shows an evolution chain you can tap through (Bulbasaur → Ivysaur → Venusaur). Tapping a member calls `setDisplayId`/`setDisplayName` *synchronously* (header name + artwork update instantly) and re-fires the PokeAPI fetch. If you tap members in quick succession on a slow/jittery connection, the responses can arrive **out of order**, and the older response overwrites the newer one — so the body (types, height/weight, stat bars, HP) shows the *wrong* Pokémon under the current name and artwork.

**Why:** the effect has no cleanup function, so the in-flight `Promise.all` for the previous `displayId` is never cancelled or ignored:

```ts
useEffect(() => {
  if (!visible) return;
  setLoading(true); setData(null); setFlavorText('');
  // …
  Promise.all([ fetch(`…/pokemon/${displayId}`)…, fetch(`…/pokemon-species/${displayId}`)… ])
    .then(([pokemon, species]) => { setData(…); setLoading(false); })
    .catch(() => setLoading(false));
  // no `return () => { cancelled = true }`
}, [visible, displayId]);
```

It's transient and self-corrects on the next interaction, hence **Low** — but it's a genuine stale-response race. (The cross-*open* variant doesn't apply: both call sites — `ResultScreen.tsx:189` and `PokedexScreen.tsx:177` — render the modal as `{selected && <PokemonCardModal … />}`, so it unmounts on close and remounts fresh each open.)

> **Note — the `loading` toggle does *not* mask this.** One might think the full-card `PokeballLoader` (`:154`) that shows while `loading` is true prevents the race, but it doesn't: each fetch's `.then` calls **both** `setData(...)` and `setLoading(false)`, so when the stale (older) response lands *after* the fresh one, it overwrites `data` and re-clears `loading` — the body then describes the old Pokémon under the new header/artwork. (Contrast **Bug 13** below, which the same `loading` toggle *does* mask, because that unmounts the artwork `NetworkImage` entirely.)

**Fix applied (standard, low risk).** The fetch effect now guards its `.then`/`.catch` with a `cancelled` flag set by the effect's cleanup, so a superseded request can no longer write state (`PokemonCardModal.tsx:93-135`):

```ts
useEffect(() => {
  if (!visible) return;
  let cancelled = false;
  setLoading(true); setData(null); setFlavorText('');
  // …meta + Promise.all([...])
    .then(([pokemon, species]) => {
      if (cancelled) return;          // ← stale response from a previous member: drop it
      setData(…); /* flavor */ setLoading(false);
    })
    .catch(() => { if (!cancelled) setLoading(false); });
  return () => { cancelled = true; };  // ← supersede the in-flight request on displayId change
}, [visible, displayId]);
```

Each `displayId` change runs the previous effect's cleanup (flipping its `cancelled` to `true`) before the new fetch starts, so whichever response lands last, only the **current** member's data is committed — header, artwork, and body now always agree. Closing the modal (`visible` false) also cancels cleanly.

**Verification.** `npx tsc --noEmit` passes. Traced both interleavings (old-resolves-last and new-resolves-last) through the per-run closure: the stale run's `.then` early-returns on its own `cancelled`, the fresh run commits normally; no double `setLoading(false)`, no cross-member `data`.

---

## Bug 12 — Card modal: a failed fetch shows a blank card, not an error (Low)

**Where:** `src/components/PokemonCardModal.tsx` (the fetch `useEffect` `.catch`, and the `loading`-toggle render branch).

**What happened:** When the PokeAPI request failed (offline, rate-limited, 404), the catch only flipped `loading` off and left `data` as `null`. The card then rendered its fallback values: a grey **normal**-type header, `HP ??`, no type badges, **0.0 m / 0.0 kg**, and no stat bars — looking like a broken/empty card with no error message and no retry. The same applied if `fetch` returned a non-OK status, since `r.json()` was called without an `r.ok` check, so a 404/429/5xx body was parsed and rendered into the same silent fallback.

**Fix applied (low risk).** A dedicated error state was added so a failed fetch surfaces an explicit, retryable error instead of a blank fallback card:

- New `error` and `retryToken` state. The fetch effect resets `error` to `false` on every run and the `.catch` now sets `error = true` (in addition to `setLoading(false)`), guarded by the existing `cancelled` flag so a superseded request can't flip it.
- Both fetches now go through a `fetchJson` helper that **throws on a non-OK status** (`if (!r.ok) throw new Error(...)`), so HTTP 404/429/5xx land in the error path instead of parsing an error body into the fallback card.
- The render gained an `error` branch (between the `loading` loader and the success `ScrollView`): a 📡 icon, "Couldn't load this Pokémon. / Check your connection.", and a **Tap to retry** button wired to `handleRetry`, which bumps `retryToken` — a dependency of the fetch effect — re-running the fetch (loader → success or error again).

The header still shows the known `displayName` over a neutral grey, so the error card is clearly identifiable rather than masquerading as a real "normal-type" Pokémon.

**Verification.** `npx tsc --noEmit` passes. Traced the three terminal paths: success (data committed, `error` stays false), reject/offline (`error` true → error view → retry re-fires the effect), and a superseded request during an evolution-member switch (`cancelled` short-circuits both `.then` and `.catch`, so a stale failure can't show an error over the current member). Success and error are mutually exclusive (`Promise.all` resolves xor rejects), so no stale data/error combination.

---

## Bug 13 — `NetworkImage` doesn't reset when its `uri` changes (Low / **masked — not reproducible in current usage**)

**Where:** `src/components/NetworkImage.tsx` (`loaded` state + `opacity` ref).

**The latent code smell is real:** `NetworkImage` tracks `loaded` (starts `false`, set `true` on the first `onLoad`) and fades the image in via an `opacity` Animated value. Neither is keyed to `uri`, so if the **same instance** ever received a new `uri`, `loaded` would stay `true` / `opacity` `1` and the **previous** artwork would linger with no loader until the new image downloaded.

**But a full call-site audit shows it never actually manifests today.** Every one of the five `NetworkImage` usages avoids the bad path:

- **Card modal — main artwork** (`PokemonCardModal.tsx:165`, uri = `getArtworkUrl(displayId)`): the uri *does* change when you tap an evolution member, **but** the `loading` toggle (`:154`) unmounts the entire `ScrollView` (and this `NetworkImage` with it) for the duration of the fetch, then remounts it fresh — so the instance never survives a uri change. _(This is the inverse of **Bug 11**: the same `loading` toggle that masks this stale-image glitch does **not** mask Bug 11's stale-data race, because Bug 11 is about `setData` after the toggle clears.)_
- **Card modal — chain thumbnails** (`:197`, uri = `getArtworkUrl(member.id)`): each thumbnail's `member.id` is fixed for the life of the chain row, so its uri never changes.
- **`HintOverlay.tsx:32`** and **`ResultScreen.tsx:63`** (silhouette ↔ revealed): both pass an explicit `key={isSilhouette ? … }` / `key={revealed ? … }`, which **forces a remount** on the only state change that matters (same uri, tint added/removed) — sidestepping the reset problem deliberately.
- **`PokedexScreen.tsx:71`** and **`ResultScreen.tsx:83`**: grid/list items with a stable per-item uri.

**Decision: left unfixed (not a live bug).** Because no call site exposes the bad path, adding the obvious reset (`useEffect(() => { setLoaded(false); opacity.setValue(0); }, [uri])`) would be a defensive no-op that changes no observable behavior — so per "don't touch code that isn't part of a real fix," it's deferred. It's worth keeping the one-line reset in mind **only if** a future change starts reusing a `NetworkImage` instance across uris without a `key` (e.g. dropping the card-modal `loading` full-card loader so the old card stays visible during the fetch) — that change would immediately make this manifest.

---

## Bug 14 — `PlayerSetupScreen` mutates route-param state during render (Low)

**Where:** `src/screens/PlayerSetupScreen.tsx:77` (and the non-quiz branch on the same expression).

```ts
`Pokemon Gen ${category.generations.sort().join(', ')}`
```

`Array.prototype.sort` sorts **in place**, so this mutates `category.generations` — an array that lives on the navigation route params — during render. Same anti-pattern family as **Bug 7** (`GameScreen.tsx:362`): currently benign (idempotent sort, order irrelevant) but it mutates shared state on the render path. The subtitle referenced it **twice** (the quiz and non-quiz ternary branches), so it mutated the route-param array on every render in either branch.

**Fix applied (behavior-preserving).** A single sorted-copy label is computed once at the top of the component and reused in both branches (`PlayerSetupScreen.tsx:32-36`):

```ts
const genLabel =
  category.type === 'pokemon'
    ? [...category.generations].sort().join(', ')
    : '';
```

The `category.type === 'pokemon'` guard is required because `Category` is a discriminated union (`generations` exists only on the pokemon variant), so an unconditional access fails type-narrowing. `[...category.generations]` copies before sorting, so the route-param array is no longer mutated; the existing (bare) comparator is preserved so the label is byte-for-byte identical (gens are single-digit, so lexicographic = numeric order).

**Verification.** `npx tsc --noEmit` passes (the union-narrowing guard resolves the `Property 'generations' does not exist on type '{ type: "fruits" }'` error a naïve top-level access would cause).

---

## Pokédex & card-modal pass — what I verified as correct

- **Pokédex generation + stat compose correctly:** `selectedGen` is passed into both `getPokemonForGens` and `queryPokemon(statRank)`, so "Gen 2 + Top 20 Speed" is genuinely Gen-2-scoped. (Search was the one dropped dimension when a stat filter was active — that was **[Bug 10](#bug-10--pokédex-search-is-silently-dropped-when-a-stat-filter-is-active-medium)**, now fixed, so all three dimensions compose.)
- **`'pokedex'` BGM track is registered** (`tracks.ts:8` → `yellow-opening.mp3`), so `useBGM('pokedex')` resolves and the `TRACK_REGISTRY.get(...) → if (!track) return` guard isn't hit.
- **Card modal evolution chain is built once from the family base** (`getEvolutionChain(pokemonId)` on open) and correctly *not* re-fetched when switching members — every member shares one chain, so the BFS-ordered list (Pichu→Pikachu→Raichu) stays stable while you tap through it. _(The **mechanics** here — one build, no re-fetch — are correct; but the chain's **content** is the full real-world chain regardless of the active generation, which is itself **[Bug 17](#evolution-chain-display-pass-your-original-example-in-the-card-modal)** — your original `Pichu→Pikachu→Raichu` complaint. I'd previously logged this as correct; Bug 17 is the correction.)_
- **Player-name validation** is sound: blanks default to `Player N`, the duplicate check is case-insensitive (`toLowerCase()`), and color assignment by index is safe (`PLAYER_COLORS` has ≥ `MAX_PLAYERS` entries).

---

# Voice input pass (MicButton / speech recognition)

The passes above cover game logic and the visual UI. This fourth pass covers the **voice input flow** — the push-to-hold `MicButton` (`src/components/MicButton.tsx`), the `expo-speech-recognition` event handling, and the `AudioManager` ↔ speech bridge. This subsystem had not been audited before. Unlike the data-dependent bugs above, these are verified against the **library's native iOS source** (`node_modules/expo-speech-recognition/ios/ExpoSpeechRecognitionModule.swift`), since the event semantics are the crux — no simulator was available in this environment.

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 15 | **MicButton ignores the `nomatch` and `end` events → mic sticks in the pulsing "listening" state, BGM stays paused, and the spoken word is silently dropped with no error** | Medium | **Fixed** (native source) |
| 16 | **`start()` runs after the permission `await` even if the button was already released → an orphaned recognition session keeps listening (auto-submits ambient audio; confusing first-run grant)** | Medium | **Fixed** |

---

## Bug 15 — `nomatch` / `end` events are unhandled, so voice input can soft-lock (Medium)

**Where:** `src/components/MicButton.tsx:108-134` (the only three `useSpeechRecognitionEvent` listeners: `audiostart`, `result`, `error`).

**What happens:** You hold the mic and make a sound the recognizer can't turn into words (a mumble, a noise, an unusual Pokémon name with no transcription). Nothing happens: **no answer, no "Didn't catch that" toast, the mic button keeps pulsing as if still listening, and the background music stays paused.** Pressing the mic again is the only way to recover.

**Why:** MicButton only resets its state (`setIsListening(false)`, `setMicPhase('idle')`) inside the `result` and `error` handlers. But iOS has two terminal outcomes that fire **neither**:

- **`nomatch`** — when speech recognition returns a final result with no significant recognition, the native module fires `nomatch` *and returns without firing `result`*:

  ```swift
  // ExpoSpeechRecognitionModule.swift:506-510  (isFinal && results.isEmpty)
  // The nomatch event ... is fired when the speech recognition service
  // returns a final result with no significant recognition.
  sendEvent("nomatch")
  return            // <-- no "result" event is sent
  ```
  `nomatch` is a declared event (`ExpoSpeechRecognitionModule.types.d.ts:120`) but MicButton has no listener for it, so the `result`/`error` reset logic never runs.

- **`end` with no preceding `result`/`error`** — `stop()` and `abort()` emit `end` directly when no recognizer is active (`ExpoSpeechRecognitionModule.swift:365, 377`), and `end` is fired after *every* session terminates (after result, after nomatch, after error). MicButton listens to none of these, so any path that ends without a `result`/`error` leaves the UI stuck.

Because `state.isListening` stays `true`, `useAudioSpeechBridge` (`GameScreen.tsx:51`) never fires `notifySpeechEnd()`, so the BGM the mic paused is **never resumed**.

**Repro (click-through):** Game screen → hold the mic → make a brief non-word sound (or hold in a noisy/echoey room) and release. Result: the "..." button keeps pulsing, the music stays off, and no toast appears. Tap the mic again to unstick it.

**Fix applied (low risk, robust).** Two listeners were added to `MicButton.tsx` (after the `error` handler):

```ts
// nomatch — iOS returns a final result with no recognition WITHOUT firing `result`
useSpeechRecognitionEvent('nomatch', () => {
  onError("Didn't catch that, try again");   // same feedback as the empty-transcript path
  setIsListening(false);
  setMicPhase('idle');
});

// end — fires on EVERY terminal path; catch-all reset so the mic can't soft-lock
useSpeechRecognitionEvent('end', () => {
  setIsListening(false);
  setMicPhase('idle');
});
```

The `end` listener is the robust catch-all (covers `nomatch` and any future end-without-result path); the `nomatch` listener adds the user-facing "Didn't catch that" toast so a mumble gives feedback instead of silently resetting. Both are idempotent with the existing `result`/`error` handlers (which already reset before `end` arrives), so there's no double-reset and no double-toast on the happy path (`result` and `nomatch` are mutually exclusive on iOS).

**Verification.** `npx tsc --noEmit` passes (`end` and `nomatch` are declared in `ExpoSpeechRecognitionNativeEventMap`, so the listeners typecheck). Event-flow traced for each terminal path: happy `result` → reset + `end` reset (idempotent, one `onTranscription`); empty transcript → `result` toast + `end`; mumble → `nomatch` toast + `end` (previously stuck); `error` → toast + `end`; stop()/abort() with no active recognizer → `end` alone now resets. Because `isListening` now always flips back to `false`, `useAudioSpeechBridge` reliably calls `notifySpeechEnd()` and the paused BGM resumes.

---

## Bug 16 — `start()` can fire after the button is released, orphaning a recognition session (Medium)

**Where:** `src/components/MicButton.tsx:136-185` (`handlePressIn` is `async` and calls `start()` *after* `await requestPermissionsAsync()`; `handlePressOut` runs synchronously).

**What happens:** Two related symptoms:

1. **First-run permission grant:** the very first time you hold the mic, iOS shows the permission dialog. Presenting it cancels the touch, so `handlePressOut` fires *while* `handlePressIn` is still awaiting the permission result. You tap **Allow** → the `await` resolves → `start()` runs → recognition begins even though your finger is off the button. The button may already show idle, yet the mic is now live and listening to the room.
2. **Quick taps:** a tap shorter than the permission promise's resolution calls `stop()`/`abort()` before `start()` has run (they no-op against a not-yet-started recognizer), and then `start()` fires anyway → an orphaned session.

In both cases the orphaned recognition runs until its silence timeout (iOS 17-: ~3 s) or until it hears something, and if it produces a `result` it calls `onTranscription(...)` → `processInput(...)` (`GameScreen.tsx:477`) — i.e. **an answer the player never spoke can get submitted from ambient audio.**

**Why:** the start call is sequenced after an `await`, but the release handler has no way to cancel it:

```ts
const handlePressIn = async () => {
  ...
  const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync(); // <-- yields
  if (!result.granted) { ...return; }
  ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: false }); // <-- runs even if released
};

const handlePressOut = () => {
  ...
  if (duration < 300) { ...; ExpoSpeechRecognitionModule.abort(); ...return; } // no-op before start()
  ExpoSpeechRecognitionModule.stop();                                          // no-op before start()
};
```

There's no flag tying `start()` to "is the button still held?". (This also compounds Bug 15: the `stop()`-before-`start()` path emits only `end`, which is unhandled, so the UI is left stuck while the orphaned session runs.)

**Fix applied (low risk).** Press state is now tracked in an `isHeld` ref and `start()` is gated on it:

```ts
const isHeld = useRef(false);

// handlePressIn — mark held before the await:
isHeld.current = true;
// …after `await requestPermissionsAsync()` and the !granted check:
if (!isHeld.current) {           // released during the permission prompt / quick tap
  setIsListening(false);
  setMicPhase('idle');
  if (safetyTimeout.current) { clearTimeout(safetyTimeout.current); safetyTimeout.current = null; }
  return;                        // → don't start an orphaned session
}
ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: false });

// handlePressOut — clear held at the top:
isHeld.current = false;
```

A release-before-start is now a true cancel: it resets the UI to idle and clears the 2 s safety timeout (so it can't flip to a phantom "ready" state) rather than leaving an orphaned recognition session listening to ambient audio. A normal hold still starts and stops exactly as before. The check is placed *after* the `!granted` branch so a genuine permission denial still shows its own message.

**Verification.** `npx tsc --noEmit` passes. This composes with the Bug 15 fix: the `stop()`/`abort()`-before-`start()` paths emit `end`, which the new `end` listener now handles, so the UI no longer sticks while a cancelled press unwinds.

---

## Voice input & audio — what I verified as correct

- **`AudioManager`'s serial command queue is sound:** commands run one-at-a-time through `processQueue`, so the "pause arrives while the track is still loading" race can't happen — a queued `play` completes synchronously (status → `playing`) before the following `pause` executes, so the speech-pause always lands on a `playing` track. Superseded `play` commands are correctly coalesced to the latest (`findLastIndex` skip), and `requestTrack`'s dedupe guard only short-circuits when the queue is empty.
- **Speech ↔ BGM bridge is edge-triggered correctly:** `useAudioSpeechBridge` uses a `prevRef` so `notifySpeechStart`/`notifySpeechEnd` fire exactly once per `isListening` transition, and the `resume` command re-arms the iOS audio session (`setAudioModeAsync`) before replaying — the documented session-reclaim. (The one gap is upstream: Bug 15 means `isListening` can fail to flip back to `false`, so the *resume never gets requested* — the bridge itself is fine.)
- **Mic gesture happy path** (hold ≥ 300 ms → `audiostart` → spinner becomes pulsing "ready" → speak → `result` isFinal → `processInput`) and the safety timeout (2 s fallback to "ready", cleared on transition/unmount) are correct.
- **Minor caveat (not filed as a bug):** `playSfx` samples `this.isMuted` at player-creation time, so toggling mute *during* a one-shot SFX (e.g. the ~1 s hint-success jingle) won't take effect until the next SFX. Cosmetic only.

---

# Evolution-chain display pass (your original example, in the card modal)

This last pass circles back to **bug #1 from your original message** — _"the evolve chain especially when we limit the quiz to a certain generation. for example pichu → pikachu → raichu but realistically in generation 1 it is only pikachu → raichu."_

The iteration-1 fix (commit `c75bcf1`) resolved this for **quiz-mode logic**: the evolution-*stage* constraint (`base`/`middle`/`final`) is now generation-scoped, so Pikachu is correctly classed **base** in a Gen-1 quiz instead of **middle** (because Pichu is excluded). That fix is correct and holds.

But your literal example — the *visible chain* reading `Pichu → Pikachu → Raichu` — lives in a **different** code path that the iteration-1 fix never touched: the **Pokémon card modal**. That path is still wrong, so I'm filing it explicitly.

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 17 | **Card modal shows the full real-world evolution chain, ignoring the active generation — so a Gen-1 context still displays `Pichu → Pikachu → Raichu`** | Medium | **Fixed** (DB-verified) |

---

## Bug 17 — Card-modal evolution chain ignores the active generation (Medium)

**Where:** `src/data/pokemon-db.ts:81-110` (`getEvolutionChain`), called at `src/components/PokemonCardModal.tsx:84`; rendered from `src/screens/ResultScreen.tsx:190` and `src/screens/PokedexScreen.tsx:178`.

**What happens:** Open any Pokémon's card in a Gen-1 context and the evolution chain you tap through includes Pokémon from **later** generations. Your exact example: tap **Pikachu** and the chain shows **Pichu → Pikachu → Raichu**, even though Pichu is a **Gen-2** Pokémon and "in Gen 1 it's only Pikachu → Raichu."

**Why:** `getEvolutionChain(pokemonId)` takes only a Pokémon id — **no generation parameter** — and returns *every* member sharing that `evolution_chain_id`, BFS-ordered from the null-parent base:

```ts
// pokemon-db.ts:87-90  — pulls the WHOLE chain, no generation filter
const members = getDb().getAllSync(
  'SELECT id, name, evolves_from_id FROM pokemon WHERE evolution_chain_id = ?',
  [chainRow.evolution_chain_id]
);
```

Neither call site can fix this from the outside: `PokemonCardModal`'s `Props` (`PokemonCardModal.tsx:46-51`) is `{ visible, pokemonName, pokemonId, onClose }` — there is **no way to pass which generations are active**, so the modal can't scope the chain even though both screens know the context (the Result screen has `state.activeGenerations`; the Pokédex has its `selectedGen` filter).

**Repro (deterministic, click-through):** Home → **Pokédex** → set the generation filter to **Gen 1** → tap **Pikachu**. The card's evolution row shows **Pichu → Pikachu → Raichu** — a Gen-2 Pokémon (Pichu) displayed while you're explicitly browsing **Gen 1**. (Also reachable from the post-game learning section after a Gen-1-only quiz: tap any revealed Gen-1 Pokémon with a cross-gen relative.)

**Evidence (`assets/quiz.db`):** chain `10` holds all three, and Pichu is Gen 2:

```
id   name     generation  evolves_from_id
25   Pikachu  1           172 (Pichu)
26   Raichu   1           25  (Pikachu)
172  Pichu    2           NULL          <- the BFS base, so the chain RENDERS as Pichu → Pikachu → Raichu
```

This is **not a one-off**: **39 of 151 Gen-1 Pokémon (26%)** have a card chain that pulls in a later-generation member. A few of the most familiar:

```
Pikachu / Raichu      ← Pichu (Gen 2)
Clefairy / Clefable   ← Cleffa (Gen 2)
Jigglypuff/Wigglytuff ← Igglybuff (Gen 2)
Eevee + all eeveelutions ← Espeon, Umbreon (Gen 2)  [and Leafeon/Glaceon/Sylveon in later gens]
Onix → Steelix (Gen 2),  Scyther → Scizor (Gen 2),  Magnemite/Magneton → Magnezone (Gen 4)
```

**Is it a bug or a design choice? — your call.** Two honest readings:

- **It's the bug you reported.** You stated the expectation plainly: in a Gen-1 context the chain should be Pikachu → Raichu. By that standard this is the same defect as #1, just in the display path, and it's the most on-topic finding in this whole report.
- **It's arguably intentional for the card.** Unlike the quiz (which scores answers), the card modal is a *"learn about this Pokémon"* surface that fetches live PokeAPI data. Showing the **complete** real-world family (including that Pikachu *does* evolve from Pichu in later games) is defensible as educational — and tapping Pichu to read its card is a feature, not a leak.

**Resolution — fixed to match your stated expectation.** You said it plainly ("in generation 1 it is only Pikachu → Raichu") and asked me to fix it, so the card modal's evolution chain is now generation-scoped. The fix:

1. `getEvolutionChain(pokemonId, generations?)` (`pokemon-db.ts:81`) takes an optional `generations?: number[]`. When present, it drops members whose generation isn't active, then **re-roots** any survivor whose parent was dropped before the BFS — so removing the inactive *base* (e.g. Pichu) leaves a contiguous `Pikachu → Raichu` instead of orphaning the chain. When `generations` is omitted, behavior is identical to before (full real-world chain), so any all-gens caller is unchanged.
2. `PokemonCardModal`'s `Props` gained an optional `generations?: number[]`, threaded into `getEvolutionChain`. Both call sites pass their context: `selectedGen ? [selectedGen] : undefined` at `PokedexScreen.tsx:178`, and `state.activeGenerations` at `ResultScreen.tsx:190` (newly carried on the `Result` navigation params, copied to avoid mutating reducer state).

**Edge case — handled by bridging.** A chain whose *active* members are non-contiguous (an inactive Pokémon sitting *between* two active ones) is re-rooted so the gap is bridged rather than the chain split or a member dropped. A DB scan found exactly **one** such chain in the entire dataset — Budew (Gen 4) → Roselia (Gen 3) → Roserade (Gen 4) — which only triggers under a Gen-4-only filter and degrades gracefully to `Budew → Roserade`. None of the Gen-1 baby-Pokémon cases hit this (the inactive member is always the base).

**Verification.** `npx tsc --noEmit` passes, and the new logic was checked against the real `assets/quiz.db` across 10 scenarios (Pikachu Gen-1 → `Pikachu → Raichu`; all-gens → `Pichu → Pikachu → Raichu` unchanged; Eevee Gen-1/Gen-2 branchy re-rooting; Magnemite Gen-1 dropping Gen-4 Magnezone; the Budew/Roselia bridge; single-member fallback) — all pass.

---

## Evolution-chain display — what I verified as correct

- **The iteration-1 quiz fix is unaffected and still correct.** Bug 17 is purely about the card modal's *display*; the quiz's stage classification, generation, and per-constraint feedback paths remain gen-scoped as fixed.
- **`getEvolutionChain` itself is otherwise correct:** the BFS from the null-parent base produces the right order, branchy chains (Eevee's many evolutions all hang off Eevee) are handled by the `byParent` multimap, and single-member families short-circuit (`members.length <= 1`).
- **Reachability confirmed by code, not run:** both modal call sites are `{selected && <PokemonCardModal .../>}` and pass a real `pokemonId`, and `getEvolutionChain` is invoked on open (`PokemonCardModal.tsx`). Post-fix it now also receives the active `generations`, so the rendered chain is gen-scoped — there is no other filter between the DB and the chain row.

---

# Core reducer / turn-order pass (the game state machine)

Every pass above covered a feature surface (quiz logic, gen-vote, Pokédex, voice, card modal). This pass audits the **core state machine** itself — `src/state/gameReducer.ts`, which drives turn advancement, elimination, and win/draw detection for *both* normal and quiz mode. It had only been spot-checked before (the gen-vote tally in Bug 6). Tracing the turn-advancement helper across all its call sites surfaced a real **gameplay** bug (not cosmetic, not stats): the turn order is wrong after a give-up.

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 18 | **A mid-order player giving up rewinds the turn to the first player — the player who just went goes again, and the players who should be next are skipped** | Medium | **Fixed** (reducer simulation) |

---

## Bug 18 — Give-up sends the turn to the wrong player (Medium)

**Where:** `src/state/gameReducer.ts:134` (the `getNextActivePlayer` call inside `GIVE_UP`), helper at `:4-11`; contrast the **correct** call at `:92` (`CONFIRM_ITEM`).

**What happens:** In a game with **3 or more** players, when a player who is **not first in the turn order** gives up on their turn, the turn does **not** pass to the next player in seating order. Instead it jumps back to the **first** remaining player — who, on a give-up, is usually the player who *just* took their turn. That player gets to go again, and the player(s) who should have been next are skipped for a full cycle. (With 2 players this never triggers — a give-up ends the game immediately.)

**Why:** the helper advances by index:

```ts
// gameReducer.ts:4-11
function getNextActivePlayer(currentPlayer, activePlayers) {
  const currentIndex = activePlayers.indexOf(currentPlayer);
  const nextIndex = (currentIndex + 1) % activePlayers.length;
  return activePlayers[nextIndex];
}
```

`CONFIRM_ITEM` calls it with `state.activePlayers`, which **still contains** the current player, so `indexOf` resolves and it advances correctly (`:92`). But `GIVE_UP` first builds `newActive` by **filtering the current player out**, then calls the helper with that filtered list (`:134`):

```ts
// gameReducer.ts:110-134
const newActive = state.activePlayers.filter((p) => p !== state.currentPlayer);
// …
currentPlayer: getNextActivePlayer(state.currentPlayer, newActive),  // newActive no longer has currentPlayer
```

So `indexOf(state.currentPlayer)` returns **-1**, `nextIndex = (-1 + 1) % len = 0`, and the helper always returns `newActive[0]` — the first remaining active player — regardless of whose turn it actually was. It only *looks* correct when the next-in-order player happens to be the first survivor (i.e. the player who gave up was first in line, or was last and the order wraps).

**Repro (click-through):** Home → Pokémon → **4 players** `[A, B, C, D]` → start. `A` names a Pokémon → turn passes to `B`. On `B`'s turn, tap **I Give Up** → confirm. **Expected:** turn passes to `C`. **Actual:** turn passes to `A` — who just went — so `A` effectively takes two turns and `C`/`D` are skipped this cycle. (After this one wrong hop, subsequent turns advance correctly again, because normal `CONFIRM_ITEM` advancement uses the unfiltered list — so the damage is the single misdirected turn, repeated every time a mid-order player gives up.)

**Evidence (simulation of the exact reducer code, `[A,B,C,D]`, each gives up on their own turn):**

```
A gives up -> code next = B,  correct = B   [OK ]   (A was first in line; the next survivor happens to be right)
B gives up -> code next = A,  correct = C   [BUG]
C gives up -> code next = A,  correct = D   [BUG]
D gives up -> code next = A,  correct = A   [OK ]   (D was last; the order wraps back to the first player)
```

The helper always returns `newActive[0]` (the first survivor); that only coincides with the correct next-in-order player at the two edges (giver-upper was first, or was last and the order wraps). For every player *between* those, it's wrong. (3 players `[A,B,C]`: `B` gives up → code says `A`, correct is `C` — same BUG.)

**Fix applied (one-token, low risk).** The next player is now computed from the **original** (pre-filter) list, which still contains the current player so `indexOf` resolves correctly:

```ts
// gameReducer.ts:134
currentPlayer: getNextActivePlayer(state.currentPlayer, state.activePlayers),  // was: newActive
```

`GIVE_UP` only reaches this branch when `newActive.length >= 2` (the `=== 1` case returns a winner above), i.e. `state.activePlayers.length >= 3`. The current player's next-in-order is therefore always a *different*, still-active player (only the current player was filtered out, so the next-by-index player is guaranteed to be in `newActive`), so no extra guard is needed — `getNextActivePlayer(cur, [A,B,C,D])` returns `C` when `cur = B`, exactly as intended.

**Verification.** `npx tsc --noEmit` passes. The exact reducer logic was re-simulated for every give-up position in `[A,B,C,D]` and `[A,B,C]`: the fixed call now matches the expected next-in-seating-order survivor in **all** positions (B→C, C→D, D→A in the 4-player case; B→C, C→A in the 3-player case), whereas the old `newActive` call returned the first survivor (A) for every mid-order give-up. `CONFIRM_ITEM` and `CAST_GEN_VOTE` were already passing the unfiltered list, so this brings `GIVE_UP` into line with them; no other call site is affected. **Now regression-tested** (`src/state/gameReducer.vitest.ts`): mid-order give-ups in 4- and 3-player games advance B→C and C→D (failing if the pre-filtered-list regression returns A); the suite also pins the first/last-position give-ups that coincidentally produce the correct player even when buggy, so a future refactor can't quietly break the masked positions.

---

## Core reducer — what I verified as correct

- **`CONFIRM_ITEM` and `CAST_GEN_VOTE` (auto-detect) advance correctly:** both pass `state.activePlayers` (the *unfiltered* list that still contains the current player), so `getNextActivePlayer` resolves the index and advances to the genuine next player. The give-up path is the *only* caller that passes a pre-filtered list — so Bug 18 is isolated to `GIVE_UP`.
- **Last-player-standing win is correct:** `GIVE_UP` with `newActive.length === 1` sets `isGameOver` + `winner = newActive[0]` and never reaches the buggy advance; a 2-player give-up ends the game immediately with the right winner.
- **Pool-exhaustion → draw is intentional:** `CONFIRM_ITEM` sets `isGameOver`/`isDraw` when `usedItems.length >= totalItems` and keeps `currentPlayer` (no advance), matching the quiz `QUESTION_POOL_EXHAUSTED` draw. The last namer isn't credited as winner — a design choice, not a defect.
- **Hint accounting:** `REVEAL_HINT` always increments `hintsUsed[currentPlayer]` (the per-player limit counter) but caps `revealedHints` at 5 (the post-game display list) — these are deliberately separate, so a 6th hint still counts against the limit without bloating the result screen.
- **Note (now fixed):** `GIVE_UP` previously did not reset `turnStartTime`, so the next player's recorded turn absorbed the give-up deliberation — the stats-only inaccuracy filed as **[Bug 8](#bug-8--a-give-up-inflates-the-next-players-turn-time-in-the-stats-low)**, which is now fixed (the continue branch resets `turnStartTime`, and per-turn durations are captured at record creation).
