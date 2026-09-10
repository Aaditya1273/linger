import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQuoteEnvelope } from '../products/quoteEnvelope';
import type { SettlementResult } from '../products/settlement';
import type { DualInvestmentInput, StructuredProductQuote } from '../products/types';
import {
  buildCreateAccountWrapperTransaction,
  buildDepositDusdcTransaction,
  type AccountTransactionConfig,
} from '../sui/accountTransactions';
import type { AnkerProductNoteRecord } from '../sui/ankerPortfolio';
import {
  buildClaimDualInvestmentNoteTransaction,
  buildSubscribeDualInvestmentTransaction,
  type AnkerProtocolConfig,
} from '../sui/ankerTransactions';
import { buildSendDusdcTransaction } from '../sui/sendTransactions';
import {
  assertSendTransactionShape,
  createAppSponsoredTransaction,
  sendSponsoredMoveCallTargets,
  SponsorshipInputError,
  SponsorshipNotConfiguredError,
  sponsoredMoveCallTargets,
} from './enokiSponsor';

const OWNER = `0x${'a'.repeat(64)}`;
const MANAGER_ID = `0x${'b'.repeat(64)}`;
const NOTE_ID = `0x${'c'.repeat(64)}`;
const ANKER_PACKAGE_ID = `0x${'1'.repeat(64)}`;
const PREDICT_PACKAGE_ID = `0x${'3'.repeat(64)}`;
const ACCOUNT_PACKAGE_ID = `0x${'7'.repeat(64)}`;
const PREDICT_OBJECT_ID = `0x${'4'.repeat(64)}`;
const ORACLE_ID = `0x${'5'.repeat(64)}`;
const DUSDC = `${`0x${'6'.repeat(64)}`}::dusdc::DUSDC`;

const config: AnkerProtocolConfig = {
  packageId: ANKER_PACKAGE_ID,
  originalPackageId: ANKER_PACKAGE_ID,
  registryId: `0x${'2'.repeat(64)}`,
  predictPackageId: PREDICT_PACKAGE_ID,
  poolVaultId: PREDICT_OBJECT_ID,
  accountPackageId: ACCOUNT_PACKAGE_ID,
  accountRegistryId: `0x${'8'.repeat(64)}`,
  accumulatorRoot: `0x${'9'.repeat(64)}`,
  protocolConfigId: `0x${'d'.repeat(64)}`,
  oracleRegistryId: `0x${'e'.repeat(64)}`,
  oracle: {
    pythFeed: `0x${'f'.repeat(64)}`,
    blockScholesValueStore: `0x${'e'.repeat(64)}`,
    blockScholesSviStore: `0x${'0'.repeat(63)}1`,
  },
  quoteAssetType: DUSDC,
  quoteAssetDecimals: 6,
};

const accountConfig: AccountTransactionConfig = {
  accountPackageId: ACCOUNT_PACKAGE_ID,
  accountRegistryId: config.accountRegistryId,
  accumulatorRoot: config.accumulatorRoot,
  quoteAssetType: DUSDC,
  quoteAssetDecimals: 6,
};

function quoteFixture(): StructuredProductQuote {
  return {
    id: 'dual-demo',
    productType: 'dual-investment',
    title: 'Target Buy BTC at 66,000',
    principal: 1_000,
    oracle: {
      predictId: PREDICT_OBJECT_ID,
      oracleId: ORACLE_ID,
      underlyingAsset: 'BTC',
      expiryMs: 1_781_683_200_000,
      minStrike: 50_000,
      tickSize: 0.01,
      admissionTickSize: 1,
      status: 'active',
      spot: 66_172,
      forward: 66_167,
      spotTimestampMs: 1,
      sviTimestampMs: 1,
      serverLagSeconds: 1,
    },
    legs: [
      {
        id: 'up-61000',
        instrumentType: 'binary-up',
        oracleId: ORACLE_ID,
        expiryMs: 1_781_683_200_000,
        strike: 61_000,
        isUp: true,
        quantity: 10,
        description: 'UP 61,000',
        askPrice: 0.21,
        askCost: 2.1,
        redeemPreview: 0,
        quoteTimestampMs: 1,
        executable: true,
      },
    ],
    totalLegCost: 2.1,
    reserve: 610,
    coupon: 20,
    apr: 1.9264,
    executable: true,
    scenarios: [],
  };
}

function noteFixture(): AnkerProductNoteRecord {
  return {
    noteId: NOTE_ID,
    productType: 'dual-investment',
    productId: 'dual-demo',
    owner: OWNER,
    wrapperId: MANAGER_ID,
    oracleId: ORACLE_ID,
    expiryMs: 1_781_683_200_000,
    principal: 1_000,
    principalBaseUnits: 1_000_000_000n,
    reserve: 610,
    reserveBaseUnits: 610_000_000n,
    coupon: 20,
    couponBaseUnits: 20_000_000n,
    targetPrice: 66_000,
    floorPrice: 61_000,
    lowerBound: 0,
    upperBound: 0,
    isBullish: false,
    usesMockCurrentDeposit: false,
    apr: 1.9264,
    feeBps: 1_000,
    legs: [{ strike: 61_000, quantity: 10, quantityBaseUnits: 10_000_000n, cost: 2.1, costBaseUnits: 2_100_000n }],
    orderIds: [11n],
    status: 'open',
    redeemedPayout: 0,
    redeemedPayoutBaseUnits: 0n,
    redeemedFee: 0,
    redeemedFeeBaseUnits: 0n,
  };
}

function settlementFixture(): SettlementResult {
  return {
    grossPayoutBaseUnits: 1_020_000_000n,
    performanceFeeBaseUnits: 2_000_000n,
    netPayoutBaseUnits: 1_018_000_000n,
    realizedLegs: [],
  };
}

/** Plan `calls` mixes Move targets with native commands (splitCoins, ...). */
function moveCallTargets(calls: string[]): string[] {
  return calls.filter((entry) => entry.includes('::'));
}

describe('sponsoredMoveCallTargets', () => {
  const whitelist = sponsoredMoveCallTargets(config);

  it('covers every create-account-wrapper target', () => {
    const plan = buildCreateAccountWrapperTransaction({ config: accountConfig });
    for (const target of moveCallTargets(plan.calls)) {
      expect(whitelist).toContain(target);
    }
  });

  it('covers every deposit target', () => {
    const plan = buildDepositDusdcTransaction({
      wrapperId: MANAGER_ID,
      amountBaseUnits: 1_000_000n,
      config: accountConfig,
    });
    for (const target of moveCallTargets(plan.calls)) {
      expect(whitelist).toContain(target);
    }
  });

  it('covers every subscribe target, including the top-up deposit path', () => {
    const quote = quoteFixture();
    const plan = buildSubscribeDualInvestmentTransaction({
      accountAddress: OWNER,
      wrapperId: MANAGER_ID,
      productInput: { principal: 1_000, targetPrice: 66_000, floorPrice: 61_000, targetLegCount: 1 } satisfies DualInvestmentInput,
      quote,
      quoteEnvelope: createQuoteEnvelope({
        quote,
        network: 'testnet',
        quoteAssetDecimals: config.quoteAssetDecimals,
        ttlMs: 30_000,
        slippageBps: 100,
      }),
      wrapperBalanceBaseUnits: 0n,
      nowMs: 1,
      config,
    });
    expect(plan.topUpAmount).toBeGreaterThan(0n);
    for (const target of moveCallTargets(plan.calls)) {
      expect(whitelist).toContain(target);
    }
  });

  it('covers every claim target', () => {
    const plan = buildClaimDualInvestmentNoteTransaction({
      accountAddress: OWNER,
      note: noteFixture(),
      settlement: settlementFixture(),
      config,
    });
    for (const target of moveCallTargets(plan.calls)) {
      expect(whitelist).toContain(target);
    }
  });

  it('covers the framework calls emitted by coinWithBalance intent resolution', () => {
    // These never show up in plan `calls`: the coinWithBalance intent expands
    // into them when the transaction is built. zkLogin accounts funded via
    // send_funds hold dUSDC as address balance, which resolves to redeem_funds.
    // Enoki only matches fully-normalized package addresses, never "0x2".
    const framework = `0x${'0'.repeat(63)}2`;
    expect(whitelist).toContain(`${framework}::coin::redeem_funds`);
    expect(whitelist).toContain(`${framework}::coin::send_funds`);
    expect(whitelist).toContain(`${framework}::coin::destroy_zero`);
    for (const target of whitelist) {
      expect(target).not.toMatch(/^0x2::/);
    }
  });
});

const RECIPIENT = `0x${'9'.repeat(64)}`;
/** base58 of 32 zero bytes — a syntactically valid object digest for refs. */
const FAKE_DIGEST = '11111111111111111111111111111111';

function ownedCoinRef(tx: Transaction) {
  return tx.objectRef({ objectId: NOTE_ID, version: '1', digest: FAKE_DIGEST });
}

async function kindBytes(tx: Transaction): Promise<string> {
  return toBase64(await tx.build({ onlyTransactionKind: true }));
}

describe('sendSponsoredMoveCallTargets', () => {
  const sendWhitelist = sendSponsoredMoveCallTargets(config);

  it('covers every sweep-send plan target', () => {
    const plan = buildSendDusdcTransaction({
      sender: OWNER,
      recipient: RECIPIENT,
      amountBaseUnits: 1_500_000n,
      walletBalanceBaseUnits: 1_000_000n,
      wrapper: { wrapperId: MANAGER_ID, balanceBaseUnits: 600_000n },
      config: accountConfig,
    });
    expect(plan.sweepBaseUnits).toBe(500_000n);
    for (const target of moveCallTargets(plan.calls)) {
      expect(sendWhitelist).toContain(target);
    }
  });

  it('covers the coinWithBalance framework calls and no protocol flow targets', () => {
    const framework = `0x${'0'.repeat(63)}2`;
    expect(sendWhitelist).toContain(`${framework}::coin::redeem_funds`);
    expect(sendWhitelist).toContain(`${framework}::coin::send_funds`);
    expect(sendWhitelist).toContain(`${framework}::coin::destroy_zero`);
    expect(sendWhitelist).not.toContain(`${config.packageId}::product_note::new_dual_investment_note_verified`);
    expect(sendWhitelist).not.toContain(`${config.predictPackageId}::expiry_market::mint_exact_quantity`);
  });
});

describe('assertSendTransactionShape', () => {
  it('accepts plain coin plumbing that ends in a transfer', async () => {
    const tx = new Transaction();
    const [coin] = tx.splitCoins(ownedCoinRef(tx), [tx.pure.u64(100)]);
    tx.transferObjects([coin], RECIPIENT);
    const kind = await kindBytes(tx);
    expect(() => assertSendTransactionShape(kind, config)).not.toThrow();
  });

  it('accepts the sweep shape: generate_auth + withdraw_funds typed as the quote asset', async () => {
    const tx = new Transaction();
    const auth = tx.moveCall({ target: `${ACCOUNT_PACKAGE_ID}::account::generate_auth`, arguments: [] });
    const [swept] = tx.moveCall({
      target: `${ACCOUNT_PACKAGE_ID}::account::withdraw_funds`,
      typeArguments: [DUSDC],
      arguments: [
        tx.sharedObjectRef({ objectId: MANAGER_ID, initialSharedVersion: '1', mutable: true }),
        auth,
        tx.pure.u64(500_000),
        tx.sharedObjectRef({ objectId: config.accumulatorRoot, initialSharedVersion: '1', mutable: true }),
        tx.sharedObjectRef({ objectId: `0x${'0'.repeat(63)}6`, initialSharedVersion: '1', mutable: false }),
      ],
    });
    tx.transferObjects([swept], RECIPIENT);
    const kind = await kindBytes(tx);
    expect(() => assertSendTransactionShape(kind, config)).not.toThrow();
  });

  it('rejects Move calls outside the send allowlist', async () => {
    const tx = new Transaction();
    tx.moveCall({ target: `${ACCOUNT_PACKAGE_ID}::account::deposit_funds`, typeArguments: [DUSDC], arguments: [ownedCoinRef(tx)] });
    tx.transferObjects([ownedCoinRef(tx)], RECIPIENT);
    const kind = await kindBytes(tx);
    expect(() => assertSendTransactionShape(kind, config)).toThrow(SponsorshipInputError);
  });

  it('rejects type arguments other than the quote asset', async () => {
    const tx = new Transaction();
    const auth = tx.moveCall({ target: `${ACCOUNT_PACKAGE_ID}::account::generate_auth`, arguments: [] });
    const [swept] = tx.moveCall({
      target: `${ACCOUNT_PACKAGE_ID}::account::withdraw_funds`,
      typeArguments: ['0x2::sui::SUI'],
      arguments: [tx.sharedObjectRef({ objectId: MANAGER_ID, initialSharedVersion: '1', mutable: true }), auth, tx.pure.u64(1)],
    });
    tx.transferObjects([swept], RECIPIENT);
    const kind = await kindBytes(tx);
    expect(() => assertSendTransactionShape(kind, config)).toThrow(/quote asset/);
  });

  it('rejects transactions that touch the sponsored gas coin', async () => {
    const tx = new Transaction();
    tx.transferObjects([tx.gas], RECIPIENT);
    const kind = await kindBytes(tx);
    expect(() => assertSendTransactionShape(kind, config)).toThrow(/gas coin/);
  });

  it('rejects transactions that never transfer', async () => {
    const tx = new Transaction();
    tx.splitCoins(ownedCoinRef(tx), [tx.pure.u64(1)]);
    const kind = await kindBytes(tx);
    expect(() => assertSendTransactionShape(kind, config)).toThrow(/transfer/);
  });

  it('rejects unparsable bytes', () => {
    expect(() => assertSendTransactionShape('AA==', config)).toThrow(SponsorshipInputError);
  });
});

describe('createAppSponsoredTransaction', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects a malformed sender before touching Enoki', async () => {
    await expect(
      createAppSponsoredTransaction({ sender: 'not-an-address', transactionKindBytes: 'AA==' }),
    ).rejects.toBeInstanceOf(SponsorshipInputError);
  });

  it('rejects an oversized transaction payload', async () => {
    await expect(
      createAppSponsoredTransaction({ sender: OWNER, transactionKindBytes: 'A'.repeat(256 * 1024 + 1) }),
    ).rejects.toBeInstanceOf(SponsorshipInputError);
  });

  it('rejects a malformed recipient before touching Enoki', async () => {
    await expect(
      createAppSponsoredTransaction({ sender: OWNER, transactionKindBytes: 'AA==', recipient: 'not-an-address' }),
    ).rejects.toBeInstanceOf(SponsorshipInputError);
  });

  it('gates send sponsorships on the transaction shape', async () => {
    // 'AA==' is not a parsable transaction kind, so the shape gate rejects it
    // even before the Enoki key is consulted.
    await expect(
      createAppSponsoredTransaction({ sender: OWNER, transactionKindBytes: 'AA==', recipient: RECIPIENT }),
    ).rejects.toBeInstanceOf(SponsorshipInputError);
  });

  it('reports unconfigured sponsorship for valid input', async () => {
    vi.stubEnv('ENOKI_PRIVATE_API_KEY', '');
    await expect(
      createAppSponsoredTransaction({ sender: OWNER, transactionKindBytes: 'AA==' }),
    ).rejects.toBeInstanceOf(SponsorshipNotConfiguredError);
  });
});
