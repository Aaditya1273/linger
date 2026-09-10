import type { ClientWithCoreApi, SuiClientTypes } from '@mysten/sui/client';
import type { Transaction } from '@mysten/sui/transactions';
import { signAndExecuteSponsored } from './sponsoredExecution';
import {
  signAndExecuteWithWallet,
  type SignedTransactionExecutor,
  type WalletTransactionSigner,
} from './walletExecution';

/** Digest of a successful execution; throws the on-chain error for failed ones. */
export function transactionDigest(result: SuiClientTypes.TransactionResult): string {
  if (result.FailedTransaction) {
    throw new Error(result.FailedTransaction.status.error?.message ?? 'Transaction failed.');
  }
  return result.Transaction.digest;
}

/**
 * Single execution seam for the wallet flows: sponsored (Enoki pays gas,
 * required for zkLogin accounts that own no SUI) or direct (ADR-0008
 * wallet-signs-app-executes). Both paths resolve to the digest before the
 * caller waits for confirmation on the app's own client.
 */
export async function executeWalletTransaction({
  wallet,
  client,
  transaction,
  sender,
  sponsored,
  sponsoredRecipient,
}: {
  wallet: WalletTransactionSigner;
  client: SignedTransactionExecutor & ClientWithCoreApi;
  transaction: Transaction;
  sender: string;
  sponsored: boolean;
  /** Send flow only: recipient the sponsor must additionally allow (ADR-0010). */
  sponsoredRecipient?: string;
}): Promise<string> {
  if (sponsored) {
    const { digest } = await signAndExecuteSponsored({
      wallet,
      client,
      transaction,
      sender,
      recipient: sponsoredRecipient,
    });
    return digest;
  }
  return transactionDigest(await signAndExecuteWithWallet({ wallet, client, transaction }));
}
