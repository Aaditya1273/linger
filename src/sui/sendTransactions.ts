import { coinWithBalance, Transaction } from '@mysten/sui/transactions';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { DEFAULT_ACCOUNT_TX_CONFIG, type AccountTransactionConfig } from './accountTransactions';
import { SUI_CLOCK_OBJECT_ID } from './accountWrapper';

/**
 * Parse a user-typed dUSDC amount ("12.5") into base units, or null when the
 * text is not a plain decimal within the asset's precision. String math, not
 * floats — 6-decimal amounts silently lose precision through Number.
 */
export function parseDusdcAmount(value: string, decimals = 6): bigint | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return null;
  const [, whole, fraction = ''] = match;
  if (fraction.length > decimals) return null;
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
}

/**
 * Format base units back into the plain-decimal text parseDusdcAmount accepts.
 * String math, not floats — Number(baseUnits) / 1e6 drifts above 2^53.
 */
export function formatDusdcAmount(baseUnits: bigint, decimals = 6): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = baseUnits / divisor;
  const fraction = (baseUnits % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export interface SendDusdcTransactionPlan {
  tx: Transaction;
  calls: string[];
  amountBaseUnits: bigint;
  /** Portion pulled back from the sender's AccountWrapper before transferring. */
  sweepBaseUnits: bigint;
  recipient: string;
}

/**
 * Send (转出): transfer dUSDC from the connected wallet to any Sui address.
 * Available is one number everywhere — wallet coins plus idle wrapper balance —
 * so when the amount exceeds the wallet's coins the plan first sweeps the
 * difference out of the sender's own AccountWrapper (account::withdraw_funds,
 * the same call Claim uses) and then transfers a single coin to the recipient.
 * The resulting shape is exactly what the sponsor's send gate admits
 * (ADR-0010): coin plumbing, the sweep pair, nothing else.
 */
export function buildSendDusdcTransaction(input: {
  sender: string;
  recipient: string;
  amountBaseUnits: bigint;
  walletBalanceBaseUnits: bigint;
  wrapper?: { wrapperId: string; balanceBaseUnits: bigint };
  config?: AccountTransactionConfig;
}): SendDusdcTransactionPlan {
  if (!isValidSuiAddress(input.recipient)) {
    throw new Error('Recipient must be a valid Sui address.');
  }
  if (input.amountBaseUnits <= 0n) {
    throw new Error('Send amount must be a positive number of base units.');
  }
  const wrapperBalance = input.wrapper?.balanceBaseUnits ?? 0n;
  const available = input.walletBalanceBaseUnits + wrapperBalance;
  if (input.amountBaseUnits > available) {
    throw new Error('Send amount exceeds the available balance.');
  }

  const config = input.config ?? DEFAULT_ACCOUNT_TX_CONFIG;
  const recipient = normalizeSuiAddress(input.recipient);
  const tx = new Transaction();
  tx.setSender(input.sender);
  const calls: string[] = [];

  const sweepBaseUnits =
    input.amountBaseUnits > input.walletBalanceBaseUnits
      ? input.amountBaseUnits - input.walletBalanceBaseUnits
      : 0n;

  if (sweepBaseUnits > 0n) {
    const wrapper = input.wrapper!;
    const authTarget = `${config.accountPackageId}::account::generate_auth`;
    calls.push(authTarget);
    const auth = tx.moveCall({ target: authTarget, arguments: [] });

    const withdrawTarget = `${config.accountPackageId}::account::withdraw_funds`;
    calls.push(withdrawTarget);
    const [sweptCoin] = tx.moveCall({
      target: withdrawTarget,
      typeArguments: [config.quoteAssetType],
      arguments: [
        tx.object(wrapper.wrapperId),
        auth,
        tx.pure.u64(sweepBaseUnits),
        tx.object(config.accumulatorRoot),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });

    if (sweepBaseUnits < input.amountBaseUnits) {
      const walletCoin = coinWithBalance({
        balance: input.amountBaseUnits - sweepBaseUnits,
        type: config.quoteAssetType,
      });
      calls.push('mergeCoins');
      tx.mergeCoins(sweptCoin, [walletCoin]);
    }

    calls.push('transferObjects');
    tx.transferObjects([sweptCoin], recipient);
  } else {
    const coin = coinWithBalance({
      balance: input.amountBaseUnits,
      type: config.quoteAssetType,
    });
    calls.push('transferObjects');
    tx.transferObjects([coin], recipient);
  }

  return {
    tx,
    calls,
    amountBaseUnits: input.amountBaseUnits,
    sweepBaseUnits,
    recipient,
  };
}
