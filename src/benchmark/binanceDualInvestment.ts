const BINANCE_DUAL_PROJECT_LIST_URL = 'https://www.binance.com/bapi/earn/v5/friendly/pos/dc/project/list';
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_COUNT = 5;

interface BinanceDualInvestmentApiRow {
  id?: string;
  investmentAsset?: string;
  targetAsset?: string;
  strikePrice?: string;
  settleTime?: string;
  apr?: string;
  duration?: string;
  canPurchase?: boolean;
  type?: string;
}

interface BinanceDualInvestmentApiResponse {
  success?: boolean;
  code?: string;
  message?: string | null;
  data?: {
    total?: string;
    list?: BinanceDualInvestmentApiRow[];
  };
}

export interface BinanceDualInvestmentProduct {
  id: string;
  investmentAsset: 'USDC' | 'USDT' | string;
  targetAsset: 'BTC' | string;
  strikePrice: number;
  settleTimeMs: number;
  apr: number | null;
  durationDays: number;
  canPurchase: boolean;
}

function toNumber(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toPositiveNumberOrNull(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Parse raw Binance project-list rows. */
export function parseBinanceDualInvestmentRows(rows: unknown[]): BinanceDualInvestmentProduct[] {
  return parseProducts(rows.filter((row): row is BinanceDualInvestmentApiRow => typeof row === 'object' && row !== null));
}

function parseProducts(rows: BinanceDualInvestmentApiRow[]) {
  return rows
    .map((row): BinanceDualInvestmentProduct | null => {
      const strikePrice = toNumber(row.strikePrice);
      const settleTimeMs = toNumber(row.settleTime);
      const apr = toPositiveNumberOrNull(row.apr);
      const durationDays = toNumber(row.duration);

      if (!row.id || strikePrice <= 0 || settleTimeMs <= 0) {
        return null;
      }

      return {
        id: row.id,
        investmentAsset: row.investmentAsset ?? 'USDC',
        targetAsset: row.targetAsset ?? 'BTC',
        strikePrice,
        settleTimeMs,
        apr,
        durationDays,
        canPurchase: Boolean(row.canPurchase),
      };
    })
    .filter((row): row is BinanceDualInvestmentProduct => Boolean(row));
}

export function buildBinanceDualInvestmentUrl(input: {
  pageIndex: number;
  pageSize: number;
}) {
  const url = new URL(BINANCE_DUAL_PROJECT_LIST_URL);
  url.searchParams.set('investmentAsset', 'USDC');
  url.searchParams.set('targetAsset', 'BTC');
  url.searchParams.set('projectType', 'DOWN');
  url.searchParams.set('sortType', 'APY_DESC');
  url.searchParams.set('pageIndex', String(input.pageIndex));
  url.searchParams.set('pageSize', String(input.pageSize));
  return url;
}

async function fetchProductPage(input: {
  pageIndex: number;
  pageSize: number;
}): Promise<{ total: number; products: BinanceDualInvestmentProduct[] }> {
  const url = buildBinanceDualInvestmentUrl(input);

  const response = await fetch(url.toString(), {
    cache: 'no-store',
    credentials: 'omit',
    headers: {
      accept: 'application/json, text/plain, */*',
    },
  });
  if (!response.ok) {
    throw new Error(`Binance Dual Investment fetch failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as BinanceDualInvestmentApiResponse;
  const isSuccessfulPayload = payload.success === true || payload.code === '000000';
  if (!isSuccessfulPayload || !payload.data?.list) {
    throw new Error(payload.message ?? payload.code ?? 'Binance Dual Investment response was not successful.');
  }

  return {
    total: toNumber(payload.data.total),
    products: parseProducts(payload.data.list),
  };
}

export async function fetchBinanceDualInvestmentProducts(input: {
  pageSize?: number;
  maxPageCount?: number;
} = {}) {
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
  const firstPage = await fetchProductPage({ pageIndex: 1, pageSize });
  const pageCount = Math.min(
    input.maxPageCount ?? MAX_PAGE_COUNT,
    Math.max(1, Math.ceil(firstPage.total / pageSize)),
  );

  if (pageCount === 1) {
    return firstPage.products;
  }

  const restPages = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) =>
      fetchProductPage({
        pageIndex: index + 2,
        pageSize,
      }),
    ),
  );

  return [...firstPage.products, ...restPages.flatMap((page) => page.products)];
}

export const MAX_SETTLEMENT_OFFSET_RATIO = 0.5;

export type BinanceDualInvestmentMatchResult =
  | {
      kind: 'matched';
      product: BinanceDualInvestmentProduct;
      /** Signed offset: Binance settle − Anker settle. */
      settlementOffsetMs: number;
    }
  | { kind: 'no_comparable_product' }
  | { kind: 'no_product' };

export function findBinanceDualInvestmentMatch(input: {
  products: readonly BinanceDualInvestmentProduct[];
  targetPrice: number;
  settlementTimeMs: number;
  /** Clock used to measure Anker tenor for the 50% offset sanity bound. */
  nowMs?: number;
}): BinanceDualInvestmentMatchResult {
  const targetPrice = Math.round(input.targetPrice);
  const nowMs = input.nowMs ?? Date.now();
  const ankerTenorMs = Math.max(0, input.settlementTimeMs - nowMs);
  // A halted product is no Benchmark (ADR-0006): canPurchase is a hard filter,
  // so a stopped product falls through exactly like a missing one.
  const candidates = input.products.filter(
    (product) => product.canPurchase && Math.round(product.strikePrice) === targetPrice,
  );

  if (candidates.length === 0) {
    return { kind: 'no_product' };
  }

  const nearest = [...candidates].sort((a, b) => {
    const aOffset = Math.abs(a.settleTimeMs - input.settlementTimeMs);
    const bOffset = Math.abs(b.settleTimeMs - input.settlementTimeMs);
    if (aOffset !== bOffset) return aOffset - bOffset;
    const aApr = a.apr ?? -Infinity;
    const bApr = b.apr ?? -Infinity;
    return bApr - aApr;
  })[0]!;

  const settlementOffsetMs = nearest.settleTimeMs - input.settlementTimeMs;
  if (Math.abs(settlementOffsetMs) > MAX_SETTLEMENT_OFFSET_RATIO * ankerTenorMs) {
    return { kind: 'no_comparable_product' };
  }

  return { kind: 'matched', product: nearest, settlementOffsetMs };
}
