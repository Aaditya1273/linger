import {
  bestAsk,
  configFromEnv,
  createDex,
  gateForWrite,
  listBinaryMarkets,
  resolveScale,
  upSymbol,
} from '@anker/dex';

export const dynamic = 'force-dynamic';

/**
 * Live, tradable BTC Event Contracts with their best ask.
 *
 * Server-side so the SDK's websocket + indexer client stay off the browser
 * bundle, and so every DreamDEX read still goes through @anker/dex — the UI
 * fetches this route, never DreamDEX.
 */
export async function GET() {
  try {
    const dex = createDex(configFromEnv());
    const markets = await listBinaryMarkets(dex, { force: true });
    const nowSec = Math.floor(Date.now() / 1000);

    const btc = markets
      .filter((m) => m.asset === 'BTC' && m.mode === 'fixed' && m.expirySec > nowSec)
      .sort((a, b) => a.expirySec - b.expirySec)
      .slice(0, 12);

    const rows = [];
    for (const market of btc) {
      const gate = await gateForWrite(dex, market);
      if (!gate.ok) continue;
      const ask = await bestAsk(dex, market);
      const scale = await resolveScale(dex.read, market.collateral);
      rows.push({
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
      });
    }

    return Response.json(
      // Server clock, not the browser's — a client with skewed time would
      // otherwise mis-rank expiries on a venue whose markets live ~60s.
      { serverTimeMs: Date.now(), markets: rows },
      { headers: { 'cache-control': 's-maxage=5, stale-while-revalidate=10' } },
    );
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
