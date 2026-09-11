'use client';

import { useState } from 'react';
import { erc20Abi } from 'viem';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { ANKER_NOTE_ABI, ANKER_NOTE_ADDRESS } from '../wallet/ankerNote';
import { explorerTx } from '../wallet/config';
import type { AnkerNoteView } from '../hooks/useAnkerNotes';
import { Button } from '../ui';

/** Shannon collateral, read from the note contract so it is never a literal here. */
async function readCollateral(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
): Promise<`0x${string}`> {
  return (await publicClient.readContract({
    abi: ANKER_NOTE_ABI,
    address: ANKER_NOTE_ADDRESS as `0x${string}`,
    functionName: 'collateral',
  })) as `0x${string}`;
}

/**
 * Claim one Position: record the redeem and pay the performance fee.
 *
 * Two steps, and the first is skipped when it is not needed. The contract pulls
 * the fee with `safeTransferFrom`, so it needs an allowance — but only up to the
 * fee, and only when the note actually earned a coupon. A note with no coupon
 * owes nothing and goes straight to the redeem call, which is the on-chain
 * expression of "no coupon, no fee".
 *
 * The fee is read from the contract (`quoteFee`) rather than recomputed here:
 * the note's own `feeBpsSnapshot` is the authority, and a client-side estimate
 * that disagreed would either under-approve and revert, or over-approve and
 * leave a standing allowance.
 */
export function ClaimAction({
  note,
  payoutAmount,
  onClaimed,
}: {
  note: AnkerNoteView;
  /** Gross payout realised on DreamDEX, raw units. Recorded in the event. */
  payoutAmount: bigint;
  onClaimed?: () => void;
}) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [state, setState] = useState<'idle' | 'approving' | 'claiming'>('idle');
  const [result, setResult] = useState<{ ok: boolean; message: string; hash?: string } | null>(null);

  const alreadyRedeemed = note.status === 1;

  async function claim() {
    if (!publicClient || !address) return;
    setResult(null);
    try {
      const noteContract = { abi: ANKER_NOTE_ABI, address: ANKER_NOTE_ADDRESS as `0x${string}` } as const;

      const fee = (await publicClient.readContract({
        ...noteContract,
        functionName: 'quoteFee',
        args: [note.tokenId],
      })) as bigint;

      if (fee > 0n) {
        const collateral = await readCollateral(publicClient);
        const allowance = (await publicClient.readContract({
          abi: erc20Abi,
          address: collateral,
          functionName: 'allowance',
          args: [address, ANKER_NOTE_ADDRESS as `0x${string}`],
        })) as bigint;

        if (allowance < fee) {
          setState('approving');
          const approveHash = await writeContractAsync({
            abi: erc20Abi,
            address: collateral,
            functionName: 'approve',
            // Exactly the fee — no standing allowance left behind.
            args: [ANKER_NOTE_ADDRESS as `0x${string}`, fee],
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }
      }

      setState('claiming');
      const hash = await writeContractAsync({
        ...noteContract,
        functionName: 'recordRedeemWithFee',
        args: [note.tokenId, payoutAmount],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setResult({ ok: true, message: 'Claimed. Position closed.', hash });
      onClaimed?.();
    } catch (error) {
      setResult({
        ok: false,
        message: error instanceof Error ? error.message.split('\n')[0] ?? 'Claim failed.' : 'Claim failed.',
      });
    } finally {
      setState('idle');
    }
  }

  if (alreadyRedeemed) {
    return <span className="muted">Claimed</span>;
  }

  return (
    <>
      <Button onClick={claim} disabled={state !== 'idle'}>
        {state === 'approving' ? 'Approving fee…' : state === 'claiming' ? 'Claiming…' : 'Claim'}
      </Button>
      {result && (
        <p className={result.ok ? 'di-hint' : 'di-error'}>
          {result.message}{' '}
          {result.hash && (
            <a href={explorerTx(result.hash)} target="_blank" rel="noreferrer">
              View transaction
            </a>
          )}
        </p>
      )}
    </>
  );
}
