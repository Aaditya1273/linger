import { useQuery } from '@tanstack/react-query';
import type { BinanceDualInvestmentProduct } from '../deepbook/binanceDualInvestment';
import type { OracleMarket } from '../products/types';

async function fetchBinanceDualInvestmentProductsFromProxy(): Promise<BinanceDualInvestmentProduct[]> {
  const response = await fetch('/api/binance/dual-investment', {
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      detail = payload.error ?? detail;
    } catch {
      // Preserve the HTTP status when the proxy does not return JSON.
    }
    throw new Error(`Binance Dual Investment proxy failed: ${detail}`);
  }

  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error('Binance Dual Investment proxy returned an invalid payload.');
  }

  return payload as BinanceDualInvestmentProduct[];
}

export function useBinanceDualInvestment(input: {
  market?: OracleMarket;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['binance-dual-investment', 'target-buy', input.market?.expiryMs],
    enabled: Boolean(input.market) && (input.enabled ?? true),
    queryFn: () => fetchBinanceDualInvestmentProductsFromProxy(),
    refetchInterval: 10_000,
    retry: 1,
    placeholderData: (previous) => previous,
  });
}
