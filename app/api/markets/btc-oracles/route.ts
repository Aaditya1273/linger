import { isDeterministicE2E } from '../../../../src/config/runtimeModes';
import { deterministicCuratedBtcOracleResponse } from '../../../../src/server/deterministicPredictFixtures';
import { buildCuratedBtcOracleResponse } from '../../../../src/server/curatedOracles';

export const dynamic = 'force-dynamic';

const BTC_ORACLES_CACHE_CONTROL = 's-maxage=15, stale-while-revalidate=30';

function jsonWithCache(payload: unknown) {
  return Response.json(payload, {
    headers: {
      'cache-control': BTC_ORACLES_CACHE_CONTROL,
    },
  });
}

export async function GET() {
  if (isDeterministicE2E()) {
    return jsonWithCache(deterministicCuratedBtcOracleResponse());
  }

  try {
    return jsonWithCache(await buildCuratedBtcOracleResponse(Date.now()));
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Curated BTC oracle request failed.',
        generatedAt: Date.now(),
        oracles: [],
      },
      { status: 502 },
    );
  }
}
