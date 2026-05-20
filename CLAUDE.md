@AGENTS.md

# Quiz Game — Name It!

A turn-based naming game for iOS built with Expo (React Native + TypeScript). Players take turns naming items in a category. The app tracks what's been said, rejects duplicates, and handles voice input with fuzzy matching.

## Current State

### Features Implemented
- **2 game modes**: Pokemon Gen 1 (151) and Fruits (~90)
- **2-8 players** with custom names and assigned colors
- **Voice input** (push-to-hold mic button) via `expo-speech-recognition`
- **Text input** always visible as fallback
- **Fuzzy matching** with tight Levenshtein distance thresholds to prevent guess-and-check
- **Alias system** (`src/data/aliases.ts`) mapping common speech recognition mishearings to correct Pokemon/fruit names (e.g., "he can" → Ekans, "blast toys" → Blastoise)
- **Duplicate detection** with "Show me when" — opens history scrolled to the duplicate entry
- **"Did you mean X?" confirmation** overlay before accepting an answer
- **History modal** with player-colored rows, 24h timestamps, and highlight/scroll-to support
- **Player elimination** — when a player gives up, they're out; game continues until one remains
- **End-of-game stats** (per-player item counts, avg turn times, fastest/slowest turn, total game time) — hidden behind "Show Stats" button
- **Haptic feedback** on mic button press/release
- **Toast notifications** for voice errors and no-match results (centered on screen)

### Not Yet Implemented
- Mic stops working after several rounds (root cause not yet isolated — needs dev build with console logging to debug)
- Answer validation (checking if an answer is actually a valid Pokemon/fruit vs just matching the list)
- Custom rules/filters (e.g., Pokemon Gen 1 only fire types)
- Additional categories beyond Pokemon Gen 1 and Fruits
- Android support
- Online multiplayer

## Tech Stack
- **Expo SDK 54** (managed workflow, TypeScript)
- **expo-speech-recognition** — iOS speech recognition
- **expo-haptics** — haptic feedback
- **React Navigation** (native stack) — 4 screens
- **React Context + useReducer** — state management
- No backend/database — all data is local JSON

## Project Structure
```
src/
├── components/
│   ├── ConfirmationOverlay.tsx   # "Did you mean X?" overlay
│   ├── HistoryModal.tsx          # Scrollable game history with highlights
│   ├── MicButton.tsx             # Push-to-hold voice capture
│   ├── StatsPanel.tsx            # Per-player stats display
│   ├── TextInputField.tsx        # Text input with submit
│   └── Toast.tsx                 # Auto-dismissing centered toast
├── data/
│   ├── aliases.ts                # Speech recognition alias mappings
│   ├── fruits.json               # ~90 fruits
│   └── pokemon-gen1.json         # 151 Gen 1 Pokemon
├── navigation/
│   └── RootNavigator.tsx         # Stack: Home → PlayerSetup → Game → Result
├── screens/
│   ├── HomeScreen.tsx            # Category picker
│   ├── PlayerSetupScreen.tsx     # Enter 2-8 player names
│   ├── GameScreen.tsx            # Main gameplay
│   └── ResultScreen.tsx          # Winner + elimination order + stats
├── state/
│   ├── GameContext.tsx            # React Context provider
│   └── gameReducer.ts            # Game state machine (turns, elimination)
├── types/
│   └── index.ts
└── utils/
    ├── colors.ts                 # 8-color player palette
    ├── fuzzyMatch.ts             # Levenshtein matching + alias lookup
    ├── levenshtein.ts            # Edit distance algorithm
    └── statsCalculator.ts        # End-of-game stats computation
```

## Key Design Decisions
- **Tight fuzzy match thresholds**: 0 for 1-3 chars, 1 for 4-5, max 2 for 6+. Prevents gaming via guess-and-check.
- **Aliases checked before Levenshtein**: speech recognition consistently mangles Pokemon names into real English words. Aliases bypass the threshold entirely.
- **Voice duplicates show Alert with "Show me when"**: not auto-navigating to history, user chooses whether to see it.
- **Player colors assigned by index** in the original player order, persist even after elimination.

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
