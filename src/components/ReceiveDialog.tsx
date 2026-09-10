'use client';

import { Check, Copy, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { renderSVG } from 'uqr';
import { copyForLocale, DEFAULT_LOCALE, type Locale } from '../i18n';
import { Dialog } from '../ui';

/**
 * Receive (收款): the connected wallet's own address as text + QR, with the
 * Sui-network-only warning. A CEX withdrawal to this address is how funds
 * arrive — there is no app-side account.
 */
export function ReceiveDialog({
  open,
  address,
  locale = DEFAULT_LOCALE,
  onClose,
}: {
  open: boolean;
  address: string;
  locale?: Locale;
  onClose: () => void;
}) {
  const copy = copyForLocale(locale);
  const dialogCopy = copy.wallet.receiveDialog;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!open) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      ariaLabel={dialogCopy.title}
      closeLabel={copy.common.close}
      className="wallet-dialog-shell"
    >
      <div className="wallet-dialog">
        <h3 className="wallet-dialog-title">{dialogCopy.title}</h3>
        <p className="wallet-dialog-intro">{dialogCopy.intro}</p>
        <div
          className="wallet-receive-qr"
          role="img"
          aria-label={dialogCopy.qrLabel}
          dangerouslySetInnerHTML={{ __html: renderSVG(address, { border: 1 }) }}
        />
        <button
          type="button"
          className="wallet-address-row"
          onClick={() => {
            void navigator.clipboard.writeText(address).then(() => setCopied(true));
          }}
        >
          <code>{address}</code>
          <span className="wallet-copy-hint" aria-live="polite">
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {copied ? copy.wallet.copied : copy.wallet.copyAddress}
          </span>
        </button>
        <p className="wallet-network-warning">
          <TriangleAlert size={14} aria-hidden="true" />
          {dialogCopy.networkWarning}
        </p>
        <p className="wallet-testnet-note">{dialogCopy.testnetNote}</p>
      </div>
    </Dialog>
  );
}
