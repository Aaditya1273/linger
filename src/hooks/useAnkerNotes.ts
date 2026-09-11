'use client';

import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { ANKER_NOTE_ABI, ANKER_NOTE_ADDRESS, isNoteContractConfigured } from '../wallet/ankerNote';

export interface AnkerNoteView {
  readonly tokenId: bigint;
  readonly principal: bigint;
  readonly reserve: bigint;
  readonly coupon: bigint;
  readonly targetPrice: bigint;
  readonly floorPrice: bigint;
  readonly aprBps: bigint;
  readonly feeBpsSnapshot: bigint;
  readonly expiry: bigint;
  readonly strikes: readonly string[];
  readonly quantities: readonly bigint[];
  readonly costs: readonly bigint[];
  /** 0 = Open, 1 = Redeemed. */
  readonly status: number;
}

interface RawNote {
  principal: bigint;
  reserve: bigint;
  coupon: bigint;
  targetPrice: bigint;
  floorPrice: bigint;
  aprBps: bigint;
  feeBpsSnapshot: bigint;
  expiry: bigint;
  strikes: readonly string[];
  quantities: readonly bigint[];
  costs: readonly bigint[];
  status: number;
}

/**
 * Every AnkerNote the connected wallet holds, with its full recorded terms.
 *
 * Two multicall rounds — ids, then the notes — rather than one request per note.
 * Shannon ships multicall3 and the SDK's chain definition carries its address,
 * which is one reason the chain is imported from the SDK rather than hand-rolled.
 *
 * The note is read from chain on every load instead of being cached anywhere:
 * a Position's terms are the contract's record, and a stale local copy of a
 * financial term is worse than a slower page.
 */
export function useAnkerNotes(): {
  notes: AnkerNoteView[];
  isLoading: boolean;
  refetch: () => void;
} {
  const { address } = useAccount();
  const enabled = Boolean(address) && isNoteContractConfigured();
  const contract = { abi: ANKER_NOTE_ABI, address: ANKER_NOTE_ADDRESS as `0x${string}` } as const;

  const balance = useReadContract({
    ...contract,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled },
  });

  const count = Number(balance.data ?? 0n);

  const ids = useReadContracts({
    contracts: Array.from({ length: count }, (_, index) => ({
      ...contract,
      functionName: 'tokenOfOwnerByIndex' as const,
      args: [address as `0x${string}`, BigInt(index)],
    })),
    query: { enabled: enabled && count > 0 },
  });

  const tokenIds = (ids.data ?? [])
    .map((entry) => (entry.status === 'success' ? (entry.result as bigint) : null))
    .filter((id): id is bigint => id !== null);

  const notes = useReadContracts({
    contracts: tokenIds.map((tokenId) => ({
      ...contract,
      functionName: 'getNote' as const,
      args: [tokenId],
    })),
    query: { enabled: tokenIds.length > 0 },
  });

  const views: AnkerNoteView[] = (notes.data ?? []).flatMap((entry, index) => {
    if (entry.status !== 'success') return [];
    const raw = entry.result as unknown as RawNote;
    const tokenId = tokenIds[index];
    if (tokenId === undefined) return [];
    return [{ tokenId, ...raw }];
  });

  return {
    notes: views,
    isLoading: balance.isLoading || ids.isLoading || notes.isLoading,
    refetch: () => {
      void balance.refetch();
      void ids.refetch();
      void notes.refetch();
    },
  };
}
