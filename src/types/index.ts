export type Category =
  | { type: 'pokemon'; generations: number[] }
  | { type: 'fruits' };

export interface PokemonItem {
  name: string;
  pokedexNumber: number;
}

export interface FruitItem {
  name: string;
}

export interface TurnRecord {
  player: string;
  item: string;
  timestamp: number;
}

export interface GenerationVote {
  generation: number;
  triggerPokemon: string | null;
  votes: Record<string, boolean>;
  requiredVoters: string[];
  source: 'auto-detect' | 'settings';
}

export type HintLimit = 'unlimited' | number;

export type HintPhase = 'none' | 'silhouette' | 'revealed';

export interface HintRecord {
  pokemonName: string;
  pokemonId: number;
  source: 'hint' | 'bonus';
}

export interface GameState {
  category: Category;
  players: string[];
  activePlayers: string[];
  eliminatedPlayers: string[];
  currentPlayer: string;
  turnRecords: TurnRecord[];
  usedItems: string[];
  gameStartTime: number;
  turnStartTime: number;
  totalItems: number;
  activeGenerations: number[];
  pendingGenVote: GenerationVote | null;
  isGameOver: boolean;
  isDraw: boolean;
  winner: string | null;
  confirmationItem: string | null;
  isListening: boolean;
  transcribedText: string;
  errorMessage: string | null;
  hintLimit: HintLimit;
  hintsUsed: Record<string, number>;
  hintPhase: HintPhase;
  hintPokemonName: string | null;
  hintPokemonId: number | null;
  revealedHints: HintRecord[];
}

export interface PlayerStat {
  totalItems: number;
  avgTurnTime: number;
}

export interface GameStats {
  playerStats: Record<string, PlayerStat>;
  totalGameTime: number;
  totalTurns: number;
  fastestTurn: { player: string; time: number; item: string } | null;
  slowestTurn: { player: string; time: number; item: string } | null;
}

export type GameAction =
  | { type: 'START_GAME'; category: Category; players: string[] }
  | { type: 'SET_LISTENING'; isListening: boolean }
  | { type: 'SET_TRANSCRIBED_TEXT'; text: string }
  | { type: 'PROPOSE_ITEM'; item: string }
  | { type: 'CONFIRM_ITEM' }
  | { type: 'REJECT_ITEM' }
  | { type: 'GIVE_UP' }
  | { type: 'SET_ERROR'; message: string | null }
  | { type: 'RESET' }
  | { type: 'PROPOSE_GEN_CHANGE'; generation: number; triggerPokemon: string | null; source: 'auto-detect' | 'settings' }
  | { type: 'CAST_GEN_VOTE'; player: string; approve: boolean }
  | { type: 'SHOW_HINT'; pokemonName: string; pokemonId: number }
  | { type: 'REVEAL_HINT' }
  | { type: 'DISMISS_HINT' };
