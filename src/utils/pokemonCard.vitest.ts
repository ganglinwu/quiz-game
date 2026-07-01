import { describe, it, expect } from 'vitest';
import { getCryUrl, statColor } from './pokemonCard';

// getCryUrl and statColor are the two pure display helpers behind the Pokémon
// card modal (reachable from the Pokédex grid and the post-game learning
// section). They were module-private inside PokemonCardModal.tsx — the cry URL
// drives the tap-to-play audio and statColor tints every base-stat bar — so a
// regression in either was previously silent and user-visible. These pin the
// slug-normalization contract and the color-tier boundaries.

const CRY_PREFIX = 'https://play.pokemonshowdown.com/audio/cries/';

describe('getCryUrl', () => {
  it('lowercases and wraps a plain name in the Showdown cry URL', () => {
    expect(getCryUrl('Pikachu')).toBe(`${CRY_PREFIX}pikachu.mp3`);
  });

  it('leaves an already-lowercase name unchanged apart from the URL frame', () => {
    expect(getCryUrl('bulbasaur')).toBe(`${CRY_PREFIX}bulbasaur.mp3`);
  });

  describe('punctuation is stripped to a Showdown-valid slug', () => {
    it("drops an apostrophe (Farfetch'd -> farfetchd)", () => {
      expect(getCryUrl("Farfetch'd")).toBe(`${CRY_PREFIX}farfetchd.mp3`);
    });

    it('drops a period and space (Mr. Mime -> mrmime)', () => {
      expect(getCryUrl('Mr. Mime')).toBe(`${CRY_PREFIX}mrmime.mp3`);
    });

    it('drops a hyphen (Ho-Oh -> hooh)', () => {
      expect(getCryUrl('Ho-Oh')).toBe(`${CRY_PREFIX}hooh.mp3`);
    });

    it('drops a hyphen before a suffix letter (Porygon-Z -> porygonz)', () => {
      expect(getCryUrl('Porygon-Z')).toBe(`${CRY_PREFIX}porygonz.mp3`);
    });

    it('drops a colon and space (Type: Null -> typenull)', () => {
      expect(getCryUrl('Type: Null')).toBe(`${CRY_PREFIX}typenull.mp3`);
    });
  });

  describe('characterization: normalization is lossy for symbols and accents', () => {
    it('collapses both gender symbols to the same slug (Nidoran♀/♂ -> nidoran)', () => {
      // Showdown distinguishes these as nidoranf/nidoranm; the strip loses that,
      // so both cry URLs 404 rather than crash. Pinned as current behavior.
      expect(getCryUrl('Nidoran♀')).toBe(`${CRY_PREFIX}nidoran.mp3`);
      expect(getCryUrl('Nidoran♂')).toBe(`${CRY_PREFIX}nidoran.mp3`);
      expect(getCryUrl('Nidoran♀')).toBe(getCryUrl('Nidoran♂'));
    });

    it('strips accented characters entirely (Flabébé -> flabb)', () => {
      // The é bytes are outside [a-z0-9], so they are removed rather than
      // transliterated to "flabebe". Characterized, not fixed.
      expect(getCryUrl('Flabébé')).toBe(`${CRY_PREFIX}flabb.mp3`);
    });
  });

  it('always produces the fixed prefix and .mp3 suffix', () => {
    const url = getCryUrl('Charizard');
    expect(url.startsWith(CRY_PREFIX)).toBe(true);
    expect(url.endsWith('.mp3')).toBe(true);
  });
});

describe('statColor', () => {
  const GREEN = '#4CAF50';
  const AMBER = '#FFC107';
  const RED = '#F44336';

  describe('green tier (>= 100)', () => {
    it('is green exactly at the 100 boundary', () => {
      expect(statColor(100)).toBe(GREEN);
    });

    it('is green above 100', () => {
      expect(statColor(150)).toBe(GREEN);
    });

    it('is green at the 255 max base stat', () => {
      expect(statColor(255)).toBe(GREEN);
    });
  });

  describe('amber tier (60..99)', () => {
    it('is amber exactly at the 60 boundary', () => {
      expect(statColor(60)).toBe(AMBER);
    });

    it('is amber just below the green boundary (99)', () => {
      expect(statColor(99)).toBe(AMBER);
    });
  });

  describe('red tier (< 60)', () => {
    it('is red just below the amber boundary (59)', () => {
      expect(statColor(59)).toBe(RED);
    });

    it('is red at a low stat (1)', () => {
      expect(statColor(1)).toBe(RED);
    });

    it('is red at zero', () => {
      expect(statColor(0)).toBe(RED);
    });
  });
});
