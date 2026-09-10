import { isDeterministicE2E } from '../../../../../src/config/runtimeModes';
import {
  fetchPredictMarketStateServer,
  toPredictMarketStateWire,
  type PredictMarketStateWire,
} from '../../../../../src/deepbook/predictMarketState';

export const dynamic = 'force-dynamic';

/** Deterministic E2E rows are never settled; expiry parsing happens client-side anyway. */
function deterministicWire(marketId: string): PredictMarketStateWire {
  return {
    expiryMarketId: marketId,
    expiryMs: Date.now() + 60 * 60_000,
    settlementPriceBaseUnits: null,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: { marketId: string } },
) {
  const marketId = params.marketId;
  if (!marketId || !/^0x[0-9a-fA-F]+$/.test(marketId)) {
    return Response.json({ error: 'Invalid market id.' }, { status: 400 });
  }

  if (isDeterministicE2E()) {
    return Response.json(deterministicWire(marketId));
  }

  try {
    const state = await fetchPredictMarketStateServer(marketId);
    return Response.json(toPredictMarketStateWire(state), {
      headers: { 'cache-control': 's-maxage=2, stale-while-revalidate=10' },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Predict market state fetch failed.' },
      { status: 502 },
    );
  }
}
