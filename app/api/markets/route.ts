import {
  bestAsk,
  configFromEnv,
  createDex,
  gateForWrite,
  listBinaryMarkets,
  resolveScale,
  upSymbol,
  type Dex,
} from '@anker/dex';

export const dynamic = 'force-dynamic';

/**
 * Live, tradable BTC Event Contracts with their best ask.
 *
 * Server-side so the SDK's websocket and indexer client stay off the browser
 * bundle, and so every DreamDEX read still goes through @anker/dex — the UI
 * fetches this route, never DreamDEX.
 *
 * ## Why this caches so aggressively
 *
 * The DreamDEX indexer takes ~7s on a good call and intermittently connect-times-out
 * entirely. A page that awaits it on every mount reads as hung, and on a venue
 * whose markets live ~60s a 30-second wait returns data that has already expired.
 * So: serve the last good payload immediately and refresh behind it. Only the
 * very first request of a process ever waits, and a stale payload is labelled
 * rather than passed off as current.
 */

const FRESH_MS = 4_000;

interface Payload {
  serverTimeMs: number;
  markets: unknown[];
  stale?: boolean;
  ageMs?: number;
  error?: string;
}

let lastGood: { at: number; payload: Payload } | null = null;
/**
 * Read the cache through a function. `kickRefresh()` fills `lastGood`
 * asynchronously, which TS's control-flow analysis cannot see — reading the
 * variable directly after an early `if (lastGood) return` narrows it to `never`.
 */
const getLastGood = () => lastGood;
let refreshing: Promise<void> | null = null;

/** Module-scope so the exchange (and its sockets) is reused across requests. */
let dexSingleton: Dex | null = null;
function getDex(): Dex {
  dexSingleton ??= createDex(configFromEnv());
  return dexSingleton;
}

async function buildPayload(): Promise<Payload> {
  const dex = getDex();
  const markets = await listBinaryMarkets(dex, { force: true, asset: 'BTC', limit: 60 });
  const nowSec = Math.floor(Date.now() / 1000);

  const candidates = markets
    .filter((m) => m.mode === 'fixed' && m.expirySec > nowSec)
    .sort((a, b) => a.expirySec - b.expirySec)
    .slice(0, 8);

  // Enrich in parallel: sequentially this was ~16 round-trips of several hundred
  // ms each, and the result was stale before it finished assembling.
  const enriched = await Promise.all(
    candidates.map(async (market) => {
      const gate = await gateForWrite(dex, market);
      if (!gate.ok) return null;
      const [ask, scale] = await Promise.all([
        bestAsk(dex, market),
        resolveScale(dex.read, market.collateral),
      ]);
      return {
        marketId: market.marketId,
        symbol: market.symbol,
        upSymbol: upSymbol(market),
        asset: market.asset,
        strikeRaw: market.strikeRaw,
        expirySec: market.expirySec,
        collateral: market.collateral,
        decimals: scale.decimals,
        askRaw: ask.kind === 'ask' ? ask.priceRaw.toString() : null,
        askSizeRaw: ask.kind === 'ask' ? ask.sizeRaw.toString() : null,
      };
    }),
  );

  return {
    // Server clock, not the browser's — a client with skewed time would
    // otherwise mis-rank expiries on a venue whose markets live ~60s.
    serverTimeMs: Date.now(),
    markets: enriched.filter((row) => row !== null),
  };
}

/** Refresh behind the response. Never rejects: a failed refresh keeps the last good payload. */
function kickRefresh(): Promise<void> {
  refreshing ??= buildPayload()
    .then((payload) => {
      lastGood = { at: Date.now(), payload };
    })
    .catch(() => {
      /* keep serving lastGood */
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function GET() {
  const now = Date.now();

  const cached = getLastGood();
  if (cached && now - cached.at < FRESH_MS) {
    return Response.json(cached.payload, { headers: { 'cache-control': 's-maxage=4' } });
  }

  if (cached) {
    const ageMs = now - cached.at;
    void kickRefresh(); // deliberately not awaited
    return Response.json(
      { ...cached.payload, stale: true, ageMs },
      { headers: { 'cache-control': 's-maxage=4' } },
    );
  }

  // Cold start only: nothing cached, so this one has to wait.
  try {
    await kickRefresh();
    const warmed = getLastGood();
    if (!warmed) throw new Error('DreamDEX indexer did not respond.');
    return Response.json(warmed.payload, { headers: { 'cache-control': 's-maxage=4' } });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'DreamDEX market read failed.',
        serverTimeMs: Date.now(),
        markets: [],
      },
      { status: 502 },
    );
  }
}
