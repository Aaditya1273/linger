import { fetchPolymarketBtcThresholds } from '../../../src/benchmark/polymarket';

export const dynamic = 'force-dynamic';
/** Upstream-bound; the default 10s ceiling is too tight for a cold container. */
export const maxDuration = 20;

const TTL_MS = 30_000;
let cache: { expiresAt: number; payload: unknown } | null = null;

/** BTC above-threshold markets from Polymarket, for the Event Contract benchmark. */
export async function GET() {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return Response.json(cache.payload, { headers: { 'cache-control': 's-maxage=30' } });
  }
  try {
    // Gamma 5xx's intermittently; one blip should not blank the benchmark column.
    let thresholds;
    try {
      thresholds = await fetchPolymarketBtcThresholds();
    } catch {
      await new Promise((r) => setTimeout(r, 300));
      thresholds = await fetchPolymarketBtcThresholds();
    }
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
