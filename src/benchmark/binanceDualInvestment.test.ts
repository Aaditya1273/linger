import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildBinanceDualInvestmentUrl,
  fetchBinanceDualInvestmentProducts,
  findBinanceDualInvestmentMatch,
  type BinanceDualInvestmentProduct,
} from './binanceDualInvestment';

const baseProduct: BinanceDualInvestmentProduct = {
  id: 'binance-1',
  investmentAsset: 'USDC',
  targetAsset: 'BTC',
  strikePrice: 71_000,
  settleTimeMs: Date.UTC(2026, 5, 12, 8),
  apr: 0.42,
  durationDays: 10,
  canPurchase: true,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('findBinanceDualInvestmentMatch', () => {
  const HOUR_MS = 3_600_000;
  const DAY_MS = 86_400_000;

  it('matches the same strike and exact settlement time', () => {
    const match = findBinanceDualInvestmentMatch({
      products: [
        { ...baseProduct, id: 'wrong-strike', strikePrice: 70_500, apr: 0.8 },
        baseProduct,
        { ...baseProduct, id: 'wrong-settlement', settleTimeMs: Date.UTC(2026, 5, 13, 8), apr: 0.9 },
      ],
      targetPrice: 71_000,
      settlementTimeMs: Date.UTC(2026, 5, 12, 8),
      nowMs: Date.UTC(2026, 5, 2, 8),
    });

    expect(match).toMatchObject({
      kind: 'matched',
      product: { id: 'binance-1' },
      settlementOffsetMs: 0,
    });
  });

  it('picks the nearest settlement at the same strike even when it falls on a different UTC date', () => {
    // Live-style regression: 9.4d Anker tenor whose nearest listed Binance settle is +32h (next calendar day).
    const ankerSettleMs = Date.UTC(2026, 5, 12, 0);
    const nowMs = ankerSettleMs - 9.4 * DAY_MS;
    const nearestSettleMs = ankerSettleMs + 32 * HOUR_MS;
    const match = findBinanceDualInvestmentMatch({
      products: [
        { ...baseProduct, id: 'farther-plus-56h', settleTimeMs: ankerSettleMs + 56 * HOUR_MS, apr: 0.5 },
        { ...baseProduct, id: 'nearest-plus-32h', settleTimeMs: nearestSettleMs, apr: 0.4 },
      ],
      targetPrice: 71_000,
      settlementTimeMs: ankerSettleMs,
      nowMs,
    });

    expect(match).toMatchObject({
      kind: 'matched',
      product: { id: 'nearest-plus-32h' },
      settlementOffsetMs: 32 * HOUR_MS,
    });
  });

  it('matches long tenors whose nearest Binance settle is days away on another calendar date', () => {
    // 22.4d → nearest +56h; 52.4d → nearest −6.7d (both rejected by same-calendar-date matching).
    const cases = [
      { tenorDays: 22.4, offsetHours: 56, id: 'plus-56h' },
      { tenorDays: 52.4, offsetHours: -6.7 * 24, id: 'minus-6.7d' },
    ] as const;

    for (const { tenorDays, offsetHours, id } of cases) {
      const ankerSettleMs = Date.UTC(2026, 5, 20, 0);
      const nowMs = ankerSettleMs - tenorDays * DAY_MS;
      const nearestSettleMs = ankerSettleMs + offsetHours * HOUR_MS;
      const match = findBinanceDualInvestmentMatch({
        products: [
          {
            ...baseProduct,
            id,
            settleTimeMs: nearestSettleMs,
            durationDays: 7,
          },
          {
            ...baseProduct,
            id: 'farther',
            settleTimeMs: ankerSettleMs + (Math.abs(offsetHours) + 48) * HOUR_MS * Math.sign(offsetHours || 1),
          },
        ],
        targetPrice: 71_000,
        settlementTimeMs: ankerSettleMs,
        nowMs,
      });

      expect(match).toMatchObject({
        kind: 'matched',
        product: { id },
        settlementOffsetMs: nearestSettleMs - ankerSettleMs,
      });
    }
  });

  it('returns no_comparable_product when the nearest settle offset exceeds 50% of the Anker tenor', () => {
    const ankerSettleMs = Date.UTC(2026, 5, 12, 0);
    const nowMs = ankerSettleMs - 2 * DAY_MS; // 2d tenor → 50% bound = 1d
    const match = findBinanceDualInvestmentMatch({
      products: [
        {
          ...baseProduct,
          id: 'too-far',
          settleTimeMs: ankerSettleMs + 1.1 * DAY_MS,
        },
      ],
      targetPrice: 71_000,
      settlementTimeMs: ankerSettleMs,
      nowMs,
    });

    expect(match).toEqual({ kind: 'no_comparable_product' });
  });

  it('rejects any nonzero offset when Anker tenor has already elapsed', () => {
    const ankerSettleMs = Date.UTC(2026, 5, 12, 0);
    const match = findBinanceDualInvestmentMatch({
      products: [{ ...baseProduct, settleTimeMs: ankerSettleMs + HOUR_MS }],
      targetPrice: 71_000,
      settlementTimeMs: ankerSettleMs,
      nowMs: ankerSettleMs,
    });

    expect(match).toEqual({ kind: 'no_comparable_product' });
  });

  it('returns no_product when no Binance row shares the target price', () => {
    const match = findBinanceDualInvestmentMatch({
      products: [{ ...baseProduct, strikePrice: 70_000 }],
      targetPrice: 71_000,
      settlementTimeMs: Date.UTC(2026, 5, 12, 0),
      nowMs: Date.UTC(2026, 5, 2, 0),
    });

    expect(match).toEqual({ kind: 'no_product' });
  });

  it('skips a halted product at the nearest settle and falls through to the next-nearest purchasable one', () => {
    const ankerSettleMs = Date.UTC(2026, 5, 12, 8);
    const match = findBinanceDualInvestmentMatch({
      products: [
        { ...baseProduct, id: 'nearest-but-halted', apr: 0.6, canPurchase: false },
        {
          ...baseProduct,
          id: 'farther-open',
          settleTimeMs: ankerSettleMs + 32 * HOUR_MS,
          apr: 0.4,
          canPurchase: true,
        },
      ],
      targetPrice: 71_000,
      settlementTimeMs: ankerSettleMs,
      nowMs: ankerSettleMs - 10 * DAY_MS,
    });

    expect(match).toMatchObject({
      kind: 'matched',
      product: { id: 'farther-open' },
      settlementOffsetMs: 32 * HOUR_MS,
    });
  });

  it('returns no_product when every row at the target price is halted', () => {
    const match = findBinanceDualInvestmentMatch({
      products: [{ ...baseProduct, id: 'halted-only', canPurchase: false }],
      targetPrice: 71_000,
      settlementTimeMs: Date.UTC(2026, 5, 12, 8),
      nowMs: Date.UTC(2026, 5, 2, 8),
    });

    expect(match).toEqual({ kind: 'no_product' });
  });

  it('keeps a matching product even when Binance does not expose APR', () => {
    const match = findBinanceDualInvestmentMatch({
      products: [{ ...baseProduct, id: 'missing-apr', apr: null }],
      targetPrice: 71_000,
      settlementTimeMs: Date.UTC(2026, 5, 12, 8),
      nowMs: Date.UTC(2026, 5, 2, 8),
    });

    expect(match).toMatchObject({ kind: 'matched', product: { id: 'missing-apr', apr: null } });
  });

  it('prefers a matching row with APR over one with missing APR at the same settle', () => {
    const match = findBinanceDualInvestmentMatch({
      products: [
        { ...baseProduct, id: 'missing-apr', apr: null },
        { ...baseProduct, id: 'with-apr', apr: 0.4 },
      ],
      targetPrice: 71_000,
      settlementTimeMs: Date.UTC(2026, 5, 12, 8),
      nowMs: Date.UTC(2026, 5, 2, 8),
    });

    expect(match).toMatchObject({ kind: 'matched', product: { id: 'with-apr' } });
  });
});

describe('buildBinanceDualInvestmentUrl', () => {
  it('uses USDC collateral and DOWN projects for target buy comparison', () => {
    const url = buildBinanceDualInvestmentUrl({
      pageIndex: 1,
      pageSize: 100,
    });

    expect(url.searchParams.get('investmentAsset')).toBe('USDC');
    expect(url.searchParams.get('targetAsset')).toBe('BTC');
    expect(url.searchParams.get('projectType')).toBe('DOWN');
  });
});

describe('fetchBinanceDualInvestmentProducts', () => {
  it('accepts the live Binance BAPI success code format', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: '000000',
        message: null,
        data: {
          total: '1',
          list: [
            {
              id: 'binance-live-format',
              investmentAsset: 'USDC',
              targetAsset: 'BTC',
              strikePrice: '64000.00000000',
              settleTime: '1782115200000',
              apr: '1.45480000',
              duration: '1',
              canPurchase: true,
            },
          ],
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchBinanceDualInvestmentProducts({ pageSize: 1, maxPageCount: 1 })).resolves.toMatchObject([
      {
        id: 'binance-live-format',
        strikePrice: 64_000,
        apr: 1.4548,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/bapi/earn/v5/friendly/pos/dc/project/list'),
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'omit',
        headers: expect.objectContaining({
          accept: 'application/json, text/plain, */*',
        }),
      }),
    );
  });

  it('keeps products that match strike and settlement even when APR is missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: '000000',
        message: null,
        data: {
          total: '1',
          list: [
            {
              id: 'binance-missing-apr',
              investmentAsset: 'USDC',
              targetAsset: 'BTC',
              strikePrice: '64000.00000000',
              settleTime: '1782115200000',
              duration: '1',
              canPurchase: true,
            },
          ],
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchBinanceDualInvestmentProducts({ pageSize: 1, maxPageCount: 1 })).resolves.toMatchObject([
      {
        id: 'binance-missing-apr',
        strikePrice: 64_000,
        apr: null,
      },
    ]);
  });
});
