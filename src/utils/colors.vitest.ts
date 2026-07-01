import { describe, it, expect } from 'vitest';
import { getPlayerColor, PLAYER_COLORS } from './colors';
import { gameReducer, createInitialState } from '../state/gameReducer';
import { Category, GameState } from '../types';

// colors.ts had no coverage. getPlayerColor is the ONLY thing that turns a
// player name into the swatch shown on the winner line, history rows, stats
// panel, vote overlay and current-turn banner. The whole scheme rests on one
// documented promise (CLAUDE.md): "Player colors assigned by index in the
// original player order, persist even after elimination."
//
// That promise is a wiring choice, not a property of getPlayerColor itself:
// every call site passes state.players (the immutable original roster), NOT
// state.activePlayers (which shrinks on each give-up). If any screen ever
// swapped in activePlayers, a survivor's swatch would silently shift to an
// eliminated player's color mid-game. No existing test guards that, so the two
// halves below are (1) the pure index math and (2) the persistence seam driven
// through the real reducer's elimination flow.

const gen1: Category = { type: 'pokemon', generations: [1] };

function confirm(state: GameState, item: string): GameState {
  const proposed = gameReducer(state, { type: 'PROPOSE_ITEM', item });
  return gameReducer(proposed, { type: 'CONFIRM_ITEM' });
}

describe('getPlayerColor: index math', () => {
  const roster = ['A', 'B', 'C', 'D'];

  it('maps each player to the palette entry at its roster index', () => {
    expect(getPlayerColor('A', roster)).toBe(PLAYER_COLORS[0]);
    expect(getPlayerColor('B', roster)).toBe(PLAYER_COLORS[1]);
    expect(getPlayerColor('C', roster)).toBe(PLAYER_COLORS[2]);
    expect(getPlayerColor('D', roster)).toBe(PLAYER_COLORS[3]);
  });

  it('gives the 8 supported players 8 distinct colors', () => {
    const eight = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
    const colors = eight.map((p) => getPlayerColor(p, eight));
    expect(new Set(colors).size).toBe(8);
    expect(colors).toEqual(PLAYER_COLORS);
  });

  it('wraps past the 8-color palette with modulo (defensive; game caps at 8)', () => {
    // A hypothetical 9th player reuses the first swatch rather than reading
    // undefined off the end of the array.
    const nine = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    expect(getPlayerColor('p8', nine)).toBe(PLAYER_COLORS[8 % PLAYER_COLORS.length]);
    expect(getPlayerColor('p8', nine)).toBe(PLAYER_COLORS[0]);
  });

  it('falls back to the first color for a name absent from the roster', () => {
    // indexOf === -1 must not index PLAYER_COLORS[-1] (undefined) — the guard
    // resolves it to slot 0. Covers a stale name reaching a screen after RESET.
    expect(getPlayerColor('ghost', roster)).toBe(PLAYER_COLORS[0]);
  });

  it('resolves a duplicated name to its FIRST occurrence (indexOf semantics)', () => {
    // Nothing enforces unique names at the color layer; two "A"s both read the
    // color of the first "A". Locks the observable behavior, not an endorsement.
    expect(getPlayerColor('A', ['A', 'A', 'B'])).toBe(PLAYER_COLORS[0]);
  });
});

describe('color persistence across elimination (the load-bearing seam)', () => {
  it('keeps every color pinned to original seating index as the roster shrinks', () => {
    // 4-player game; B then D give up. state.players never changes, so colors
    // computed against it are frozen from turn one through the final winner.
    let s = createInitialState({ category: gen1, players: ['A', 'B', 'C', 'D'] });

    const before = {
      A: getPlayerColor('A', s.players),
      B: getPlayerColor('B', s.players),
      C: getPlayerColor('C', s.players),
      D: getPlayerColor('D', s.players),
    };

    s = confirm(s, 'Bulbasaur'); // A scores -> B
    s = gameReducer(s, { type: 'GIVE_UP' }); // B out -> [A, C, D]
    expect(s.activePlayers).toEqual(['A', 'C', 'D']);

    s = confirm(s, 'Ivysaur'); // C scores -> D
    s = gameReducer(s, { type: 'GIVE_UP' }); // D out -> [A, C]
    expect(s.activePlayers).toEqual(['A', 'C']);

    // Survivors and eliminated players alike still read their turn-one color.
    expect(getPlayerColor('A', s.players)).toBe(before.A);
    expect(getPlayerColor('B', s.players)).toBe(before.B); // eliminated, still yellow
    expect(getPlayerColor('C', s.players)).toBe(before.C);
    expect(getPlayerColor('D', s.players)).toBe(before.D);

    // The ResultScreen winner line reads getPlayerColor(winner, state.players):
    s = confirm(s, 'Venusaur'); // A scores -> C
    s = gameReducer(s, { type: 'GIVE_UP' }); // C out -> A wins
    expect(s.winner).toBe('A');
    expect(getPlayerColor(s.winner!, s.players)).toBe(before.A);
  });

  it('DIVERGES from state.players if a screen wrongly passed activePlayers', () => {
    // This is why the source-of-truth choice matters. After B is eliminated,
    // C sits at index 1 of the shrunken activePlayers — which is B's original
    // color. Reading against activePlayers would recolor a survivor with a
    // dead player's swatch; reading against players does not. A regression that
    // swapped the argument at any call site would flip this assertion.
    let s = createInitialState({ category: gen1, players: ['A', 'B', 'C', 'D'] });
    s = confirm(s, 'Bulbasaur');
    s = gameReducer(s, { type: 'GIVE_UP' }); // B out -> activePlayers [A, C, D]

    const stable = getPlayerColor('C', s.players); // PLAYER_COLORS[2]
    const shifted = getPlayerColor('C', s.activePlayers); // PLAYER_COLORS[1] == B's

    expect(stable).toBe(PLAYER_COLORS[2]);
    expect(shifted).toBe(PLAYER_COLORS[1]);
    expect(shifted).not.toBe(stable);
    // The shifted value is exactly the eliminated player's original color —
    // the concrete visual bug the state.players wiring prevents.
    expect(shifted).toBe(getPlayerColor('B', s.players));
  });
});
