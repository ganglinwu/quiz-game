import React, { createContext, useContext, useReducer } from 'react';
import { Category, GameAction, GameState, HintLimit } from '../types';
import { createInitialState, gameReducer } from './gameReducer';

interface GameContextValue {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({
  category,
  players,
  hintLimit,
  children,
}: {
  category: Category;
  players: string[];
  hintLimit?: HintLimit;
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(gameReducer, { category, players, hintLimit }, createInitialState);

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
