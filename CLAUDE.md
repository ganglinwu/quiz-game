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
- **Background music** via `expo-av` — screen-specific looping tracks with seamless transitions:
  - Home/PlayerSetup: `title-screen`, Gameplay: `pallet-town`, Hint overlay: `wild-pokemon-battle`, Result: `pokemon-center`
  - `wild-pokemon-caught` plays as one-shot SFX on hint success
  - Mute button (♪) on Home and Game screens, mute state persists across screens via MusicContext
- **Haptic feedback** on mic button press/release
- **Toast notifications** for voice errors and no-match results (centered on screen)

### Not Yet Implemented
- Mic stops working after several rounds (root cause not yet isolated — needs dev build with console logging to debug)
- Answer validation (checking if an answer is actually a valid Pokemon/fruit vs just matching the list)
- Custom rules/filters (e.g., Pokemon Gen 1 only fire types)
- Additional categories beyond Pokemon and Fruits
- Android support
- Online multiplayer

## Tech Stack
- **Expo SDK 54** (managed workflow, TypeScript)
- **expo-speech-recognition** — iOS speech recognition
- **expo-av** — background music and sound effects
- **expo-haptics** — haptic feedback
- **React Navigation** (native stack) — 4 screens
- **React Context + useReducer** — state management
- No backend/database — all data is local JSON

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
│   ├── aliases.ts                # ~400 speech recognition alias mappings (Gen 1-3)
│   ├── fruits.json               # ~90 fruits
│   ├── pokemon-data.ts           # Helper to load/filter Pokemon by generation
│   ├── pokemon-gen1.json         # 151 Gen 1 Pokemon
│   ├── pokemon-gen2.json         # 100 Gen 2 Pokemon
│   └── pokemon-gen3.json         # 135 Gen 3 Pokemon
├── navigation/
│   └── RootNavigator.tsx         # Stack: Home → PlayerSetup → Game → Result
├── screens/
│   ├── HomeScreen.tsx            # Category picker
│   ├── PlayerSetupScreen.tsx     # Enter 2-8 player names, configure hints
│   ├── GameScreen.tsx            # Main gameplay
│   └── ResultScreen.tsx          # Winner + elimination order + stats + learning section
├── state/
│   ├── GameContext.tsx            # React Context provider
│   ├── gameReducer.ts            # Game state machine (turns, elimination, hints, gen votes)
│   └── MusicContext.tsx           # BGM/SFX provider (play, stop, mute, playSfx)
├── types/
│   └── index.ts
└── utils/
    ├── colors.ts                 # 8-color player palette
    ├── fuzzyMatch.ts             # Levenshtein matching + alias lookup + gen detection
    ├── levenshtein.ts            # Edit distance algorithm
    ├── pokeApi.ts                # PokeAPI artwork URL helper
    ├── statsCalculator.ts        # End-of-game stats computation
    └── tracks.ts                 # Music track references (require() for bundled mp3s)
```

## Key Design Decisions
- **Tight fuzzy match thresholds**: 0 for 1-3 chars, 1 for 4-5, max 2 for 6+. Prevents gaming via guess-and-check.
- **Aliases checked before Levenshtein**: speech recognition consistently mangles Pokemon names into real English words. Aliases bypass the threshold entirely.
- **Voice duplicates show Alert with "Show me when"**: not auto-navigating to history, user chooses whether to see it.
- **Player colors assigned by index** in the original player order, persist even after elimination.
- **Hint tracking**: revealed hints saved to game state (max 5). On game end, hinted-but-unnamed Pokemon become silhouette quizzes; remaining slots filled with random unnamed Pokemon as suggestions.
- **Generation auto-detection**: if a player names a Pokemon from an inactive generation, a vote is triggered rather than rejecting the answer. Majority approval expands the pool mid-game.

## Build & Deploy
```bash
# Development build (for console logging)
eas build -p ios --profile development
npx expo start --dev-client

# Production build + TestFlight
eas build -p ios --profile production
eas submit --platform ios
```

Bundle ID: `com.ganglinwu.quizgame`
EAS Project ID: `137a8bd5-39c8-4de3-8949-194420b876a7`

## Known Issues
- Speech recognition mic becomes unresponsive after several rounds — not yet debugged, needs console log investigation via dev build
- `app.json` includes `NSPhotoLibraryUsageDescription` to satisfy App Store — Expo dependency pulls it in, app doesn't actually use photos
