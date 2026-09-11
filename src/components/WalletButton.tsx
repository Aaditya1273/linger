'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useBalance } from 'wagmi';
import { Droplet } from 'lucide-react';
import { FAUCET_STT, SOMNIA_CHAIN } from '../wallet/config';

export const shortAddress = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');

/**
 * Wallet control: RainbowKit's ConnectButton plus the one thing it cannot know.
 *
 * RainbowKit already handles connect, the wallet list (MetaMask, Rabby,
 * Coinbase, Trust, Ledger, Safe, WalletConnect QR), the account modal, and the
 * wrong-network state — it renders its own "Wrong network" button that opens a
 * chain switcher, which is why there is no hand-rolled switch logic here any
 * more.
 *
 * What it cannot know is that a *funded-looking* account with 0 STT can connect
 * fine and then fail every write. That is a distinct, separately-actionable
 * error from "wrong network", so the faucet prompt stays as its own affordance
 * rather than being folded into a generic failure later.
 */
export function WalletButton() {
  const { address, isConnected, chainId } = useAccount();
  const onSomnia = isConnected && chainId === SOMNIA_CHAIN.id;

  const { data: stt } = useBalance({ address, query: { enabled: onSomnia } });
  const needsGas = onSomnia && stt?.value === 0n;

  return (
    <span className="wallet-connected">
      {needsGas && (
        <a className="wallet-faucet" href={FAUCET_STT} target="_blank" rel="noreferrer" title="You need STT for gas">
          <Droplet size={14} /> Get STT
        </a>
      )}
      <ConnectButton
        showBalance={{ smallScreen: false, largeScreen: true }}
        accountStatus={{ smallScreen: 'avatar', largeScreen: 'full' }}
        chainStatus={{ smallScreen: 'icon', largeScreen: 'full' }}
      />
    </span>
  );
}
