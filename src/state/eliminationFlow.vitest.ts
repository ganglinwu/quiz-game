import { describe, it, expect } from 'vitest';
import { gameReducer, createInitialState } from './gameReducer';
import { Category, GameState } from '../types';

// Companion to gameReducer.vitest.ts / gamePaths.vitest.ts. Those files exercise a
// single GIVE_UP in isolation (Bug 18 turn order) and single-element
// eliminatedPlayers arrays. This file walks the *whole* elimination-to-a-winner
// arc — the core "who wins" path — as an end-to-end sequence, guarding the
// cross-action interaction that no isolated test reaches:
//
//   GIVE_UP shrinks activePlayers, then a LATER CONFIRM_ITEM must rotate the turn
//   within that already-shrunken roster (skipping the eliminated player). Every
//   existing confirm test runs on the full, never-shrunk roster, so a regression
//   where CONFIRM_ITEM's getNextActivePlayer stops skipping the gone player would
//   pass all of them and only fail here.
//
// It also locks the full eliminatedPlayers ORDER (give-up order) and the final
// survivor as winner, which only single give-ups have asserted so far.

const gen1: Category = { type: 'pokemon', generations: [1] };

// Drive a scored turn the way the UI does: propose then confirm.
function confirm(state: GameState, item: string): GameState {
  const proposed = gameReducer(state, { type: 'PROPOSE_ITEM', item });
  return gameReducer(proposed, { type: 'CONFIRM_ITEM' });
}

function giveUp(state: GameState): GameState {
  return gameReducer(state, { type: 'GIVE_UP' });
}

describe('full elimination arc: give-ups down to a single winner', () => {
  it('accumulates eliminatedPlayers in give-up order and crowns the last survivor', () => {
    // 4 players. Roster shrinks as B, then D, then C give up; A is the only one
    // never to give up, so A wins. Confirms are interleaved so the turn clock
    // keeps rotating across a roster that is losing members mid-game.
    let s = createInitialState({ category: gen1, players: ['A', 'B', 'C', 'D'] });
    expect(s.currentPlayer).toBe('A');

    // A scores -> turn to B (full roster rotation).
    s = confirm(s, 'Bulbasaur');
    expect(s.currentPlayer).toBe('B');

    // B gives up -> roster becomes [A, C, D], turn passes to C (next in seating).
    s = giveUp(s);
    expect(s.activePlayers).toEqual(['A', 'C', 'D']);
    expect(s.eliminatedPlayers).toEqual(['B']);
    expect(s.currentPlayer).toBe('C');
    expect(s.isGameOver).toBe(false);

    // *** The key seam ***: C scores on the SHRUNKEN roster. The turn must go to
    // D (next active in seating), NOT back to A (the first survivor) — that only
    // holds if CONFIRM_ITEM rotates within the current [A, C, D], skipping gone B.
    s = confirm(s, 'Ivysaur');
    expect(s.currentPlayer).toBe('D');

    // D gives up -> roster [A, C], wraps the turn back to A.
    s = giveUp(s);
    expect(s.activePlayers).toEqual(['A', 'C']);
    expect(s.eliminatedPlayers).toEqual(['B', 'D']);
    expect(s.currentPlayer).toBe('A');
    expect(s.isGameOver).toBe(false);

    // A scores on the 2-player roster -> turn to C.
    s = confirm(s, 'Venusaur');
    expect(s.currentPlayer).toBe('C');

    // C gives up -> only A remains: game over, A wins, C is the last eliminated.
    s = giveUp(s);
    expect(s.isGameOver).toBe(true);
    expect(s.isDraw).toBe(false);
    expect(s.winner).toBe('A');
    expect(s.activePlayers).toEqual(['A']);
    expect(s.eliminatedPlayers).toEqual(['B', 'D', 'C']);
    // Three real scored turns survived the whole arc.
    expect(s.usedItems).toEqual(['Bulbasaur', 'Ivysaur', 'Venusaur']);
    expect(s.turnRecords).toHaveLength(3);
  });

  it('never hands an eliminated player another turn across repeated confirms', () => {
    // 3 players; B gives up early, then A and C trade confirms for several turns.
    // The turn must strictly alternate A <-> C forever and never land on B, even
    // though B still sits in the original players[] list.
    let s = createInitialState({ category: gen1, players: ['A', 'B', 'C'] });

    s = confirm(s, 'mon-1'); // A scores -> B
    expect(s.currentPlayer).toBe('B');

    s = giveUp(s); // B out -> [A, C], turn to C
    expect(s.eliminatedPlayers).toEqual(['B']);
    expect(s.currentPlayer).toBe('C');

    // Five more confirms on the [A, C] roster. Collect who is up each time.
    const seen: string[] = [];
    for (let i = 2; i <= 6; i++) {
      s = confirm(s, `mon-${i}`);
      seen.push(s.currentPlayer);
    }

    // Strict A/C alternation starting from C's confirm -> A, then C, A, C, A.
    expect(seen).toEqual(['A', 'C', 'A', 'C', 'A']);
    // The eliminated player is never handed the turn.
    expect(seen).not.toContain('B');
    expect(s.isGameOver).toBe(false);
    expect(s.winner).toBeNull();
  });
});
