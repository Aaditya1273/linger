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
 * Serverless duration. The DreamDEX indexer can take ~7s on a good call and
 * occasionally connect-times-out, so the default 10s ceiling is not enough
 * headroom for a cold container. The hard budget below means we never actually
 * need this much — it exists so a slow upstream degrades instead of 504-ing.
 */
export const maxDuration = 30;

/**
 * Hard budget for a cold build. Whatever has not arrived by now is abandoned and
 * the route answers with stale data (or an honest empty list) rather than being
 * killed by the platform. A 504 tells the client nothing; an empty list with an
 * error field renders a real message.
 */
/**
 * Measured cold vs warm, same container:
 *
 *   pass 1 (cold)  13.5s   ← RPC connection + SDK ABI/module resolution
 *   pass 2 (warm)   1.2s
 *   pass 3 (warm)   0.4s   (a single eth_call is ~0.4s)
 *
 * So the expensive part is a ONE-OFF per container, not per request. No request
 * should ever wait for it: 13.5s exceeds a 10s serverless ceiling, and a request
 * killed by the platform returns a 504 that tells the client nothing.
 *
 * Instead a request with nothing cached waits only long enough to catch a lucky
 * fast build, then answers 503 + `retry-after` while the refresh continues in the
 * background. The client retries and lands on a warm cache. Total time to first
 * data is the same; the difference is that it arrives as data rather than as a
 * gateway timeout.
 */
const BUDGET_MS = 1_500;

function withBudget<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    work,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

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
    .slice(0, 6);

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

// Start warming the moment the container boots rather than when the first
// request arrives, so the one-off ~7s connection cost overlaps with cold start
// instead of being added to it. Fire-and-forget by design.
void kickRefresh();

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

  // Cold start only: nothing cached, so this one has to wait — but not forever.
  // The refresh keeps running in the background past the budget, so the next
  // request usually finds it warm even when this one gave up.
  await withBudget(kickRefresh(), BUDGET_MS);
  const warmed = getLastGood();
  if (warmed) {
    return Response.json(warmed.payload, { headers: { 'cache-control': 's-maxage=4' } });
  }

  return Response.json(
    {
      warming: true,
      error: 'Connecting to DreamDEX. This takes a few seconds on a cold start; retrying automatically.',
      serverTimeMs: Date.now(),
      markets: [],
    },
    { status: 503, headers: { 'retry-after': '2', 'cache-control': 'no-store' } },
  );
}
