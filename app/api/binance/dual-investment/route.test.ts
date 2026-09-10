import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadRoute() {
  vi.resetModules();
  return import('./route');
}

describe('/api/binance/dual-investment', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns Binance Dual Investment products without requiring the experimental product flag', async () => {
    const { GET } = await loadRoute();
    vi.stubEnv('ENABLE_EXPERIMENTAL_PRODUCTS', '');
    vi.stubEnv('NEXT_PUBLIC_ENABLE_EXPERIMENTAL_PRODUCTS', '');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            total: '1',
            list: [
              {
                id: 'binance-1',
                investmentAsset: 'USDC',
                targetAsset: 'BTC',
                strikePrice: '64000',
                settleTime: '1782086400000',
                apr: '1.4502',
                duration: '1',
                canPurchase: true,
              },
            ],
          },
        }),
      }),
    );

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject([
      {
        id: 'binance-1',
        strikePrice: 64_000,
        apr: 1.4502,
      },
    ]);
  });

  it('reuses a short cached Binance response for repeated proxy requests', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-21T00:00:00.000Z'));
    const { GET } = await loadRoute();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          total: '1',
          list: [
            {
              id: 'binance-1',
              investmentAsset: 'USDC',
              targetAsset: 'BTC',
              strikePrice: '64000',
              settleTime: '1782086400000',
              apr: '1.4502',
              duration: '1',
              canPurchase: true,
            },
          ],
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = await GET();
    const second = await GET();

    expect(first.headers.get('cache-control')).toBe('s-maxage=15, stale-while-revalidate=30');
    expect(second.headers.get('cache-control')).toBe('s-maxage=15, stale-while-revalidate=30');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(second.json()).resolves.toMatchObject([{ id: 'binance-1' }]);
  });
});
