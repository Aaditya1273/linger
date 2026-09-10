import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OracleMarket } from '../products/types';
import { useBinanceDualInvestment } from './useBinanceDualInvestment';

const market: OracleMarket = {
  predictId: '0x1',
  oracleId: '0x2',
  underlyingAsset: 'BTC',
  expiryMs: 1_782_115_200_000,
  minStrike: 50_000,
  tickSize: 500,
  status: 'active',
  spot: 64_170,
  forward: 64_200,
  spotTimestampMs: 1,
  sviTimestampMs: 1,
  serverLagSeconds: 1,
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useBinanceDualInvestment', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches Binance benchmark rows through the same-origin API proxy', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'binance-64000',
          investmentAsset: 'USDC',
          targetAsset: 'BTC',
          strikePrice: 64_000,
          settleTimeMs: 1_782_115_200_000,
          apr: 1.4548,
          durationDays: 1,
          canPurchase: true,
        },
      ],
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBinanceDualInvestment({ market }), { wrapper });

    await waitFor(() => expect(result.current.data?.[0]?.id).toBe('binance-64000'));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/binance/dual-investment',
      expect.any(Object),
    );
  });
});
