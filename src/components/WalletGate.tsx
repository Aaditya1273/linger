'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAccount } from 'wagmi';
import { localizedPath, type Locale } from '../i18n';

/**
 * Routes the user between the landing page and the app based on wallet state.
 *
 * ## Why it waits for a settled status
 *
 * wagmi reports `disconnected` for a beat on every page load while it tries to
 * reconnect an already-authorised wallet. Redirecting on `!isConnected` would
 * therefore bounce a connected user to the landing page on every refresh. The
 * gate only acts on `status === 'disconnected'` (never during `connecting` or
 * `reconnecting`), so a reload holds still.
 *
 * Rendered as a sibling rather than a wrapper so it can never blank the page:
 * on an app route the content stays mounted and visible during the redirect,
 * which reads better than a flash of empty layout.
 */
export function WalletGate({ locale, mode }: { locale: Locale; mode: 'landing' | 'app' }) {
  const { status } = useAccount();
  const router = useRouter();

  useEffect(() => {
    if (status === 'connecting' || status === 'reconnecting') return;

    if (mode === 'landing' && status === 'connected') {
      router.replace(localizedPath(locale, '/app/dual-investment'));
      return;
    }
    if (mode === 'app' && status === 'disconnected') {
      router.replace(localizedPath(locale, '/'));
    }
  }, [status, mode, locale, router]);

  return null;
}

/**
 * Is the app allowed to render its wallet-dependent content yet?
 *
 * Kept separate from the redirect so a page can show its read-only chrome while
 * the wallet is still reconnecting, instead of flashing a "connect" state at a
 * user who is already connected.
 */
export function useWalletReady(): { ready: boolean; settled: boolean } {
  const { status } = useAccount();
  return {
    ready: status === 'connected',
    settled: status === 'connected' || status === 'disconnected',
  };
}
