import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCreateAccountWrapperTransaction,
  buildDepositDusdcTransaction,
  type AccountTransactionConfig,
} from './accountTransactions';

const ACCOUNT_PACKAGE_ID = `0x${'a'.repeat(64)}`;
const ACCOUNT_REGISTRY_ID = `0x${'b'.repeat(64)}`;
const ACCUMULATOR_ROOT = `0x${'c'.repeat(64)}`;
const WRAPPER_ID = `0x${'d'.repeat(64)}`;
const DUSDC = `${`0x${'e'.repeat(64)}`}::dusdc::DUSDC`;

const config: AccountTransactionConfig = {
  accountPackageId: ACCOUNT_PACKAGE_ID,
  accountRegistryId: ACCOUNT_REGISTRY_ID,
  accumulatorRoot: ACCUMULATOR_ROOT,
  quoteAssetType: DUSDC,
  quoteAssetDecimals: 6,
};

describe('account transaction builders', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds AccountWrapper create + share PTB', () => {
    const plan = buildCreateAccountWrapperTransaction({ config });

    expect(plan.calls).toEqual([
      `${ACCOUNT_PACKAGE_ID}::account_registry::new`,
      `${ACCOUNT_PACKAGE_ID}::account::share`,
    ]);
  });

  it('builds DUSDC deposit_funds PTB with Auth and AccumulatorRoot', () => {
    const plan = buildDepositDusdcTransaction({
      wrapperId: WRAPPER_ID,
      amountBaseUnits: 1_000_000n,
      config,
    });

    expect(plan.amountBaseUnits).toBe(1_000_000n);
    expect(plan.calls).toEqual([
      `${ACCOUNT_PACKAGE_ID}::account::generate_auth`,
      `${ACCOUNT_PACKAGE_ID}::account::deposit_funds`,
    ]);
    expect(plan.typeArguments).toEqual([DUSDC]);
  });

  it('rejects non-positive deposit amounts', () => {
    expect(() =>
      buildDepositDusdcTransaction({
        wrapperId: WRAPPER_ID,
        amountBaseUnits: 0n,
        config,
      }),
    ).toThrow(/positive/i);
  });
});
