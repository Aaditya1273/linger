'use client';

import { useCurrentWallet } from '@mysten/dapp-kit-react';
import { getSession, getWalletMetadata, isEnokiWallet } from '@mysten/enoki';
import { decodeJwt } from '@mysten/sui/zklogin';
import { useQuery } from '@tanstack/react-query';

export type WalletIdentity =
  | {
      /** Signed in through Enoki zkLogin (Google) — the email is the identity the user recognizes. */
      kind: 'social';
      provider: string;
      /** Null while the session loads, and for sessions created before the email scope was requested. */
      email: string | null;
    }
  | {
      /** A wallet-standard extension wallet — its own name and icon are the identity. */
      kind: 'extension';
      name: string;
      icon: string | null;
    };

/**
 * Who the connected wallet belongs to, in terms the user recognizes: the
 * Google email for zkLogin sessions, the wallet name/icon for extensions.
 * The Sui address stays the canonical account identifier — this is only the
 * human-facing label next to it.
 */
export function useWalletIdentity(): WalletIdentity | null {
  const wallet = useCurrentWallet();
  const isSocial = Boolean(wallet && isEnokiWallet(wallet));

  const emailQuery = useQuery({
    queryKey: ['wallet-identity-email', wallet?.name],
    enabled: isSocial,
    staleTime: Infinity,
    queryFn: async () => {
      const session = await getSession(wallet!);
      if (!session?.jwt) return null;
      try {
        const claims = decodeJwt(session.jwt) as { email?: string };
        return claims.email ?? null;
      } catch {
        // A malformed or pre-email-scope JWT never blocks the panel — the
        // identity row just falls back to the provider label.
        return null;
      }
    },
  });

  if (!wallet) return null;
  if (isSocial) {
    return {
      kind: 'social',
      provider: getWalletMetadata(wallet)?.provider ?? 'google',
      email: emailQuery.data ?? null,
    };
  }
  return { kind: 'extension', name: wallet.name, icon: wallet.icon ?? null };
}
