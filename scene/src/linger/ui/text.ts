/**
 * Display-text helpers.
 *
 * Pure string functions, no SDK imports, so they are unit-testable outside the
 * Decentraland runtime.
 */

/**
 * Longest name we render.
 *
 * The widest card is 460 px with 22 px padding either side, so ~416 px usable. The Bond
 * card renders names at 34 px, where a sans-serif glyph averages roughly 0.55em ≈ 19 px.
 * That is about 21 characters before the line wraps. 18 leaves headroom for wide glyphs.
 */
export const NAME_MAX = 18

/**
 * Bound a player name for display.
 *
 * WHY THIS EXISTS: the server caps display names at 40 characters, and react-ecs `uiText`
 * defaults to `textWrap: 'wrap'`. A 40-character name at 34 px therefore wraps onto two or
 * three lines inside a container with a FIXED 44 px height, and the overflow lands on top
 * of the text below it. On the Bond card that means the celebration — the emotional peak
 * of the product — renders as overlapping garbage for anyone with a long Decentraland
 * name, and long names with a `#1234` suffix are entirely normal.
 *
 * Truncating is the smallest fix that actually bounds the problem; growing the containers
 * would not, since the name length is not bounded by anything the UI controls.
 */
export function forDisplay(name: string | undefined | null, max: number = NAME_MAX): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return 'Someone'
  if (trimmed.length <= max) return trimmed
  // Ellipsis costs one character, so cut one short of the budget.
  return trimmed.slice(0, max - 1) + '…'
}
