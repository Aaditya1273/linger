import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PredictMarketState } from '../deepbook/predictMarketState';
import { productNoteType } from '../sui/ankerPortfolio';
import { DEFAULT_ANKER_CONFIG } from '../sui/ankerTransactions';
import { useAnkerPortfolio } from '../hooks/useAnkerPortfolio';
import { ClaimSuccessDialog } from './ClaimSuccessDialog';
import { type ConfirmedClaim } from './PortfolioClaimAction';
import { ProductNoteCard } from './PortfolioProductNoteCard';
import { PortfolioPage } from './PortfolioPage';

const OWNER = `0x${'a'.repeat(64)}`;
const NOTE_ID = `0x${'c'.repeat(64)}`;
const MARKET_ID = `0x${'5'.repeat(64)}`;
const ACTIVE_NOTE_ID = `0x${'d'.repeat(64)}`;
const ACTIVE_MARKET_ID = `0x${'6'.repeat(64)}`;

// Mutable on-chain world the mocked client reads from.
const chain = {
  status: 'open' as 'open' | 'redeemed',
  executions: 0,
  rejectAfterBroadcast: false,
  // Adds a second, unsettled note so PortfolioPage shows filter tabs.
  includeActiveNote: false,
  // Settlement sweep already redeemed the legs out of the predict account.
  predictPositionsSwept: false,
};

function noteFieldsJson() {
  const redeemed = chain.status === 'redeemed';
  return {
    owner: OWNER,
    product_kind: '0',
    product_id: 'ZHVhbC1kZW1v',
    wrapper_id: `0x${'b'.repeat(64)}`,
    oracle_id: MARKET_ID,
    expiry_ms: '1000',
    principal_amount: '5000000',
    reserve_amount: '4936412',
    coupon_amount: '7453',
    target_price: '65500000000000',
    floor_price: '64667000000000',
    lower_bound: '0',
    upper_bound: '0',
    is_bullish: false,
    uses_mock_current_deposit: false,
    apr_bps: '9160',
    fee_bps: '1000',
    strikes: ['64667000000000'],
    quantities: ['63588'],
    costs: ['56135'],
    order_ids: ['11'],
    status: redeemed ? '1' : '0',
    redeemed_payout_amount: redeemed ? '5006708' : '0',
    redeemed_fee_amount: redeemed ? '745' : '0',
  };
}

// Open note on an unsettled market — stays in the "Active" bucket throughout.
function activeNoteFieldsJson() {
  return {
    ...noteFieldsJson(),
    oracle_id: ACTIVE_MARKET_ID,
    product_id: 'ZHVhbC1hY3RpdmU=',
    expiry_ms: String(Date.now() + 86_400_000),
    status: '0',
    redeemed_payout_amount: '0',
    redeemed_fee_amount: '0',
  };
}

const WRAPPER_ID = `0x${'b'.repeat(64)}`;
const INNER_ACCOUNT_ID = `0x${'e'.repeat(64)}`;
const PREDICT_APP_FIELD_ID = `0x${'f'.repeat(64)}`;
const POSITIONS_TABLE_ID = `0x${'1'.repeat(64)}`;

// PositionKey BCS: market id (32 bytes) ++ order id (u256 LE).
function positionKeyBcs(marketId: string, orderId: bigint): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.set(
    marketId
      .slice(2)
      .match(/../g)!
      .map((pair) => Number.parseInt(pair, 16)),
    0,
  );
  let value = orderId;
  for (let i = 32; i < 64; i += 1) {
    bytes[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return bytes;
}

const mockClient = {
  core: {
    getObject: vi.fn(async ({ objectId }: { objectId: string }) => {
      if (objectId === WRAPPER_ID) {
        return { object: { json: { account: { account_id: INNER_ACCOUNT_ID } } } };
      }
      if (objectId === PREDICT_APP_FIELD_ID) {
        return { object: { json: { value: { positions: { id: POSITIONS_TABLE_ID } } } } };
      }
      throw new Error(`unexpected getObject ${objectId}`);
    }),
    listDynamicFields: vi.fn(async ({ parentId }: { parentId: string }) => {
      if (parentId === INNER_ACCOUNT_ID) {
        return {
          dynamicFields: [
            {
              fieldId: PREDICT_APP_FIELD_ID,
              name: { type: '0xdb3e::account::DataKey<0xdb3e::predict_account::PredictApp>' },
            },
          ],
          hasNextPage: false,
          cursor: null,
        };
      }
      if (parentId === POSITIONS_TABLE_ID) {
        return {
          dynamicFields: chain.predictPositionsSwept
            ? []
            : [{ name: { type: '0xdb3e::predict_account::PositionKey', bcs: positionKeyBcs(MARKET_ID, 11n) } }],
          hasNextPage: false,
          cursor: null,
        };
      }
      throw new Error(`unexpected listDynamicFields ${parentId}`);
    }),
  },
  listOwnedObjects: vi.fn(async () => ({
    objects: [
      {
        objectId: NOTE_ID,
        type: productNoteType(DEFAULT_ANKER_CONFIG.originalPackageId),
        json: noteFieldsJson(),
      },
      ...(chain.includeActiveNote
        ? [
            {
              objectId: ACTIVE_NOTE_ID,
              type: productNoteType(DEFAULT_ANKER_CONFIG.originalPackageId),
              json: activeNoteFieldsJson(),
            },
          ]
        : []),
    ],
    hasNextPage: false,
    cursor: null,
  })),
  simulateTransaction: vi.fn(async () =>
    chain.status === 'redeemed'
      ? {
          $kind: 'FailedTransaction',
          FailedTransaction: { status: { success: false, error: { message: 'MoveAbort EAlreadyRedeemed' } } },
        }
      : { $kind: 'Transaction', Transaction: { status: { success: true }, events: [] } },
  ),
  executeTransaction: vi.fn(async () => {
    chain.executions += 1;
    chain.status = 'redeemed'; // the transaction lands on-chain either way
    if (chain.rejectAfterBroadcast) {
      throw new Error('Wallet reported an unexpected response.');
    }
    return { $kind: 'Transaction', Transaction: { digest: '11'.repeat(22) } };
  }),
  waitForTransaction: vi.fn(async () => ({ $kind: 'Transaction', Transaction: { digest: '11'.repeat(22) } })),
};

const mockDAppKit = {
  signTransaction: vi.fn(async () => ({ bytes: 'AQID', signature: 'sig' })),
};

vi.mock('@mysten/dapp-kit-react', () => ({
  useCurrentAccount: () => ({ address: OWNER }),
  useCurrentClient: () => mockClient,
  useCurrentWallet: () => null,
  useDAppKit: () => mockDAppKit,
}));

// AppHeader lazy-loads the real wallet button, which needs a DAppKitProvider.
vi.mock('next/dynamic', () => ({
  default: () => () => <button className="wallet-loading">Connect Wallet</button>,
}));

// PortfolioPage market/event hooks — only the claimable note's market settles.
vi.mock('../hooks/useProductNoteMarketStates', () => ({
  useProductNoteMarketStates: () => ({ byMarketId: { [MARKET_ID.toLowerCase()]: settledMarket } }),
}));
vi.mock('../hooks/useProductNoteEventIndex', () => ({
  useProductNoteEventIndex: () => ({ data: undefined }),
}));

const settledMarket: PredictMarketState = {
  expiryMarketId: MARKET_ID,
  expiryMs: 1_000,
  settlementPrice: 65_000,
  settlementPriceBaseUnits: 65_000_000_000_000n,
};

// Mirrors the PortfolioPage wiring: the row card owns the Claim button, the
// dialog renders from lifted state.
function Harness() {
  const portfolio = useAnkerPortfolio();
  const [claim, setClaim] = useState<ConfirmedClaim | null>(null);
  const note = portfolio.data?.[0];
  if (!note) return <p>loading</p>;
  return (
    <>
      <ProductNoteCard note={note} marketState={settledMarket} onClaimSuccess={setClaim} />
      {claim ? <ClaimSuccessDialog note={claim.note} success={claim.summary} onClose={() => setClaim(null)} /> : null}
    </>
  );
}

function renderHarness() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  chain.status = 'open';
  chain.executions = 0;
  chain.rejectAfterBroadcast = false;
  chain.includeActiveNote = false;
  chain.predictPositionsSwept = false;
  vi.clearAllMocks();
});

function lastSignedTransactionJson() {
  const calls = mockDAppKit.signTransaction.mock.calls as unknown as [{ transaction?: { getData(): unknown } }][];
  const call = calls.at(-1)?.[0];
  if (!call?.transaction) throw new Error('no transaction was signed');
  return JSON.stringify(call.transaction.getData());
}

describe('claim flow chain resync', () => {
  it('flips the note to claimed and pops the success card after a successful claim', async () => {
    renderHarness();
    const button = await screen.findByRole('button', { name: 'Claim payout' });
    expect(button).toBeEnabled();

    fireEvent.click(button);

    // The success card pops over the claimed note…
    const dialog = await screen.findByRole('dialog', { name: 'Claim confirmed' });
    expect(within(dialog).getByText('You received')).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    // …and the row itself has flipped to the claimed state: Completed badge,
    // inline Claim gone, the recorded payout in the expanded detail.
    await waitFor(() => expect(screen.getByText('Completed')).toBeVisible());
    expect(screen.queryByRole('button', { name: 'Claim payout' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(await screen.findByText('You received')).toBeVisible();
    expect(chain.executions).toBe(1);
    // The leg is still open on Predict, so the claim redeems it on-chain.
    expect(lastSignedTransactionJson()).toContain('redeem_settled');
  });

  it('claims without redeem calls once the settlement sweep removed the positions', async () => {
    // After settlement a permissionless sweep can redeem every leg straight
    // into the account; a claim that still calls redeem_settled aborts in
    // predict_account::remove_position. The claim must withdraw-only instead.
    chain.predictPositionsSwept = true;
    renderHarness();

    fireEvent.click(await screen.findByRole('button', { name: 'Claim payout' }));

    await screen.findByRole('dialog', { name: 'Claim confirmed' });
    const signed = lastSignedTransactionJson();
    expect(signed).not.toContain('redeem_settled');
    expect(signed).toContain('record_redeem_with_fee');
    expect(chain.executions).toBe(1);
  });

  it('resyncs to the on-chain claimed state when the wallet rejects after broadcasting', async () => {
    chain.rejectAfterBroadcast = true;
    renderHarness();
    const button = await screen.findByRole('button', { name: 'Claim payout' });

    fireEvent.click(button);

    // The transaction landed on-chain; the UI must converge to the truth
    // instead of leaving a claimable-looking, error-on-reclick note.
    await waitFor(() => expect(screen.getByText('Completed')).toBeVisible());
    expect(screen.queryByRole('button', { name: 'Claim payout' })).toBeNull();
    // The wallet failure stays visible on the row while the state converges.
    expect(screen.getByText('Wallet reported an unexpected response.')).toBeVisible();
    // No success card on the error path — the wallet reported a failure.
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('PortfolioPage claim success dialog', () => {
  it('keeps the dialog visible when the claimed card leaves the Ready filter bucket', async () => {
    // Regression: the dialog state used to live inside the note card. Claiming
    // from the "Ready to claim" tab optimistically moves the note to Completed,
    // unmounting the card in the same render — the dialog never appeared.
    chain.includeActiveNote = true;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PortfolioPage />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('tab', { name: /Ready to claim/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Claim payout' }));

    // The claimed card drops out of the Ready view…
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Claim payout' })).toBeNull());
    // …but the success card still pops from page-level state.
    const dialog = await screen.findByRole('dialog', { name: 'Claim confirmed' });
    expect(within(dialog).getByText('You received')).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
