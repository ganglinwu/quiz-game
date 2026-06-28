# Quiz Mode — Bug Report

_Static code audit + SQLite verification against `assets/quiz.db`. No app run (no simulator in this environment); every finding below is traced through code and confirmed against the real data._

Bug #1 from the original request (evolution-stage classification ignoring the active generation, e.g. Pikachu being treated as "middle" because of Pichu) was **already fixed** in the previous iteration (commit `c75bcf1`). That fix was re-verified and holds — see "What I verified as correct" at the bottom.

This report covers the **other bugs** found while tracing the quiz-mode code paths. The original request also asked me to "click through the app and see if you find any other bugs," so a **whole-app pass beyond quiz mode** has been added at the bottom — see **[Whole-app pass (beyond quiz mode)](#whole-app-pass-beyond-quiz-mode)**, which includes a **High-severity** broken-feature bug (the "Remove generation" button). Four further passes follow it: a **[Pokédex & card-modal pass](#pokédex--card-modal-pass-ui-subsystems)** (Bugs 10–14), a **[Voice input pass](#voice-input-pass-micbutton--speech-recognition)** (Bugs 15–16, verified against the `expo-speech-recognition` native iOS source), an **[Evolution-chain display pass](#evolution-chain-display-pass-your-original-example-in-the-card-modal)** (Bug 17) — most relevant to your original complaint — and a **[Core reducer / turn-order pass](#core-reducer--turn-order-pass-the-game-state-machine)** (Bug 18), which audits the game state machine itself and found — and **now fixes** — a **gameplay** bug: in a 3+ player game, a mid-order player giving up sent the turn to the wrong player. **Bug 17 was your exact example resurfacing**: the Pokémon card modal still showed `Pichu → Pikachu → Raichu` in a Gen-1 context, because the iteration-1 fix corrected quiz-mode *stage classification* but the card modal's *displayed chain* was never gen-scoped. **Bug 17 is now fixed** — the card modal's evolution chain is generation-scoped, so a Gen-1 context shows `Pikachu → Raichu`. See the [Bug 17 section](#bug-17--card-modal-evolution-chain-ignores-the-active-generation-medium) for the implementation and verification.

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

---

# Whole-app pass (beyond quiz mode)

The original request was "click through the app and see if you find any other bugs." The quiz-mode bugs above are all in the question-generation/validation logic. This section covers the rest of the app (the normal Pokémon mode, the result screen, stats). Each finding is traced through code; data-dependent claims are checked against `assets/quiz.db`.

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 6 | **"Remove generation" button doesn't remove — it re-adds the gen (duplicate) and the vote even says "Add"** | **High** | Confirmed |
| 7 | `state.activeGenerations.sort()` mutates reducer state during render | Low | Confirmed |
| 8 | Per-turn stats: first turn includes pre-game time; a give-up inflates the next player's turn time | Low | Confirmed |
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

**Recommended fix:** introduce a real remove path. Either (a) add a `source`-aware branch — carry an `action: 'add' | 'remove'` on `PROPOSE_GEN_CHANGE`/`pendingGenVote`, make `GenerationVoteOverlay` say "Add"/"Remove" accordingly, and on approval do `newGens = action === 'remove' ? state.activeGenerations.filter(g => g !== gen) : [...state.activeGenerations, gen]`; or (b) if removal shouldn't need a vote (it can't expand the pool, only shrink it — and it's already gated on "no Pokémon from that gen named yet"), wire **Remove** to a direct `REMOVE_GEN` action that filters the gen out and recomputes `totalItems`, no overlay. Option (b) is simpler and matches the existing `canRemove` safety gate.

---

## Bug 7 — `activeGenerations.sort()` mutates reducer state during render (Low)

**Where:** `src/screens/GameScreen.tsx:362`.

```ts
const categoryLabel = isPokemon
  ? `Pokemon Gen ${state.activeGenerations.sort((a, b) => a - b).join(', ')}`
  : 'Fruits';
```

`Array.prototype.sort` sorts **in place**, so this mutates the `activeGenerations` array held in reducer state, during render. Reducer state must be treated as immutable; mutating it during render is a React anti-pattern (can tear under StrictMode/concurrent rendering and makes the state object lie about its own contents). In practice it's currently benign because the sort is idempotent and query order doesn't matter — but it's latent, and it's what turns Bug 6's duplicate into the visible `1, 2, 2` ordering. **Fix:** copy before sorting — `[...state.activeGenerations].sort((a, b) => a - b)`.

---

## Bug 8 — Per-turn stats charge setup time and give-up time to the wrong turn (Low)

**Where:** `src/utils/statsCalculator.ts:8-15`.

```ts
const turnTimes = turnRecords.map((record, i) => {
  const prevTime = i === 0 ? gameStartTime : turnRecords[i - 1].timestamp;
  return { player: record.player, time: record.timestamp - prevTime, item: record.item };
});
```

Turn time is `thisRecord.timestamp - previousRecord.timestamp`. Two consequences:

- **First turn** is measured from `gameStartTime` (game creation), so it includes however long players spent on the setup/first-glance before the opening answer — inflating player 1's first turn and skewing "slowest turn."
- **Give-ups/eliminations create no turn record.** When a player gives up, the *next* player's recorded turn spans from the last *successful* answer, so it silently absorbs the give-up deliberation time and is over-counted.

These only affect the end-of-game stats panel (cosmetic), hence Low. **Fix (if desired):** track a real per-turn start timestamp (the reducer already maintains `turnStartTime`) and record `record.timestamp - turnStartAtThatMoment` per turn instead of differencing adjacent records.

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
| 10 | **Pokédex search box is silently ignored whenever a stat filter is active** | Medium | Confirmed |
| 11 | Card modal: switching evolution members has no fetch cancellation — out-of-order responses can show the wrong Pokémon's stats | Low | Confirmed |
| 12 | Card modal: a failed PokeAPI fetch renders a blank "normal-type" card with 0.0 m / 0.0 kg and no error/retry | Low | Confirmed |
| 13 | `NetworkImage` doesn't reset on `uri` change — swapping artwork shows the previous image with no loader | Low | Confirmed |
| 14 | `PlayerSetupScreen` mutates the route-param `category.generations` array in place during render (`.sort()`) | Low | Confirmed |

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

**Recommended fix (low risk):** apply the search filter to the stat-ranked list too, e.g. lift the search filter out of the `else` branch:

```ts
const pokemon = useMemo(() => {
  let list = selectedStat
    ? queryPokemon({ generations: selectedGen ? [selectedGen] : undefined, statRank: { stat: selectedStat, topN: 20 } })
    : (selectedGen ? getPokemonForGens([selectedGen]) : getAllPokemon());
  const q = search.trim().toLowerCase();
  if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
  return list;
}, [selectedGen, selectedStat, search]);
```

(Decision for you: should searching within "Top 20 Attack" search *only those 20*, as above, or clear the stat filter and search all Pokémon? The snippet does the former — least surprising given the chip stays highlighted.)

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

**Recommended fix (standard):** guard with a cancelled flag (or `AbortController`):

```ts
useEffect(() => {
  if (!visible) return;
  let cancelled = false;
  // …
  Promise.all([...]).then(([pokemon, species]) => {
    if (cancelled) return;
    setData(…); setLoading(false);
  }).catch(() => { if (!cancelled) setLoading(false); });
  return () => { cancelled = true; };
}, [visible, displayId]);
```

---

## Bug 12 — Card modal: a failed fetch shows a blank card, not an error (Low)

**Where:** `src/components/PokemonCardModal.tsx:120` (`.catch(() => setLoading(false))`).

When the PokeAPI request fails (offline, rate-limited, 404), the catch only flips `loading` off and leaves `data` as `null`. The card then renders its fallback values: a grey **normal**-type header, `HP ??`, no type badges, **0.0 m / 0.0 kg**, and no stat bars. There's no error message and no retry — it just looks like a broken/empty card. Same applies if `fetch` returns a non-OK status, since `r.json()` is called without an `r.ok` check (`:99-100`) and a parsed error body throws into the same catch. **Low** (cosmetic/degraded), but worth a small "Couldn't load — tap to retry" state.

---

## Bug 13 — `NetworkImage` doesn't reset when its `uri` changes (Low)

**Where:** `src/components/NetworkImage.tsx` (`loaded` state + `opacity` ref).

`NetworkImage` tracks `loaded` (starts `false`, set `true` on the first `onLoad`) and fades the image in via an `opacity` Animated value. Neither is keyed to `uri`, so when the **same instance** gets a new `uri` — exactly what happens for the main artwork when you tap through the evolution chain in the card modal (`PokemonCardModal.tsx:159`, no `key`) — `loaded` stays `true` and `opacity` stays `1`. Result: the PokeballLoader never reappears and the **previous** Pokémon's artwork stays visible until the new image finishes loading. Minor visual glitch (**Low**). **Fix:** reset on uri change (`useEffect(() => { setLoaded(false); opacity.setValue(0); }, [uri])`) or pass `key={uri}` at the call site to force a remount.

---

## Bug 14 — `PlayerSetupScreen` mutates route-param state during render (Low)

**Where:** `src/screens/PlayerSetupScreen.tsx:77` (and the non-quiz branch on the same expression).

```ts
`Pokemon Gen ${category.generations.sort().join(', ')}`
```

`Array.prototype.sort` sorts **in place**, so this mutates `category.generations` — an array that lives on the navigation route params — during render. Same anti-pattern family as **Bug 7** (`GameScreen.tsx:362`): currently benign (idempotent sort, order irrelevant) but it mutates shared state on the render path. **Fix:** `[...category.generations].sort(…)`.

---

## Pokédex & card-modal pass — what I verified as correct

- **Pokédex generation + stat compose correctly:** `selectedGen` is passed into both `getPokemonForGens` and `queryPokemon(statRank)`, so "Gen 2 + Top 20 Speed" is genuinely Gen-2-scoped; only *search* (Bug 10) is dropped.
- **`'pokedex'` BGM track is registered** (`tracks.ts:8` → `yellow-opening.mp3`), so `useBGM('pokedex')` resolves and the `TRACK_REGISTRY.get(...) → if (!track) return` guard isn't hit.
- **Card modal evolution chain is built once from the family base** (`getEvolutionChain(pokemonId)` on open) and correctly *not* re-fetched when switching members — every member shares one chain, so the BFS-ordered list (Pichu→Pikachu→Raichu) stays stable while you tap through it. _(The **mechanics** here — one build, no re-fetch — are correct; but the chain's **content** is the full real-world chain regardless of the active generation, which is itself **[Bug 17](#evolution-chain-display-pass-your-original-example-in-the-card-modal)** — your original `Pichu→Pikachu→Raichu` complaint. I'd previously logged this as correct; Bug 17 is the correction.)_
- **Player-name validation** is sound: blanks default to `Player N`, the duplicate check is case-insensitive (`toLowerCase()`), and color assignment by index is safe (`PLAYER_COLORS` has ≥ `MAX_PLAYERS` entries).

---

# Voice input pass (MicButton / speech recognition)

The passes above cover game logic and the visual UI. This fourth pass covers the **voice input flow** — the push-to-hold `MicButton` (`src/components/MicButton.tsx`), the `expo-speech-recognition` event handling, and the `AudioManager` ↔ speech bridge. This subsystem had not been audited before. Unlike the data-dependent bugs above, these are verified against the **library's native iOS source** (`node_modules/expo-speech-recognition/ios/ExpoSpeechRecognitionModule.swift`), since the event semantics are the crux — no simulator was available in this environment.

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 15 | **MicButton ignores the `nomatch` and `end` events → mic sticks in the pulsing "listening" state, BGM stays paused, and the spoken word is silently dropped with no error** | Medium | Confirmed (native source) |
| 16 | **`start()` runs after the permission `await` even if the button was already released → an orphaned recognition session keeps listening (auto-submits ambient audio; confusing first-run grant)** | Medium | Confirmed |

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

**Recommended fix (low risk, robust):** add an `end` listener as a catch-all reset — it fires on every terminal path, so it covers `nomatch` and any future end-without-result case in one place:

```ts
useSpeechRecognitionEvent('end', () => {
  setIsListening(false);
  setMicPhase('idle');
});
```

Optionally also add a `nomatch` listener that shows the existing "Didn't catch that, try again" toast so the user gets feedback (the `end` handler alone fixes the stuck state but stays silent). Note: the existing `result` handler already calls `setIsListening(false)` before `end` arrives, so the extra `end` reset is idempotent and harmless on the happy path.

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

**Recommended fix (low risk):** track press state in a ref and gate `start()` on it:

```ts
const isHeld = useRef(false);
// handlePressIn: set isHeld.current = true at the top
// after the await:
if (!isHeld.current) return;                 // released during permission prompt → don't start
ExpoSpeechRecognitionModule.start({ ... });
// handlePressOut: set isHeld.current = false at the top
```

This makes a release-before-start a true cancel, and a normal hold still starts and stops as before.

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

**Verification.** `npx tsc --noEmit` passes. The exact reducer logic was re-simulated for every give-up position in `[A,B,C,D]` and `[A,B,C]`: the fixed call now matches the expected next-in-seating-order survivor in **all** positions (B→C, C→D, D→A in the 4-player case; B→C, C→A in the 3-player case), whereas the old `newActive` call returned the first survivor (A) for every mid-order give-up. `CONFIRM_ITEM` and `CAST_GEN_VOTE` were already passing the unfiltered list, so this brings `GIVE_UP` into line with them; no other call site is affected.

---

## Core reducer — what I verified as correct

- **`CONFIRM_ITEM` and `CAST_GEN_VOTE` (auto-detect) advance correctly:** both pass `state.activePlayers` (the *unfiltered* list that still contains the current player), so `getNextActivePlayer` resolves the index and advances to the genuine next player. The give-up path is the *only* caller that passes a pre-filtered list — so Bug 18 is isolated to `GIVE_UP`.
- **Last-player-standing win is correct:** `GIVE_UP` with `newActive.length === 1` sets `isGameOver` + `winner = newActive[0]` and never reaches the buggy advance; a 2-player give-up ends the game immediately with the right winner.
- **Pool-exhaustion → draw is intentional:** `CONFIRM_ITEM` sets `isGameOver`/`isDraw` when `usedItems.length >= totalItems` and keeps `currentPlayer` (no advance), matching the quiz `QUESTION_POOL_EXHAUSTED` draw. The last namer isn't credited as winner — a design choice, not a defect.
- **Hint accounting:** `REVEAL_HINT` always increments `hintsUsed[currentPlayer]` (the per-player limit counter) but caps `revealedHints` at 5 (the post-game display list) — these are deliberately separate, so a 6th hint still counts against the limit without bloating the result screen.
- **Note (already covered):** `GIVE_UP` does not reset `turnStartTime`, so the next player's recorded turn absorbs the give-up deliberation — this is the same stats-only inaccuracy already filed as **[Bug 8](#bug-8--per-turn-stats-charge-setup-time-and-give-up-time-to-the-wrong-turn-low)**, not a new finding.
