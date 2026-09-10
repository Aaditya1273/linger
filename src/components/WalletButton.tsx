'use client';

import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { useState } from 'react';
import { Wallet, AlertTriangle, Droplet } from 'lucide-react';
import { SOMNIA_CHAIN, FAUCET_STT } from '../wallet/config';
import { Button, Dialog } from '../ui';

export const shortAddress = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');

/**
 * Connect / wrong-network / connected, in one control.
 *
 * The wrong-network state is a hard gate rather than a warning: every write in
 * this app targets Shannon, so signing on another chain can only produce a
 * confusing revert. `switchChain` asks the wallet to switch and falls back to
 * wallet_addEthereumChain when the chain is unknown to it, which is the normal
 * case for a testnet nobody has added yet.
 */
export function WalletButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const [open, setOpen] = useState(false);

  const wrongNetwork = isConnected && chainId !== SOMNIA_CHAIN.id;
  const { data: stt } = useBalance({ address, query: { enabled: isConnected && !wrongNetwork } });
  const needsGas = stt?.value === 0n;

  if (wrongNetwork) {
    return (
      <Button variant="secondary" onClick={() => switchChain({ chainId: SOMNIA_CHAIN.id })} disabled={switching}>
        <AlertTriangle size={15} />
        {switching ? 'Switching…' : 'Switch to Somnia Shannon'}
      </Button>
    );
  }

  if (isConnected) {
    return (
      <span className="wallet-connected">
        {needsGas && (
          <a className="wallet-faucet" href={FAUCET_STT} target="_blank" rel="noreferrer" title="You need STT for gas">
            <Droplet size={14} /> Get STT
          </a>
        )}
        <Button variant="secondary" onClick={() => disconnect()} title={address}>
          {shortAddress(address)}
        </Button>
      </span>
    );
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={isPending}>
        <Wallet size={15} /> Connect wallet
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} ariaLabel="Connect wallet" closeLabel="Close">
        <p className="dialog-lead">
          Your wallet is your identity on Anker. No account, no password — Anker never holds your funds.
        </p>
        <div className="connector-list">
          {connectors.map((connector) => (
            <Button
              key={connector.uid}
              variant="secondary"
              onClick={() => {
                connect({ connector });
                setOpen(false);
              }}
            >
              {connector.name}
            </Button>
          ))}
        </div>
        <p className="dialog-foot">
          Somnia Shannon testnet · chainId {SOMNIA_CHAIN.id} ·{' '}
          <a href={FAUCET_STT} target="_blank" rel="noreferrer">
            faucet
          </a>
        </p>
      </Dialog>
    </>
  );
}
