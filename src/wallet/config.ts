'use client';

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http } from 'wagmi';
import { somniaShannon } from '@somnia-chain/markets-sdk/chains';

/**
 * Wallet IS identity. No password, no app-side account — the connected address
 * is the whole session, and disconnecting ends it.
 *
 * `somniaShannon` comes from the SDK rather than a hand-written literal so the
 * chain id (50312), STT, the Shannon explorer and multicall3 stay in sync with
 * whatever the SDK targets. A hand-rolled chain object would drop the explorer
 * and multicall the portfolio needs.
 */
export const SOMNIA_CHAIN = somniaShannon;

export const FAUCET_STT = 'https://testnet.somnia.network';
export const EXPLORER = SOMNIA_CHAIN.blockExplorers.default.url;

export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const explorerAddress = (address: string) => `${EXPLORER}/address/${address}`;

/**
 * WalletConnect project id. RainbowKit requires one; without it `getDefaultConfig`
 * throws at module scope and takes the whole page down, so a placeholder keeps
 * injected wallets (MetaMask, Rabby, Brave…) working even on a clone with no env.
 * Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID to enable mobile/QR connections.
 */
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || 'anker_local_dev';

export const hasWalletConnect = projectId !== 'anker_local_dev';

/**
 * `getDefaultConfig` bundles RainbowKit's full connector set — MetaMask,
 * Rabby, Coinbase, Trust, Ledger, Safe, generic injected, and WalletConnect's
 * QR path for anything mobile — so "any EVM wallet" is literally true rather
 * than a claim.
 */
export const wagmiConfig = getDefaultConfig({
  appName: 'Anker Protocol',
  appDescription: 'Self-custody Dual Investment on Somnia, powered by DreamDEX Event Contracts',
  appUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.ankerprotocol.xyz',
  projectId,
  chains: [SOMNIA_CHAIN],
  transports: {
    [SOMNIA_CHAIN.id]: http(process.env.NEXT_PUBLIC_SOMNIA_RPC ?? 'https://dream-rpc.somnia.network'),
  },
  ssr: true,
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
