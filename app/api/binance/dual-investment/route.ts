import {
  fetchBinanceDualInvestmentProducts,
  type BinanceDualInvestmentProduct,
} from '../../../../src/deepbook/binanceDualInvestment';
import { isDeterministicE2E } from '../../../../src/config/runtimeModes';
import { deterministicBinanceDualInvestmentProducts } from '../../../../src/server/deterministicPredictFixtures';

export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 15_000;
const CACHE_CONTROL = 's-maxage=15, stale-while-revalidate=30';

let cachedResponse: {
  expiresAt: number;
  products: BinanceDualInvestmentProduct[];
} | null = null;

async function getCachedProducts() {
  const now = Date.now();
  if (cachedResponse && cachedResponse.expiresAt > now) {
    return cachedResponse.products;
  }

  const products = await fetchBinanceDualInvestmentProducts();
  cachedResponse = {
    expiresAt: now + CACHE_TTL_MS,
    products,
  };
  return products;
}

export async function GET() {
  if (isDeterministicE2E()) {
    return Response.json(deterministicBinanceDualInvestmentProducts(), {
      headers: {
        'cache-control': CACHE_CONTROL,
      },
    });
  }

  try {
    return Response.json(await getCachedProducts(), {
      headers: {
        'cache-control': CACHE_CONTROL,
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Binance Dual Investment proxy failed.',
      },
      { status: 502 },
    );
  }
}
