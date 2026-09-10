import { describe, expect, it, vi } from 'vitest';
import type { SuiClientTypes } from '@mysten/sui/client';
import type { Transaction } from '@mysten/sui/transactions';
import { signAndExecuteWithWallet } from './walletExecution';

describe('signAndExecuteWithWallet', () => {
  it('signs with the wallet and submits the signed bytes through the client', async () => {
    const executed = {
      $kind: 'Transaction',
      Transaction: { digest: '0xdigest' },
    } as unknown as SuiClientTypes.TransactionResult;
    const wallet = { signTransaction: vi.fn(async () => ({ bytes: 'AQID', signature: 'sig' })) };
    const client = { executeTransaction: vi.fn(async () => executed) };
    const transaction = { kind: 'stub' } as unknown as Transaction;

    const result = await signAndExecuteWithWallet({ wallet, client, transaction });

    expect(wallet.signTransaction).toHaveBeenCalledWith({ transaction });
    expect(client.executeTransaction).toHaveBeenCalledWith({
      transaction: new Uint8Array([1, 2, 3]),
      signatures: ['sig'],
    });
    expect(result).toBe(executed);
  });

  it('does not submit anything when the wallet refuses to sign', async () => {
    const wallet = { signTransaction: vi.fn(async () => Promise.reject(new Error('User rejected'))) };
    const client = { executeTransaction: vi.fn() };
    const transaction = { kind: 'stub' } as unknown as Transaction;

    await expect(signAndExecuteWithWallet({ wallet, client, transaction })).rejects.toThrow('User rejected');
    expect(client.executeTransaction).not.toHaveBeenCalled();
  });
});
