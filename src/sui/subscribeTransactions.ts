import { coinWithBalance, Transaction } from '@mysten/sui/transactions';
import { MIN_LEG_PREMIUM_USD, estimateBinaryUpPremiumUsd } from '../products/predictPricing';
import { assertQuoteEnvelope, type QuoteEnvelope } from '../products/quoteEnvelope';
import type { DualInvestmentInput, StructuredProductQuote } from '../products/types';
import { alignPriceToAdmissionGrid, POS_INF_TICK } from './predictTicks';
import {
  U64_MAX,
  LEVERAGE_1X,
  accountTarget,
  assertDualInvestmentQuote,
  assertQuoteMatchesConfig,
  legBinaryUpTicks,
  legCostToBaseUnits,
  legQuantityToBaseUnits,
  predictTarget,
  productIdBytes,
  subscribeTopUpBaseUnits,
  target,
  toBpsU64,
  toChainPriceU64,
  toQuoteBaseUnits,
} from './ankerTransactionPrimitives';
import { DEFAULT_ANKER_CONFIG, type AnkerProtocolConfig } from './ankerProtocolConfig';

export interface MintLegSlippage {
  maxCost: bigint;
  maxProbability: bigint;
}

export interface SubscribeDualInvestmentTransactionPlan {
  tx: Transaction;
  calls: string[];
  depositAmount: bigint;
  topUpAmount: bigint;
  legStrikes: bigint[];
  legQuantities: bigint[];
  legCosts: bigint[];
  legLowerTicks: bigint[];
  legHigherTicks: bigint[];
  mintSlippage: MintLegSlippage[];
  targetPrice: bigint;
  floorPrice: bigint;
  productIdBytes: number[];
}

function uncappedMintSlippage(legCount: number): MintLegSlippage[] {
  return Array.from({ length: legCount }, () => ({
    maxCost: U64_MAX,
    maxProbability: U64_MAX,
  }));
}

/**
 * Client-side mirror of `strike_exposure_config::assert_mint_admission` (abort 4):
 * each leg's fee-exclusive premium must clear the chain's 1 dUSDC minimum. Uses
 * the local SVI fair price as the pricer estimate; skips legs it cannot price
 * (the pre-sign simulation still covers those).
 */
function assertLegPremiumsAboveChainFloor(quote: StructuredProductQuote) {
  quote.legs.forEach((leg, index) => {
    if (typeof leg.strike !== 'number') return;
    const premium = estimateBinaryUpPremiumUsd({
      market: quote.oracle,
      strike: leg.strike,
      quantity: leg.quantity,
    });
    if (premium !== null && premium < MIN_LEG_PREMIUM_USD) {
      throw new Error(
        `Leg ${index + 1} premium ~${premium.toFixed(4)} dUSDC is below Predict's ` +
          `${MIN_LEG_PREMIUM_USD} dUSDC minimum per mint; increase the subscription amount ` +
          'or reduce the leg count.',
      );
    }
  });
}

/**
 * Client-side mirror of `strike_exposure::assert_admitted_mint_ticks` so an
 * off-admission-grid leg fails here with a readable message instead of a bare
 * on-chain abort (code 1). reference_tick is unknowable offline and ignored.
 */
function assertAdmittedMintTicks(input: {
  legLowerTicks: readonly bigint[];
  legHigherTicks: readonly bigint[];
  tickSizeUsd: number;
  admissionTickSizeUsd: number;
}) {
  const ratio = BigInt(Math.round(input.admissionTickSizeUsd / input.tickSizeUsd));
  if (ratio <= 1n) return;
  input.legLowerTicks.forEach((lowerTick, index) => {
    const higherTick = input.legHigherTicks[index];
    const lowerAdmitted = lowerTick === 0n || lowerTick % ratio === 0n;
    const higherAdmitted = higherTick === POS_INF_TICK || higherTick % ratio === 0n;
    if (!lowerAdmitted || !higherAdmitted) {
      const strike = Number(lowerAdmitted ? higherTick : lowerTick) * input.tickSizeUsd;
      throw new Error(
        `Leg ${index + 1} strike ${strike.toLocaleString('en-US')} is not on the market's ` +
          `$${input.admissionTickSizeUsd} admission grid; the chain would abort the mint.`,
      );
    }
  });
}

export function buildSubscribeDualInvestmentTransaction(input: {
  accountAddress: string;
  wrapperId: string;
  productInput: DualInvestmentInput;
  quote: StructuredProductQuote;
  quoteEnvelope: QuoteEnvelope;
  /** Existing AccountWrapper DUSDC balance (base units). Defaults to 0 → full principal top-up. */
  wrapperBalanceBaseUnits?: bigint;
  /**
   * Per-leg mint caps. Omit for provisional simulation (u64::MAX).
   * Signed txs pass simulate-derived cost × MINT_SLIPPAGE_BPS.
   */
  mintSlippage?: readonly MintLegSlippage[];
  nowMs?: number;
  config?: AnkerProtocolConfig;
}): SubscribeDualInvestmentTransactionPlan {
  const config = input.config ?? DEFAULT_ANKER_CONFIG;
  assertDualInvestmentQuote(input.quote);
  assertQuoteMatchesConfig(input.quote, config);
  assertQuoteEnvelope({
    quote: input.quote,
    envelope: input.quoteEnvelope,
    network: config.network ?? 'testnet',
    quoteAssetDecimals: config.quoteAssetDecimals,
    nowMs: input.nowMs ?? Date.now(),
  });

  const tickSizeUsd = input.quote.oracle.tickSize;
  if (!(tickSizeUsd > 0)) {
    throw new Error('Quote market tickSize must be positive.');
  }

  const tx = new Transaction();
  tx.setSender(input.accountAddress);
  const calls: string[] = [];
  const depositAmount = toQuoteBaseUnits(input.quote.principal, config.quoteAssetDecimals, 'Quote principal');
  const wrapperBalance = input.wrapperBalanceBaseUnits ?? 0n;
  const topUpAmount = subscribeTopUpBaseUnits(depositAmount, wrapperBalance);
  const legStrikes = input.quote.legs.map((leg) => toChainPriceU64(leg.strike ?? 0, `Quote leg ${leg.id} strike`));
  const legQuantities = input.quote.legs.map((leg) => legQuantityToBaseUnits(leg, config));
  const legCosts = input.quote.legs.map((leg) => legCostToBaseUnits(leg, config));
  const ranges = input.quote.legs.map((leg) => legBinaryUpTicks(leg, tickSizeUsd));
  const legLowerTicks = ranges.map((range) => range.lowerTick);
  const legHigherTicks = ranges.map((range) => range.higherTick);
  const mintSlippage = input.mintSlippage
    ? [...input.mintSlippage]
    : uncappedMintSlippage(input.quote.legs.length);
  if (mintSlippage.length !== input.quote.legs.length) {
    throw new Error('Mint slippage must include one entry per quote leg.');
  }

  const targetAdmission =
    input.quote.oracle.admissionTickSize && input.quote.oracle.admissionTickSize > 0
      ? input.quote.oracle.admissionTickSize
      : tickSizeUsd;
  assertAdmittedMintTicks({
    legLowerTicks,
    legHigherTicks,
    tickSizeUsd,
    admissionTickSizeUsd: targetAdmission,
  });
  assertLegPremiumsAboveChainFloor(input.quote);
  const targetPrice = toChainPriceU64(
    alignPriceToAdmissionGrid(input.productInput.targetPrice, targetAdmission),
    'Target price',
  );
  const floorPrice = toChainPriceU64(
    alignPriceToAdmissionGrid(input.productInput.floorPrice, targetAdmission),
    'Floor price',
  );
  const idBytes = productIdBytes(input.quoteEnvelope.productHash);
  const wrapper = tx.object(input.wrapperId);
  const market = tx.object(input.quote.oracle.oracleId);
  const protocolConfig = tx.object(config.protocolConfigId);
  const accumulatorRoot = tx.object(config.accumulatorRoot);
  const clock = tx.object.clock();

  const balanceTarget = target(config, 'product_note', 'wrapper_balance');
  calls.push(balanceTarget);
  const [balanceBefore] = tx.moveCall({
    target: balanceTarget,
    typeArguments: [config.quoteAssetType],
    arguments: [wrapper, accumulatorRoot, clock],
  });

  if (topUpAmount > 0n) {
    const authTarget = accountTarget(config, 'account', 'generate_auth');
    calls.push(authTarget);
    const auth = tx.moveCall({
      target: authTarget,
      arguments: [],
    });

    const depositCoin = coinWithBalance({
      balance: topUpAmount,
      type: config.quoteAssetType,
    });

    const depositTarget = accountTarget(config, 'account', 'deposit_funds');
    calls.push(depositTarget);
    tx.moveCall({
      target: depositTarget,
      typeArguments: [config.quoteAssetType],
      arguments: [wrapper, auth, depositCoin, accumulatorRoot, clock],
    });
  }

  const pricerTarget = predictTarget(config, 'expiry_market', 'load_live_pricer');
  calls.push(pricerTarget);
  const pricer = tx.moveCall({
    target: pricerTarget,
    arguments: [
      market,
      protocolConfig,
      tx.object(config.oracleRegistryId),
      tx.object(config.oracle.pythFeed),
      tx.object(config.oracle.blockScholesValueStore),
      tx.object(config.oracle.blockScholesSviStore),
      clock,
    ],
  });

  const mintedOrderIds = input.quote.legs.map((_leg, index) => {
    const authTarget = accountTarget(config, 'account', 'generate_auth');
    calls.push(authTarget);
    const auth = tx.moveCall({
      target: authTarget,
      arguments: [],
    });

    const mintTarget = predictTarget(config, 'expiry_market', 'mint_exact_quantity');
    calls.push(mintTarget);
    return tx.moveCall({
      target: mintTarget,
      arguments: [
        market,
        wrapper,
        auth,
        protocolConfig,
        pricer,
        tx.pure.u64(legLowerTicks[index]),
        tx.pure.u64(legHigherTicks[index]),
        tx.pure.u64(legQuantities[index]),
        tx.pure.u64(LEVERAGE_1X),
        tx.pure.u64(mintSlippage[index].maxCost),
        tx.pure.u64(mintSlippage[index].maxProbability),
        accumulatorRoot,
        clock,
      ],
    });
  });

  calls.push(balanceTarget);
  const [balanceAfter] = tx.moveCall({
    target: balanceTarget,
    typeArguments: [config.quoteAssetType],
    arguments: [wrapper, accumulatorRoot, clock],
  });

  const noteTarget = target(config, 'product_note', 'new_dual_investment_note_verified');
  calls.push(noteTarget);
  const note = tx.moveCall({
    target: noteTarget,
    arguments: [
      tx.object(config.registryId),
      tx.pure.vector('u8', idBytes),
      tx.pure.id(input.wrapperId),
      tx.pure.id(input.quote.oracle.oracleId),
      tx.pure.u64(input.quote.oracle.expiryMs),
      tx.pure.u64(depositAmount),
      tx.pure.u64(toQuoteBaseUnits(input.quote.reserve, config.quoteAssetDecimals, 'Quote reserve')),
      balanceBefore,
      balanceAfter,
      tx.pure.u64(targetPrice),
      tx.pure.u64(floorPrice),
      tx.pure.u64(toBpsU64(input.quote.apr, 'Quote APR')),
      tx.pure.vector('u64', legStrikes),
      tx.pure.vector('u64', legQuantities),
      tx.pure.vector('u64', legCosts),
      tx.makeMoveVec({ type: 'u256', elements: mintedOrderIds }),
    ],
  });
  calls.push('transferObjects');
  tx.transferObjects([note], input.accountAddress);

  return {
    tx,
    calls,
    depositAmount,
    topUpAmount,
    legStrikes,
    legQuantities,
    legCosts,
    legLowerTicks,
    legHigherTicks,
    mintSlippage,
    targetPrice,
    floorPrice,
    productIdBytes: idBytes,
  };
}
