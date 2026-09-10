'use client';

import { useState, type ReactNode } from 'react';
import { copyForLocale, DEFAULT_LOCALE, type Locale } from '../i18n';
import { Button, type ButtonVariant } from '../ui';
import { ConnectWalletDialog } from './ConnectWalletDialog';

/**
 * Connect CTA for the disconnected state — a regular sticker Button that
 * opens the app-owned sign-in dialog (ConnectWalletDialog) instead of
 * dapp-kit's web-component modal.
 */
export function WalletConnectButton({
  children,
  locale = DEFAULT_LOCALE,
  variant = 'secondary',
}: {
  children?: ReactNode;
  locale?: Locale;
  variant?: ButtonVariant;
}) {
  const [open, setOpen] = useState(false);
  const copy = copyForLocale(locale);
  return (
    <>
      <Button aria-label={copy.common.connect} variant={variant} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <ConnectWalletDialog open={open} locale={locale} onClose={() => setOpen(false)} />
    </>
  );
}
