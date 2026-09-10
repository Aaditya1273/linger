import { configFromEnv, createDex, scanSettled } from '@anker/dex';

export const dynamic = 'force-dynamic';

/** Recently settled markets — the redeem side of "markets die and respawn". */
export async function GET() {
  try {
    const dex = createDex(configFromEnv());
    const settled = await scanSettled(dex, { limit: 40 });
    return Response.json({
      settled: settled.map((s) => ({
        marketId: s.marketId,
        symbol: s.symbol,
        outcome: s.outcome,
        ...(s.yesWon === undefined ? {} : { yesWon: s.yesWon }),
      })),
    });
  } catch (error) {
    return Response.json(
      { settled: [], error: error instanceof Error ? error.message : 'Settled scan failed.' },
      { status: 502 },
    );
  }
}
