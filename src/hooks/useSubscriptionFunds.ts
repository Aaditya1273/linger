'use client';

import { useWalletFunds } from './useWalletFunds';

/**
 * dUSDC available to fund a Dual Investment subscription. The subscribe
 * transaction spends the unallocated manager's wrapper balance first and
 * tops up the difference from the wallet's dUSDC coins, so the spendable
 * total is wallet + wrapper — the same Available (可用) number the wallet
 * surfaces show (useWalletFunds). Null until the wallet connects and the
 * wallet balance loads, so views can hide balance-derived controls instead
 * of showing a zero.
 */
export function useSubscriptionFunds(): { balance: number | null } {
  const { available } = useWalletFunds();
  return { balance: available };
}
