import type { ClientWithCoreApi } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
import type { WalletTransactionSigner } from './walletExecution';

let sponsorshipProbe: Promise<boolean> | null = null;

/**
 * True when the deployment has an Enoki private key and can sponsor gas.
 * Probed once per page load; a failed probe reads as disabled.
 */
export function isSponsorshipEnabled(): Promise<boolean> {
  sponsorshipProbe ??= fetch('/api/enoki/sponsor')
    .then(async (response) => (response.ok ? Boolean(((await response.json()) as { enabled?: boolean }).enabled) : false))
    .catch(() => false);
  return sponsorshipProbe;
}

async function postSponsorApi<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (payload as { error?: unknown } | null)?.error;
    throw new Error(typeof message === 'string' ? message : `Sponsorship request failed (${response.status}).`);
  }
  return payload as T;
}

/**
 * Sponsored sibling of signAndExecuteWithWallet (ADR-0008): Enoki wraps the
 * gasless transaction kind with its own gas, the wallet signs those exact
 * bytes, and Enoki co-signs and submits. The digest is returned by the create
 * step — before execution — so callers keep confirming through the app's own
 * client, exactly like the direct path.
 */
export async function signAndExecuteSponsored({
  wallet,
  client,
  transaction,
  sender,
  recipient,
}: {
  wallet: WalletTransactionSigner;
  client: ClientWithCoreApi;
  transaction: Transaction;
  sender: string;
  /** Send flow only: the transfer recipient the sponsor must additionally allow (ADR-0010). */
  recipient?: string;
}): Promise<{ digest: string }> {
  transaction.setSenderIfNotSet(sender);
  const transactionKindBytes = toBase64(await transaction.build({ client, onlyTransactionKind: true }));

  const sponsored = await postSponsorApi<{ bytes: string; digest: string }>('/api/enoki/sponsor', {
    transactionKindBytes,
    sender,
    ...(recipient ? { recipient } : {}),
  });

  const signed = await wallet.signTransaction({ transaction: Transaction.from(sponsored.bytes) });
  if (signed.bytes !== sponsored.bytes) {
    // The wallet re-built different bytes than Enoki sponsored; its signature
    // would not match the sponsored digest, so fail before submitting.
    throw new Error('Wallet signed different bytes than the sponsored transaction; aborting execution.');
  }

  await postSponsorApi<{ digest: string }>('/api/enoki/sponsor/execute', {
    digest: sponsored.digest,
    signature: signed.signature,
  });
  return { digest: sponsored.digest };
}
