/**
 * Pure display helpers extracted from PokemonCardModal so they are unit-testable
 * under vitest-node without an RN render.
 */

/**
 * Build the Pokémon Showdown cry-audio URL for a Pokémon name.
 *
 * The name is slugified by lowercasing then stripping every character that is
 * not [a-z0-9]. This cleanly handles apostrophes, periods, hyphens and colons
 * (Farfetch'd → farfetchd, Mr. Mime → mrmime, Ho-Oh → hooh, Type: Null →
 * typenull), but is deliberately lossy for gender symbols and accents:
 * Nidoran♀ and Nidoran♂ both collapse to "nidoran", and Flabébé → "flabb".
 * A wrong slug only 404s the cry (handled gracefully by the caller), it never
 * crashes — so the lossy cases are characterized, not fixed here.
 */
export function getCryUrl(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `https://play.pokemonshowdown.com/audio/cries/${slug}.mp3`;
}

/**
 * Map a base-stat value to its stat-bar color: green (≥100), amber (≥60),
 * red (<60). Thresholds are inclusive on the lower bound.
 */
export function statColor(value: number): string {
  if (value >= 100) return '#4CAF50';
  if (value >= 60) return '#FFC107';
  return '#F44336';
}
