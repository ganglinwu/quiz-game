import { GameAction, GameState, Category, HintLimit, QuizConfig } from '../types';
import { getPokemonForGens } from '../data/pokemon-db';

function getNextActivePlayer(
  currentPlayer: string,
  activePlayers: string[]
): string {
  const currentIndex = activePlayers.indexOf(currentPlayer);
  const nextIndex = (currentIndex + 1) % activePlayers.length;
  return activePlayers[nextIndex];
}

function computeTotalItems(category: Category, activeGens: number[]): number {
  if (category.type === 'fruits') return 0;
  return getPokemonForGens(activeGens).length;
}

export function createInitialState(args: {
  category: Category;
  players: string[];
  hintLimit?: HintLimit;
  quizConfig?: QuizConfig;
}): GameState {
  const activeGenerations = args.category.type === 'pokemon' ? args.category.generations : [];
  const hintsUsed: Record<string, number> = {};
  for (const p of args.players) hintsUsed[p] = 0;
  return {
    category: args.category,
    players: args.players,
    activePlayers: [...args.players],
    eliminatedPlayers: [],
    currentPlayer: args.players[0],
    turnRecords: [],
    usedItems: [],
    totalItems: computeTotalItems(args.category, activeGenerations),
    activeGenerations,
    pendingGenVote: null,
    gameStartTime: Date.now(),
    turnStartTime: Date.now(),
    isGameOver: false,
    isDraw: false,
    winner: null,
    confirmationItem: null,
    isListening: false,
    transcribedText: '',
    errorMessage: null,
    hintLimit: args.hintLimit ?? 0,
    hintsUsed,
    hintPhase: 'none',
    hintPokemonName: null,
    hintPokemonId: null,
    revealedHints: [],
    quizConfig: args.quizConfig ?? null,
    currentQuestion: null,
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME':
      return createInitialState({
        category: action.category,
        players: action.players,
      });

    case 'SET_LISTENING':
      return { ...state, isListening: action.isListening, errorMessage: null };

    case 'SET_TRANSCRIBED_TEXT':
      return { ...state, transcribedText: action.text };

    case 'PROPOSE_ITEM':
      return { ...state, confirmationItem: action.item, errorMessage: null };

    case 'CONFIRM_ITEM': {
      if (!state.confirmationItem) return state;
      const now = Date.now();
      const newRecord = {
        player: state.currentPlayer,
        item: state.confirmationItem,
        timestamp: now,
        durationMs: now - state.turnStartTime,
      };
      const newUsedItems = [...state.usedItems, state.confirmationItem];
      const allExhausted = state.totalItems > 0 && newUsedItems.length >= state.totalItems;

      return {
        ...state,
        turnRecords: [...state.turnRecords, newRecord],
        usedItems: newUsedItems,
        currentPlayer: allExhausted
          ? state.currentPlayer
          : getNextActivePlayer(state.currentPlayer, state.activePlayers),
        turnStartTime: now,
        confirmationItem: null,
        transcribedText: '',
        errorMessage: null,
        isGameOver: allExhausted,
        isDraw: allExhausted,
        hintPhase: 'none',
        hintPokemonName: null,
        hintPokemonId: null,
        currentQuestion: null,
      };
    }

    case 'REJECT_ITEM':
      return { ...state, confirmationItem: null, transcribedText: '' };

    case 'GIVE_UP': {
      const newActive = state.activePlayers.filter(
        (p) => p !== state.currentPlayer
      );
      const newEliminated = [...state.eliminatedPlayers, state.currentPlayer];

      if (newActive.length === 1) {
        return {
          ...state,
          activePlayers: newActive,
          eliminatedPlayers: newEliminated,
          isGameOver: true,
          winner: newActive[0],
          confirmationItem: null,
          hintPhase: 'none',
          hintPokemonName: null,
          hintPokemonId: null,
          currentQuestion: null,
        };
      }

      return {
        ...state,
        activePlayers: newActive,
        eliminatedPlayers: newEliminated,
        // Advance from the *unfiltered* list (which still contains the current
        // player) so indexOf resolves and the turn passes to the next player in
        // seating order. Passing the already-filtered newActive made indexOf
        // return -1, always sending the turn back to the first survivor.
        currentPlayer: getNextActivePlayer(state.currentPlayer, state.activePlayers),
        // Start the next player's turn clock now: a give-up creates no record,
        // so without this reset the give-up deliberation would be charged to
        // the next player's recorded turn duration.
        turnStartTime: Date.now(),
        confirmationItem: null,
        hintPhase: 'none',
        hintPokemonName: null,
        hintPokemonId: null,
        currentQuestion: null,
      };
    }

    case 'SET_ERROR':
      return { ...state, errorMessage: action.message };

    case 'RESET':
      return createInitialState({
        category: state.category,
        players: state.players,
      });

    case 'PROPOSE_GEN_CHANGE': {
      if (state.quizConfig) return state;
      if (state.pendingGenVote) return state;
      const initialVotes: Record<string, boolean> = {};
      if (action.source === 'auto-detect') {
        initialVotes[state.currentPlayer] = true;
      }
      return {
        ...state,
        pendingGenVote: {
          generation: action.generation,
          triggerPokemon: action.triggerPokemon,
          votes: initialVotes,
          requiredVoters: [...state.activePlayers],
          source: action.source,
          action: action.action,
        },
        errorMessage: null,
        transcribedText: '',
      };
    }

    case 'SHOW_HINT':
      return {
        ...state,
        hintPhase: 'silhouette',
        hintPokemonName: action.pokemonName,
        hintPokemonId: action.pokemonId,
      };

    case 'REVEAL_HINT': {
      const newRevealed = state.revealedHints.length < 5 && state.hintPokemonName && state.hintPokemonId
        ? [...state.revealedHints, { pokemonName: state.hintPokemonName, pokemonId: state.hintPokemonId, source: 'hint' as const }]
        : state.revealedHints;
      return {
        ...state,
        hintPhase: 'revealed',
        hintsUsed: {
          ...state.hintsUsed,
          [state.currentPlayer]: (state.hintsUsed[state.currentPlayer] ?? 0) + 1,
        },
        revealedHints: newRevealed,
      };
    }

    case 'DISMISS_HINT':
      return {
        ...state,
        hintPhase: 'none',
        hintPokemonName: null,
        hintPokemonId: null,
      };

    case 'CAST_GEN_VOTE': {
      if (!state.pendingGenVote) return state;
      const newVotes = { ...state.pendingGenVote.votes, [action.player]: action.approve };
      const allVoted = state.pendingGenVote.requiredVoters.every((p) => p in newVotes);

      if (!allVoted) {
        return {
          ...state,
          pendingGenVote: { ...state.pendingGenVote, votes: newVotes },
        };
      }

      const yesCount = Object.values(newVotes).filter(Boolean).length;
      const totalVoters = state.pendingGenVote.requiredVoters.length;
      const approved = totalVoters === 1 ? yesCount === 1 : yesCount > totalVoters / 2;

      if (!approved) {
        return {
          ...state,
          pendingGenVote: null,
        };
      }

      // Approved: a 'remove' vote filters the gen out, an 'add' vote appends it.
      // (Removal is only ever proposed for an already-active gen with no items
      // named from it — canRemove in GenerationSettingsModal — so filtering can't
      // orphan a used item, and add is only proposed for an inactive gen so it
      // can't duplicate.)
      const newGens =
        state.pendingGenVote.action === 'remove'
          ? state.activeGenerations.filter((g) => g !== state.pendingGenVote!.generation)
          : [...state.activeGenerations, state.pendingGenVote.generation];
      const newTotalItems = computeTotalItems(state.category, newGens);
      const vote = state.pendingGenVote;

      if (vote.source === 'auto-detect' && vote.triggerPokemon) {
        const now = Date.now();
        const newRecord = {
          player: state.currentPlayer,
          item: vote.triggerPokemon,
          timestamp: now,
          durationMs: now - state.turnStartTime,
        };
        const newUsedItems = [...state.usedItems, vote.triggerPokemon];
        const allExhausted = newTotalItems > 0 && newUsedItems.length >= newTotalItems;

        return {
          ...state,
          activeGenerations: newGens,
          totalItems: newTotalItems,
          pendingGenVote: null,
          turnRecords: [...state.turnRecords, newRecord],
          usedItems: newUsedItems,
          currentPlayer: allExhausted
            ? state.currentPlayer
            : getNextActivePlayer(state.currentPlayer, state.activePlayers),
          turnStartTime: now,
          confirmationItem: null,
          transcribedText: '',
          errorMessage: null,
          isGameOver: allExhausted,
          isDraw: allExhausted,
        };
      }

      return {
        ...state,
        activeGenerations: newGens,
        totalItems: newTotalItems,
        pendingGenVote: null,
      };
    }

    case 'SET_QUESTION':
      return {
        ...state,
        currentQuestion: action.question,
      };

    case 'QUESTION_POOL_EXHAUSTED':
      return {
        ...state,
        isGameOver: true,
        isDraw: true,
        currentQuestion: null,
      };

    default:
      return state;
  }
}
