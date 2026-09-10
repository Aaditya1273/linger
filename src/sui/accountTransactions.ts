import { coinWithBalance, Transaction } from '@mysten/sui/transactions';
import { DEEPBOOK_PREDICT } from '../config/deepbook';
import { SUI_CLOCK_OBJECT_ID } from './accountWrapper';

export interface AccountTransactionConfig {
  accountPackageId: string;
  accountRegistryId: string;
  accumulatorRoot: string;
  quoteAssetType: string;
  quoteAssetDecimals: number;
}

export interface CreateAccountWrapperTransactionPlan {
  tx: Transaction;
  calls: string[];
}

export interface DepositDusdcTransactionPlan {
  tx: Transaction;
  calls: string[];
  typeArguments: string[];
  amountBaseUnits: bigint;
}

export const DEFAULT_ACCOUNT_TX_CONFIG: AccountTransactionConfig = {
  accountPackageId: DEEPBOOK_PREDICT.accountPackageId,
  accountRegistryId: DEEPBOOK_PREDICT.accountRegistryId,
  accumulatorRoot: DEEPBOOK_PREDICT.accumulatorRoot,
  quoteAssetType: DEEPBOOK_PREDICT.quoteAssetType,
  quoteAssetDecimals: DEEPBOOK_PREDICT.quoteAssetDecimals,
};

function accountTarget(config: AccountTransactionConfig, moduleName: string, functionName: string) {
  return `${config.accountPackageId}::${moduleName}::${functionName}`;
}

export function buildCreateAccountWrapperTransaction(input: {
  config?: AccountTransactionConfig;
} = {}): CreateAccountWrapperTransactionPlan {
  const config = input.config ?? DEFAULT_ACCOUNT_TX_CONFIG;
  const tx = new Transaction();
  const calls: string[] = [];

  const newTarget = accountTarget(config, 'account_registry', 'new');
  calls.push(newTarget);
  const wrapper = tx.moveCall({
    target: newTarget,
    arguments: [tx.object(config.accountRegistryId)],
  });

  const shareTarget = accountTarget(config, 'account', 'share');
  calls.push(shareTarget);
  tx.moveCall({
    target: shareTarget,
    arguments: [wrapper],
  });

  return { tx, calls };
}

export function buildDepositDusdcTransaction(input: {
  wrapperId: string;
  amountBaseUnits: bigint;
  config?: AccountTransactionConfig;
}): DepositDusdcTransactionPlan {
  const config = input.config ?? DEFAULT_ACCOUNT_TX_CONFIG;

  if (input.amountBaseUnits <= 0n) {
    throw new Error('Deposit amount must be a positive number of base units.');
  }

  const tx = new Transaction();
  const calls: string[] = [];
  const typeArguments = [config.quoteAssetType];

  const authTarget = accountTarget(config, 'account', 'generate_auth');
  calls.push(authTarget);
  const auth = tx.moveCall({
    target: authTarget,
    arguments: [],
  });

  const depositCoin = coinWithBalance({
    balance: input.amountBaseUnits,
    type: config.quoteAssetType,
  });

  const depositTarget = accountTarget(config, 'account', 'deposit_funds');
  calls.push(depositTarget);
  tx.moveCall({
    target: depositTarget,
    typeArguments,
    arguments: [
      tx.object(input.wrapperId),
      auth,
      depositCoin,
      tx.object(config.accumulatorRoot),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });

  return {
    tx,
    calls,
    typeArguments,
    amountBaseUnits: input.amountBaseUnits,
  };
}
