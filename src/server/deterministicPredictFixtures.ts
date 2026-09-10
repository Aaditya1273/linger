import { DEEPBOOK_PREDICT } from '../config/deepbook';
import { dayScaleFixtureMarkets, dayScaleMarketSnapshot } from '../deepbook/dayScaleFixtures';
import { expiryMarketToListItem } from '../deepbook/predictServer';
import type { CuratedOracleListItem, CuratedOracleMarketResponse } from './curatedOracles';

const HOUR_MS = 60 * 60_000;

function fixtureNowMs() {
  return Date.now();
}

function turboMarketId(index: number) {
  return `0xb46fdd7aee8b5b729358a254a74ec4eb59c2a07ca8878cc77df09b843bae6c3${index}`;
}

function deterministicMarketRow(nowMs: number, index: number) {
  const expiry = nowMs + (index + 1) * HOUR_MS;
  return {
    expiry_market_id: turboMarketId(index),
    expiry,
    tick_size: DEEPBOOK_PREDICT.turboCadence.tickSize,
    admission_tick_size: DEEPBOOK_PREDICT.turboCadence.admissionTickSize,
    max_expiry_allocation: DEEPBOOK_PREDICT.turboCadence.maxExpiryAllocation,
    initial_expiry_cash: DEEPBOOK_PREDICT.turboCadence.initialExpiryCash,
    package: DEEPBOOK_PREDICT.packageId,
    pool_vault_id: DEEPBOOK_PREDICT.poolVaultId,
    propbook_underlying_id: DEEPBOOK_PREDICT.oracle.propbookUnderlyingId,
    base_fee: '20000000',
    min_fee: '5000000',
    min_entry_probability: '10000000',
    max_entry_probability: '990000000',
    checkpoint_timestamp_ms: nowMs,
    kind: 'market_created',
  };
}

function deterministicOracleList(nowMs = fixtureNowMs()) {
  return [0, 1, 2].map((index) => {
    const market = deterministicMarketRow(nowMs, index);
    return {
      predict_id: DEEPBOOK_PREDICT.poolVaultId,
      oracle_id: market.expiry_market_id,
      underlying_asset: 'BTC',
      expiry: market.expiry,
      min_strike: Number(DEEPBOOK_PREDICT.turboCadence.admissionTickSize) / 1_000_000_000,
      tick_size: Number(DEEPBOOK_PREDICT.turboCadence.tickSize) / 1_000_000_000,
      admission_tick_size: Number(DEEPBOOK_PREDICT.turboCadence.admissionTickSize) / 1_000_000_000,
      status: 'active',
      cadence: '1h' as const,
      group: 'hourly' as const,
    };
  });
}

const DEMO_BINANCE_APR_BY_STRIKE: Array<[number, number]> = [
  [61_000, 1.8366],
  [60_500, 1.2336],
  [60_000, 0.7866],
  [59_500, 0.5679],
  [59_000, 0.4137],
  [58_500, 0.3216],
  [58_000, 0.2506],
  [57_500, 0.1904],
];
const NEXT_DAY_APR_RATIO = 0.6;

export function deterministicBinanceDualInvestmentProducts(nowMs = fixtureNowMs()) {
  return [0, 1].flatMap((dayIndex) =>
    DEMO_BINANCE_APR_BY_STRIKE.map(([strikePrice, apr]) => ({
      id: `demo-binance-${dayIndex}-${strikePrice}`,
      investmentAsset: 'USDC',
      targetAsset: 'BTC',
      strikePrice,
      settleTimeMs: nowMs + (dayIndex + 1) * 24 * HOUR_MS,
      apr: dayIndex === 0 ? apr : Number((apr * NEXT_DAY_APR_RATIO).toFixed(4)),
      durationDays: dayIndex + 1,
      canPurchase: true,
    })),
  );
}

/** E2E day rows: invented fixtures, allowed only in deterministic test runs. */
function deterministicDayRows(nowMs: number): CuratedOracleListItem[] {
  return dayScaleFixtureMarkets(nowMs).map((market) => ({
    ...expiryMarketToListItem(market, 'day'),
    stateReady: true,
    quoteReady: true,
    productReady: true,
    timeToExpiryMs: market.expiryMs - nowMs,
    market: dayScaleMarketSnapshot({ nowMs, expiryMarketId: market.expiryMarketId }),
  }));
}

export function deterministicCuratedBtcOracleResponse(nowMs = fixtureNowMs()): CuratedOracleMarketResponse {
  const hourlyRows = deterministicOracleList(nowMs).map(
    (oracle) =>
      ({
        ...oracle,
        stateReady: true,
        quoteReady: true,
        productReady: true,
        timeToExpiryMs: oracle.expiry - nowMs,
      }) as CuratedOracleListItem,
  );

  return {
    generatedAt: nowMs,
    oracles: [...deterministicDayRows(nowMs), ...hourlyRows],
  };
}

