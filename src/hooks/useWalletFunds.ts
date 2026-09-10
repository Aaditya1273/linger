'use client';

import { useCurrentAccount, useCurrentClient } from '@mysten/dapp-kit-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { selectUnallocatedPredictManager } from '../application/subscribeDualInvestment';
import { DEEPBOOK_PREDICT } from '../config/deepbook';
import { useAccountWrapperBalance } from './useAccountWrapper';
import { useAnkerPortfolio } from './useAnkerPortfolio';
import { usePredictManagers } from './usePredictManagers';

export interface WalletFunds {
  /**
   * Available (可用): wallet coins plus idle wrapper balance, as one display
   * number — the same figure everywhere in the app. Null until the wallet
   * connects and the wallet balance loads.
   */
  available: number | null;
  /** In Position (持仓中): principal locked in open Positions until settlement. */
  inPosition: number;
  /**
   * Total Assets (总资产) = Available + In Position principal. The one headline
   * number every wallet surface (account panel, Portfolio) must agree on.
   * Expected rewards are never counted in. Null until Available loads.
   */
  totalAssets: number | null;
  /** dUSDC held as wallet coin objects, in base units. */
  walletBaseUnits: bigint;
  /** The unallocated wrapper Send may sweep from; null when none exists. */
  wrapper: { wrapperId: string; balanceBaseUnits: bigint } | null;
  /** Re-reads both balance sources after a Send/Receive/Claim. */
  refresh: () => Promise<void>;
}

/**
 * The Available (可用) breakdown behind the wallet surfaces (account panel,
 * Portfolio, Send). Send spends wallet coins first and sweeps the difference
 * out of the wrapper, so callers need both parts — not just the sum.
 */
export function useWalletFunds(): WalletFunds {
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const queryClient = useQueryClient();
  const managersQuery = usePredictManagers();
  const portfolioQuery = useAnkerPortfolio();
  const manager = selectUnallocatedPredictManager(managersQuery.data, portfolioQuery.data, account?.address);
  const wrapperBalanceQuery = useAccountWrapperBalance(manager?.managerId);
  const walletBalanceQuery = useQuery({
    queryKey: ['wallet-dusdc-balance', account?.address, DEEPBOOK_PREDICT.quoteAssetType],
    enabled: Boolean(account?.address),
    queryFn: async () => {
      const { balance } = await client.core.getBalance({
        owner: account!.address,
        coinType: DEEPBOOK_PREDICT.quoteAssetType,
      });
      return String(balance.balance);
    },
  });

  const walletBaseUnits = walletBalanceQuery.data !== undefined ? BigInt(walletBalanceQuery.data) : 0n;
  const wrapper =
    manager && wrapperBalanceQuery.data
      ? { wrapperId: manager.managerId, balanceBaseUnits: wrapperBalanceQuery.data.dusdcBalanceBaseUnits }
      : null;

  const divisor = 10 ** DEEPBOOK_PREDICT.quoteAssetDecimals;
  const available =
    !account || walletBalanceQuery.data === undefined
      ? null
      : Number(walletBaseUnits + (wrapper?.balanceBaseUnits ?? 0n)) / divisor;
  const inPosition = (portfolioQuery.data ?? [])
    .filter((note) => note.status === 'open')
    .reduce((sum, note) => sum + note.principal, 0);
  const totalAssets = available === null ? null : available + inPosition;

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['wallet-dusdc-balance'] }),
      queryClient.invalidateQueries({ queryKey: ['account-wrapper-balance'] }),
      queryClient.invalidateQueries({ queryKey: ['anker-portfolio'] }),
    ]);
  }

  return { available, inPosition, totalAssets, walletBaseUnits, wrapper, refresh };
}
