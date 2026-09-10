import { registerEnokiWallets } from '@mysten/enoki';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import { SUI_NETWORK } from '../config/deepbook';

const ENOKI_PUBLIC_API_KEY = process.env.NEXT_PUBLIC_ENOKI_API_KEY;
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

/**
 * Registers Enoki zkLogin wallets (Google sign-in) on the wallet-standard
 * registry so dApp Kit discovers them alongside extension wallets.
 *
 * Enoki wallets implement `sui:signTransaction` v2, so they flow through
 * `signAndExecuteWithWallet` (ADR-0008) unchanged: the wallet signs, the app
 * executes via its own gRPC client and keeps the digest.
 *
 * No-op during SSR (the Enoki wallet touches `window` at construction) and
 * when the Enoki env vars are unset, e.g. CI builds without keys.
 */
export function registerEnokiWalletsIfConfigured(client: ClientWithCoreApi): void {
  if (typeof window === 'undefined') return;
  if (!ENOKI_PUBLIC_API_KEY || !GOOGLE_CLIENT_ID) return;

  registerEnokiWallets({
    apiKey: ENOKI_PUBLIC_API_KEY,
    clients: [client],
    getCurrentNetwork: () => SUI_NETWORK,
    providers: {
      google: {
        clientId: GOOGLE_CLIENT_ID,
        // Default is the current page URL, which varies per route and can
        // never all be whitelisted in GCP. Pin the OAuth redirect to the
        // origin root; it must be listed verbatim in the OAuth client's
        // "Authorized redirect URIs".
        redirectUrl: window.location.origin,
        // The account panel shows which Google account is signed in; the
        // email claim only lands in the session JWT when this scope was
        // requested at sign-in, so sessions created before it stay email-less
        // until the next login.
        extraParams: { scope: 'email' },
      },
    },
  });
}
