import { fetchPolymarketBtcThresholds } from '../../../src/benchmark/polymarket';

export const dynamic = 'force-dynamic';

const TTL_MS = 30_000;
let cache: { expiresAt: number; payload: unknown } | null = null;

/** BTC above-threshold markets from Polymarket, for the Event Contract benchmark. */
export async function GET() {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return Response.json(cache.payload, { headers: { 'cache-control': 's-maxage=30' } });
  }
  try {
    const thresholds = await fetchPolymarketBtcThresholds();
    const payload = { thresholds, fetchedAtMs: now };
    cache = { expiresAt: now + TTL_MS, payload };
    return Response.json(payload, { headers: { 'cache-control': 's-maxage=30' } });
  } catch (error) {
    return Response.json(
      { thresholds: [], fetchedAtMs: now, error: error instanceof Error ? error.message : 'Polymarket read failed.' },
      { status: 502 },
    );
  }
}
