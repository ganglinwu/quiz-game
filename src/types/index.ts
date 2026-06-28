export type QuizDifficulty = 'easy' | 'medium' | 'hard';

export type QuizConstraint =
  | { kind: 'generation'; generation: number }
  | { kind: 'type'; pokemonType: string }
  | { kind: 'legendary'; value: boolean }
  | { kind: 'mythical'; value: boolean }
  | { kind: 'evolutionStage'; stage: 'base' | 'middle' | 'final' }
  | { kind: 'dualType'; value: boolean }
  | { kind: 'superEffective'; targetType: string }
  | { kind: 'statRank'; stat: StatName; topN: number };

export type StatName = 'hp' | 'attack' | 'defense' | 'sp_attack' | 'sp_defense' | 'speed';

export interface QuizQuestion {
  constraints: QuizConstraint[];
  promptText: string;
  validAnswerCount: number;
  difficulty: QuizDifficulty;
}

export interface QuizFilter {
  types?: string[];
  includeLegendary: boolean;
  includeMythical: boolean;
  evolutionStages?: ('base' | 'middle' | 'final')[];
  allowDualType?: boolean;
  stats?: StatName[];
}

export interface QuizConfig {
  difficulty: QuizDifficulty;
  filter: QuizFilter;
  hardcore: boolean;
}

export type Category =
  | { type: 'pokemon'; generations: number[]; quizConfig?: QuizConfig }
  | { type: 'fruits' };

export interface PokemonItem {
  name: string;
  pokedexNumber: number;
  isLegendary?: number;
  isMythical?: number;
}

export interface FruitItem {
  name: string;
}

export interface TurnRecord {
  player: string;
  item: string;
  timestamp: number;
  // Wall-clock ms this player actually spent on the turn (captured at record
  // creation as now - turnStartTime). Stored rather than differenced from
  // adjacent timestamps so a give-up (which creates no record) can't bleed its
  // deliberation time into the next player's turn.
  durationMs: number;
}

export interface GenerationVote {
  generation: number;
  triggerPokemon: string | null;
  votes: Record<string, boolean>;
  requiredVoters: string[];
  source: 'auto-detect' | 'settings';
  action: 'add' | 'remove';
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
  quizConfig: QuizConfig | null;
  currentQuestion: QuizQuestion | null;
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
  | { type: 'PROPOSE_GEN_CHANGE'; generation: number; triggerPokemon: string | null; source: 'auto-detect' | 'settings'; action: 'add' | 'remove' }
  | { type: 'CAST_GEN_VOTE'; player: string; approve: boolean }
  | { type: 'SHOW_HINT'; pokemonName: string; pokemonId: number }
  | { type: 'REVEAL_HINT' }
  | { type: 'DISMISS_HINT' }
  | { type: 'SET_QUESTION'; question: QuizQuestion }
  | { type: 'QUESTION_POOL_EXHAUSTED' };
