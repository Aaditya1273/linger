'use client';

import { useCurrentAccount, useDAppKit, useWallets } from '@mysten/dapp-kit-react';
import { isEnokiWallet } from '@mysten/enoki';
import { useEffect, useState } from 'react';
import { copyForLocale, DEFAULT_LOCALE, type Locale } from '../i18n';
import { Button, Dialog } from '../ui';
import { EnokiMark, GoogleMark } from './brandMarks';

type UiWallet = ReturnType<typeof useWallets>[number];

type ConnectView =
  | { view: 'list' }
  | { view: 'connecting'; wallet: UiWallet }
  | { view: 'error'; wallet: UiWallet };

/** Closing the OAuth popup / rejecting the wallet prompt is a normal way back to the list, not a failure. */
function isUserRejection(error: unknown): boolean {
  return error instanceof Error && /reject|cancel|denied|dismiss|closed/i.test(error.message);
}

/** In-flow labels say "Google", not the wallet-standard entry name ("Sign in with Google"). */
function walletLabel(wallet: UiWallet): string {
  return isEnokiWallet(wallet) ? 'Google' : wallet.name;
}

/**
 * The sign-in dialog, replacing dapp-kit's stock connect modal (which is a
 * closed shadow-DOM web component: English-only, unbrandable beyond theme
 * tokens, and wallet-list-first). Google zkLogin is the hero path — one CTA,
 * no wallet vocabulary — with extension wallets demoted below a divider and
 * an Enoki trust line at the foot.
 */
export function ConnectWalletDialog({
  open,
  locale = DEFAULT_LOCALE,
  onClose,
}: {
  open: boolean;
  locale?: Locale;
  onClose: () => void;
}) {
  const copy = copyForLocale(locale);
  const dialogCopy = copy.wallet.connectDialog;
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const wallets = useWallets();
  const [state, setState] = useState<ConnectView>({ view: 'list' });

  const googleWallet = wallets.find((wallet) => isEnokiWallet(wallet)) ?? null;
  const extensionWallets = wallets.filter((wallet) => !isEnokiWallet(wallet));

  // The zkLogin popup can land the connection after the user has navigated
  // away from the pending view (or cancelled it) — any live connection while
  // the dialog is open means we are done.
  useEffect(() => {
    if (open && account) onClose();
  }, [open, account, onClose]);

  // Reopening always starts on the wallet list, never a stale error.
  useEffect(() => {
    if (!open) setState({ view: 'list' });
  }, [open]);

  if (!open) return null;

  async function connect(wallet: UiWallet) {
    setState({ view: 'connecting', wallet });
    try {
      await dAppKit.connectWallet({ wallet });
      onClose();
    } catch (error) {
      setState(isUserRejection(error) ? { view: 'list' } : { view: 'error', wallet });
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      ariaLabel={dialogCopy.title}
      closeLabel={copy.common.close}
      className="connect-dialog-shell"
    >
      {state.view === 'list' ? (
        <div className="connect-dialog">
          <h3 className="wallet-dialog-title">{dialogCopy.title}</h3>
          {googleWallet ? (
            <button type="button" className="connect-google" onClick={() => void connect(googleWallet)}>
              <GoogleMark size={18} />
              <span>{dialogCopy.continueWithGoogle}</span>
            </button>
          ) : null}
          {googleWallet && extensionWallets.length > 0 ? (
            <div className="connect-divider">{dialogCopy.orDivider}</div>
          ) : null}
          {extensionWallets.length > 0 ? (
            <ul className="connect-wallet-list">
              {extensionWallets.map((wallet) => (
                <li key={wallet.name}>
                  <button type="button" className="connect-wallet-row" onClick={() => void connect(wallet)}>
                    {wallet.icon ? (
                      // Wallet-standard icons are data: URIs, not remote assets.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={wallet.icon} alt="" width={22} height={22} />
                    ) : null}
                    <span>{wallet.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : !googleWallet ? (
            <p className="connect-empty">
              {dialogCopy.noWallets}{' '}
              <a href="https://sui.io/get-started" target="_blank" rel="noreferrer">
                {dialogCopy.getWallet}
              </a>
            </p>
          ) : null}
          <p className="connect-footer">
            <span>{dialogCopy.securedByPrefix}</span>
            <EnokiMark />
            <span>{dialogCopy.securedBySuffix}</span>
          </p>
        </div>
      ) : state.view === 'connecting' ? (
        <div className="connect-status" aria-busy="true">
          <span className="connect-status-spinner" aria-hidden="true" />
          <p>{dialogCopy.continueIn(walletLabel(state.wallet))}</p>
          <Button variant="secondary" size="sm" onClick={() => setState({ view: 'list' })}>
            {dialogCopy.cancel}
          </Button>
        </div>
      ) : (
        <div className="connect-status">
          <div className="wallet-error" role="alert">
            <p>{dialogCopy.failed}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const { wallet } = state;
              void connect(wallet);
            }}
          >
            {dialogCopy.retry}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
