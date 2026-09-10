import { Transaction } from '@mysten/sui/transactions';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mintSlippageFromSimulatedLegs,
  parseOrderMintedLegs,
  preflightTransaction,
  readablePreflightError,
} from './transactionPreflight';

const SENDER = `0x${'a'.repeat(64)}`;

describe('readablePreflightError', () => {
  it('maps common Predict abort causes to readable copy', () => {
    expect(readablePreflightError('MoveAbort: EInsufficientBalance')).toContain('Insufficient DUSDC');
    expect(readablePreflightError('oracle feed stale')).toContain('Oracle feed is stale');
    expect(readablePreflightError('EMintPaused')).toContain('Minting is paused');
  });

  it('maps Predict pricing-module aborts, which carry no oracle keywords', () => {
    // Verbatim shape from a failed mint after the upstream feed stopped.
    const stale =
      "Error in 3rd command, from '0xfe742239a3b033f7d52ed5275f238c17d27498ca0ee5ea5672ea732eb3f4dbbb::pricing::live_inputs' (instruction 20), abort code: 4";
    expect(readablePreflightError(stale)).toContain('price feed is paused or stale');
    expect(readablePreflightError(stale.replace('code: 4', 'code: 10'))).toContain(
      'price feed is paused or stale',
    );
    expect(readablePreflightError(stale.replace('code: 4', 'code: 9'))).toContain('close to expiry');
    // Other pricing aborts keep the raw diagnostic.
    expect(readablePreflightError(stale.replace('code: 4', 'code: 0'))).toContain('Preflight failed:');
    expect(readablePreflightError('ETradingPaused')).toContain('Trading is paused');
  });
});

describe('parseOrderMintedLegs', () => {
  it('computes all-in mint cost from OrderMinted event fields', () => {
    const legs = parseOrderMintedLegs({
      $kind: 'Transaction',
      Transaction: {
        status: { success: true, error: null },
        events: [
          {
            eventType: '0xpredict::order_events::OrderMinted',
            json: {
              net_premium: '2100000',
              trading_fee: '100000',
              fee_incentive_subsidy: '20000',
              builder_fee: '10000',
              penalty_fee: '5000',
              entry_probability: '210000000',
            },
          },
        ],
      },
    });

    expect(legs).toEqual([
      {
        // 2_100_000 + (100_000 - 20_000) + 10_000 + 5_000
        allInCost: 2_195_000n,
        entryProbability: 210_000_000n,
      },
    ]);
  });

  it('builds mint slippage caps at 1.5% from simulated legs', () => {
    expect(
      mintSlippageFromSimulatedLegs([{ allInCost: 2_000_000n, entryProbability: 200_000_000n }]),
    ).toEqual([
      {
        maxCost: 2_030_000n,
        maxProbability: 203_000_000n,
      },
    ]);
  });
});

describe('preflightTransaction', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses Sui core transaction simulation when available', async () => {
    const tx = new Transaction();
    const simulateTransaction = vi.fn().mockResolvedValue({
      $kind: 'Transaction',
      Transaction: {
        status: { success: true, error: null },
        events: [
          {
            eventType: '0xpredict::order_events::OrderMinted',
            json: {
              net_premium: '1000',
              trading_fee: '0',
              fee_incentive_subsidy: '0',
              builder_fee: '0',
              penalty_fee: '0',
              entry_probability: '100000000',
            },
          },
        ],
      },
    });

    const result = await preflightTransaction({
      client: { simulateTransaction },
      sender: SENDER,
      transaction: tx,
    });

    expect(simulateTransaction).toHaveBeenCalledWith({
      transaction: tx,
      checksEnabled: true,
      include: { effects: true, events: true },
    });
    expect(result).toEqual({
      status: 'success',
      engine: 'simulateTransaction',
      mintLegs: [{ allInCost: 1000n, entryProbability: 100_000_000n }],
    });
  });

  it('throws a readable error when simulation returns a failed transaction', async () => {
    const tx = new Transaction();
    const simulateTransaction = vi.fn().mockResolvedValue({
      $kind: 'FailedTransaction',
      FailedTransaction: {
        status: {
          success: false,
          error: { message: 'MoveAbort in predict::mint: EPriceOutOfBounds' },
        },
      },
    });

    await expect(
      preflightTransaction({
        client: { simulateTransaction },
        sender: SENDER,
        transaction: tx,
      }),
    ).rejects.toThrow('Preflight failed: MoveAbort in predict::mint: EPriceOutOfBounds');
  });

  it('throws a mapped readable error for insufficient balance aborts', async () => {
    const simulateTransaction = vi.fn().mockResolvedValue({
      $kind: 'FailedTransaction',
      FailedTransaction: {
        status: {
          success: false,
          error: { message: 'MoveAbort: EInsufficientBalance in account::withdraw' },
        },
      },
    });

    await expect(
      preflightTransaction({
        client: { simulateTransaction },
        sender: SENDER,
        transaction: new Transaction(),
      }),
    ).rejects.toThrow(/Insufficient DUSDC/);
  });

  it('falls back to JSON-RPC dev inspect clients used by scripts', async () => {
    const tx = new Transaction();
    const devInspectTransactionBlock = vi.fn().mockResolvedValue({
      effects: { status: { status: 'success' } },
    });

    const result = await preflightTransaction({
      client: { devInspectTransactionBlock },
      sender: SENDER,
      transaction: tx,
    });

    expect(devInspectTransactionBlock).toHaveBeenCalledWith({
      sender: SENDER,
      transactionBlock: tx,
    });
    expect(result).toEqual({ status: 'success', engine: 'devInspectTransactionBlock', mintLegs: [] });
  });

  it('fails closed when the client does not expose a simulation API', async () => {
    await expect(
      preflightTransaction({
        client: {},
        sender: SENDER,
        transaction: new Transaction(),
      }),
    ).rejects.toThrow('Transaction simulation is unavailable');
  });

  it('allows unsimulated transactions only when explicitly enabled for demos', async () => {
    vi.stubEnv('DEMO_ALLOW_UNSIMULATED_TX', 'true');

    const result = await preflightTransaction({
      client: {},
      sender: SENDER,
      transaction: new Transaction(),
    });

    expect(result.status).toBe('skipped');
  });
});
