'use client';

import { createConfig, http } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { somniaShannon } from '@somnia-chain/markets-sdk/chains';

/**
 * Wallet IS identity. No password, no account object, no app-side custody —
 * the connected address is the whole session, and disconnecting ends it.
 *
 * `somniaShannon` comes from the SDK rather than a hand-written literal so the
 * chain id (50312), STT, the Shannon explorer and multicall3 all stay in sync
 * with whatever the SDK targets.
 */
export const SOMNIA_CHAIN = somniaShannon;

export const FAUCET_STT = 'https://testnet.somnia.network';
export const EXPLORER = SOMNIA_CHAIN.blockExplorers.default.url;

export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const explorerAddress = (address: string) => `${EXPLORER}/address/${address}`;

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

export const wagmiConfig = createConfig({
  chains: [SOMNIA_CHAIN],
  connectors: [
    injected({ shimDisconnect: true }),
    // WalletConnect only when a project id is configured; without one the
    // connector throws at construction and takes the whole page with it.
    ...(projectId
      ? [walletConnect({ projectId, showQrModal: true, metadata: {
          name: 'Anker Protocol',
          description: 'Self-custody Dual Investment on Somnia',
          url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.ankerprotocol.xyz',
          icons: [],
        } })]
      : []),
  ],
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
