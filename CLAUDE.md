@AGENTS.md

# Quiz Game — Name It!

A turn-based naming game for iOS built with Expo (React Native + TypeScript). Players take turns naming items in a category. The app tracks what's been said, rejects duplicates, and handles voice input with fuzzy matching.

## Current State

### Features Implemented
- **2 game modes**: Pokemon (Gen 1-3, ~400 Pokemon) and Fruits (~90)
- **2-8 players** with custom names and assigned colors
- **Voice input** (push-to-hold mic button) via `expo-speech-recognition`
- **Text input** always visible as fallback
- **Fuzzy matching** with tight Levenshtein distance thresholds to prevent guess-and-check
- **Alias system** (`src/data/aliases.ts`) with ~400 mappings for common speech recognition mishearings across Gen 1-3 (e.g., "he can" → Ekans, "blast toys" → Blastoise, "volt orb" → Voltorb)
- **Duplicate detection** with "Show me when" — opens history scrolled to the duplicate entry
- **"Did you mean X?" confirmation** overlay before accepting an answer
- **Hint system** (Pokemon only) — configurable per-player limits (Off/1/2/3/Unlimited), shows silhouette ("Who's that Pokemon?") then reveals on tap
- **Generation expansion** — auto-detects when a player names a Pokemon from an inactive generation, triggers a majority vote to expand; also manual via settings modal
- **Post-game learning section** — up to 5 Pokemon displayed on the result screen:
  - Hinted-but-unnamed Pokemon shown as silhouettes with 3→2→1 countdown reveal (only one countdown at a time)
  - Remaining slots padded with random unnamed Pokemon shown revealed with "Try these next time!" header
  - Tapping any revealed Pokemon opens a **Pokemon card modal** (fetches live data from PokeAPI) with type-colored header, framed artwork, type badges, height/weight, base stat bars, and flavor text
- **History modal** with player-colored rows, 24h timestamps, and highlight/scroll-to support
- **Player elimination** — when a player gives up, they're out; game continues until one remains
- **End-of-game stats** (per-player item counts, avg turn times, fastest/slowest turn, total game time) — hidden behind "Show Stats" button
- **Hint success banner** — if a player answers the hinted Pokemon correctly while still in silhouette phase (before revealing), a gold "You got it right! No hints consumed!" banner pops up with the wild-pokemon-caught jingle
- **Background music** via `expo-audio` with a command-queue AudioManager (`src/audio/`) — guarantees only one BGM track at a time:
  - Home/PlayerSetup: `title-screen`, Gameplay: `pallet-town`, Hint overlay: `wild-pokemon-battle`, Result: `pokemon-center`
  - `wild-pokemon-caught` plays as one-shot SFX on hint success
  - BGM auto-pauses during speech recognition and resumes after (with iOS audio session restore)
  - Mute button (♪) on Home and Game screens, mute state persists across screens via AudioProvider
  - Screens use declarative hooks: `useBGM('title')`, `useBGMDynamic(trackId)`, `useAudioSpeechBridge(isListening)`
- **Haptic feedback** on mic button press/release
- **Toast notifications** for voice errors and no-match results (centered on screen)

### Not Yet Implemented
- Answer validation (checking if an answer is actually a valid Pokemon/fruit vs just matching the list)
- Multi-dimensional game modes (e.g., "name a Gen 2 electric Pokemon") — data is in SQLite, game mode UI not built yet
- Additional categories beyond Pokemon and Fruits
- Android support
- Online multiplayer

## Tech Stack
- **Expo SDK 54** (managed workflow, TypeScript)
- **expo-speech-recognition** — iOS speech recognition
- **expo-audio** — background music and sound effects
- **expo-haptics** — haptic feedback
- **React Navigation** (native stack) — 4 screens
- **React Context + useReducer** — state management
- **expo-sqlite** — pre-populated SQLite database for Pokemon/fruit/alias data
- No backend — all data is local (SQLite database bundled as asset)

## Project Structure
```
src/
├── components/
│   ├── ConfirmationOverlay.tsx   # "Did you mean X?" overlay
│   ├── GenerationSettingsModal.tsx # Manual generation add/remove
│   ├── GenerationVoteOverlay.tsx # Majority vote to expand generations
│   ├── HintOverlay.tsx           # Silhouette → reveal hint display
│   ├── HistoryModal.tsx          # Scrollable game history with highlights
│   ├── MicButton.tsx             # Push-to-hold voice capture
│   ├── PokemonCardModal.tsx      # Trading card-style detail modal (PokeAPI)
│   ├── StatsPanel.tsx            # Per-player stats display
│   ├── SuccessBanner.tsx         # "You got it right!" hint success banner
│   ├── TextInputField.tsx        # Text input with submit
│   └── Toast.tsx                 # Auto-dismissing centered toast
├── data/
│   ├── aliases.ts                # ~500 speech recognition alias mappings (Gen 1-3) — build-script input
│   ├── migrations.ts             # Runtime schema migration runner (PRAGMA user_version)
│   └── pokemon-db.ts             # SQLite data access layer (replaces JSON imports)
├── navigation/
│   └── RootNavigator.tsx         # Stack: Home → PlayerSetup → Game → Result
├── screens/
│   ├── HomeScreen.tsx            # Category picker
│   ├── PlayerSetupScreen.tsx     # Enter 2-8 player names, configure hints
│   ├── GameScreen.tsx            # Main gameplay
│   └── ResultScreen.tsx          # Winner + elimination order + stats + learning section
├── audio/
│   ├── AudioManager.ts           # Singleton class: command queue, single-sound guarantee
│   ├── AudioProvider.tsx          # React Context wrapping the manager
│   ├── useAudioSpeechBridge.ts   # Pauses/resumes BGM around speech recognition
│   ├── useBGM.ts                 # useBGM(trackId) and useBGMDynamic(trackId) hooks
│   ├── tracks.ts                 # Track registry (Map<TrackId, source>)
│   ├── types.ts                  # TrackId, AudioCommand, BGMState
│   └── index.ts                  # Barrel exports
├── state/
│   ├── GameContext.tsx            # React Context provider
│   └── gameReducer.ts            # Game state machine (turns, elimination, hints, gen votes)
├── types/
│   └── index.ts
└── utils/
    ├── colors.ts                 # 8-color player palette
    ├── fuzzyMatch.ts             # Levenshtein matching + alias lookup + gen detection
    ├── levenshtein.ts            # Edit distance algorithm
    ├── pokeApi.ts                # PokeAPI artwork URL helper
    └── statsCalculator.ts        # End-of-game stats computation
```

## Key Design Decisions
- **Tight fuzzy match thresholds**: 0 for 1-3 chars, 1 for 4-5, max 2 for 6+. Prevents gaming via guess-and-check.
- **Aliases checked before Levenshtein**: speech recognition consistently mangles Pokemon names into real English words. Aliases bypass the threshold entirely.
- **Voice duplicates show Alert with "Show me when"**: not auto-navigating to history, user chooses whether to see it.
- **Player colors assigned by index** in the original player order, persist even after elimination.
- **Hint tracking**: revealed hints saved to game state (max 5). On game end, hinted-but-unnamed Pokemon become silhouette quizzes; remaining slots filled with random unnamed Pokemon as suggestions.
- **Generation auto-detection**: if a player names a Pokemon from an inactive generation, a vote is triggered rather than rejecting the answer. Majority approval expands the pool mid-game.
- **Audio manager as command queue**: `AudioManager` is a plain TypeScript class (not React) that serializes all BGM operations through an async queue. One persistent `AudioPlayer` swaps tracks via `replace()`. Superseded play commands are skipped. SFX bypasses the queue entirely. Screens declare intent via hooks (`useBGM`, `useBGMDynamic`) rather than calling play/stop directly. After speech recognition ends, `setAudioModeAsync()` is called to reclaim the iOS audio session before resuming playback.
- **SQLite data layer**: Pokemon data (386 Pokemon with types, generation, legendary/mythical status, evolution chains, height, weight), ~500 voice aliases, and ~90 fruits stored in a pre-populated `assets/quiz.db`. Generated at build time by `scripts/generate-db.ts` which fetches from PokeAPI and caches in `scripts/pokeapi-cache.json`. `src/data/pokemon-db.ts` provides sync query functions via `expo-sqlite`'s `openDatabaseSync`. Includes `queryPokemon()` for multi-dimensional queries (by type, generation, legendary status, etc.).

## Build & Deploy
```bash
# Generate/regenerate the SQLite database from PokeAPI + aliases
npm run generate-db

# Development build (for console logging)
eas build -p ios --profile development
npx expo start --dev-client

# Production build + TestFlight
eas build -p ios --profile production
eas submit --platform ios
```

Bundle ID: `com.ganglinwu.quizgame`
EAS Project ID: `137a8bd5-39c8-4de3-8949-194420b876a7`
Privacy Policy: https://ganglinwu.github.io/quiz-game/privacy-policy.html

## Known Issues
- `app.json` includes `NSPhotoLibraryUsageDescription` to satisfy App Store — Expo dependency pulls it in, app doesn't actually use photos
