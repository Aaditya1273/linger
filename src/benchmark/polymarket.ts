/**
 * Polymarket benchmark — comparing like with like.
 *
 * A DreamDEX binary and a Polymarket "Will BTC be above $X on <date>?" market
 * are the same instrument: a YES price on [0,1] that IS an implied probability.
 * So the comparison needs no APR translation and no tenor matching fudge — it
 * is probability against probability for the same strike and settlement.
 *
 * This is a better benchmark for Event Contracts than the Binance one it sits
 * beside: Binance Dual Investment is a day-scale *structured product* whose APR
 * has to be reverse-engineered, and it has nothing at Shannon's ~2.7h horizon.
 * Polymarket quotes the same shape Anker builds from, and it carries the strike
 * ladder DreamDEX Shannon does not.
 *
 * Read-only, unauthenticated, cached upstream by the route.
 */

export interface PolymarketBtcThreshold {
  /** Strike in whole USD, parsed from the question text. */
  readonly strikeUsd: number;
  /** YES implied probability, 0..1. */
  readonly yesProbability: number;
  readonly endDateMs: number;
  readonly question: string;
  readonly liquidityUsd: number;
}

const GAMMA_URL =
  'https://gamma-api.polymarket.com/markets?closed=false&limit=200&order=volume24hr&ascending=false';

/** "Will the price of Bitcoin be above $74,000 on September 11?" -> 74000 */
const ABOVE_PATTERN = /bitcoin\s+be\s+above\s+\$([\d,]+)/i;

interface GammaMarket {
  question?: string;
  endDate?: string;
  outcomes?: string;
  outcomePrices?: string;
  liquidity?: string;
}

function parseJsonArray(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * BTC above-threshold markets with a live YES price.
 *
 * Polymarket's Gamma API refuses a request without a User-Agent, returning an
 * empty body rather than an error — so a missing UA looks exactly like "no
 * markets". It is set explicitly here.
 */
export async function fetchPolymarketBtcThresholds(): Promise<PolymarketBtcThreshold[]> {
  const response = await fetch(GAMMA_URL, {
    headers: { 'user-agent': 'anker-protocol/0.1 (+https://www.ankerprotocol.xyz)' },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Polymarket Gamma API returned ${response.status}.`);
  }

  const rows = (await response.json()) as GammaMarket[];
  const out: PolymarketBtcThreshold[] = [];

  for (const row of rows) {
    const match = ABOVE_PATTERN.exec(row.question ?? '');
    if (!match?.[1]) continue;

    const outcomes = parseJsonArray(row.outcomes);
    const prices = parseJsonArray(row.outcomePrices);
    const yesIndex = outcomes.findIndex((o) => o.toLowerCase() === 'yes');
    const rawPrice = yesIndex >= 0 ? prices[yesIndex] : undefined;
    if (rawPrice === undefined) continue;

    const yesProbability = Number(rawPrice);
    const endDateMs = row.endDate ? Date.parse(row.endDate) : Number.NaN;
    if (!Number.isFinite(yesProbability) || !Number.isFinite(endDateMs)) continue;

    out.push({
      strikeUsd: Number(match[1].replaceAll(',', '')),
      yesProbability,
      endDateMs,
      question: row.question ?? '',
      liquidityUsd: Number(row.liquidity ?? '0'),
    });
  }

  return out.sort((a, b) => a.strikeUsd - b.strikeUsd);
}

/**
 * Nearest comparable Polymarket market for a DreamDEX strike.
 *
 * "Nearest" is by strike, and the offset is DISCLOSED rather than used to
 * suppress a comparison — the same rule ADR-0006 set for the Binance benchmark.
 * Returns null only when nothing is within `maxStrikeOffsetUsd`, because beyond
 * that the two markets are not asking the same question.
 */
export function nearestPolymarketThreshold(
  thresholds: readonly PolymarketBtcThreshold[],
  strikeUsd: number,
  maxStrikeOffsetUsd = 6_000,
): { match: PolymarketBtcThreshold; strikeOffsetUsd: number } | null {
  let best: { match: PolymarketBtcThreshold; strikeOffsetUsd: number } | null = null;
  for (const candidate of thresholds) {
    const offset = Math.abs(candidate.strikeUsd - strikeUsd);
    if (offset > maxStrikeOffsetUsd) continue;
    if (!best || offset < best.strikeOffsetUsd) best = { match: candidate, strikeOffsetUsd: offset };
  }
  return best;
}

/**
 * Edge in probability points: how much cheaper DreamDEX's YES is than
 * Polymarket's for the same question. Positive means Anker's leg costs less,
 * which is exactly what makes its coupon bigger.
 */
export function probabilityEdgePoints(dreamdexYes: number, polymarketYes: number): number {
  return (polymarketYes - dreamdexYes) * 100;
}
