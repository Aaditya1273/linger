import type { SuiClientTypes } from '@mysten/sui/client';
import type { Transaction } from '@mysten/sui/transactions';
import { fromBase64 } from '@mysten/sui/utils';

/** Wallet handle able to sign a transaction (the dApp Kit instance qualifies). */
export interface WalletTransactionSigner {
  signTransaction(input: { transaction: Transaction }): Promise<{ bytes: string; signature: string }>;
}

/** Client able to submit signed transaction bytes (the current Sui client qualifies). */
export interface SignedTransactionExecutor {
  executeTransaction(input: {
    transaction: Uint8Array;
    signatures: string[];
  }): Promise<SuiClientTypes.TransactionResult>;
}

/**
 * Sign with the wallet, then submit through our own client.
 *
 * Never route through dAppKit.signAndExecuteTransaction: for wallets without
 * the modern sui:signAndExecuteTransaction feature (e.g. the Slush extension)
 * its fallback blindly destructures the wallet-returned rawTransaction as
 * SenderSignedData and throws AFTER the transaction landed on-chain — losing
 * the digest ("Cannot read properties of undefined (reading 'txSignatures')",
 * still present in dapp-kit-core 1.6.5). signTransaction is parse-free on both
 * wallet feature generations, and executing ourselves keeps the digest under
 * our control. See docs/adr/0008-wallet-signs-app-executes.md.
 */
export async function signAndExecuteWithWallet({
  wallet,
  client,
  transaction,
}: {
  wallet: WalletTransactionSigner;
  client: SignedTransactionExecutor;
  transaction: Transaction;
}): Promise<SuiClientTypes.TransactionResult> {
  const { bytes, signature } = await wallet.signTransaction({ transaction });
  return client.executeTransaction({
    transaction: fromBase64(bytes),
    signatures: [signature],
  });
}
