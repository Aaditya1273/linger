export type ProductType = 'dual-investment';

export type PrincipalAsset = 'dUSDC' | 'DBTC' | 'USDsui';

export type LegInstrumentType = 'binary-up' | 'binary-down' | 'range';

export interface OracleMarket {
  predictId: string;
  oracleId: string;
  underlyingAsset: 'BTC';
  expiryMs: number;
  minStrike: number;
  tickSize: number;
  /** Admission grid step for Turbo target selection (typically $1). */
  admissionTickSize?: number;
  status: 'created' | 'active' | 'settled' | string;
  spot: number;
  forward: number;
  spotTimestampMs: number;
  sviTimestampMs: number;
  /**
   * Block Scholes spot/forward source timestamp (min of the pair) — the inputs the
   * on-chain pricer holds to a 10s freshness window at mint. `null` when the feed
   * objects are missing on-chain; absent on payloads predating this field.
   */
  bsPriceTimestampMs?: number | null;
  /** Block Scholes SVI source timestamp (60s on-chain window). Same null/absent semantics. */
  bsSviTimestampMs?: number | null;
  serverLagSeconds: number;
  svi?: SviParameters;
  predictPricing?: PredictPricingState;
}

export interface SviParameters {
  a: number;
  b: number;
  rho: number;
  m: number;
  sigma: number;
}

export interface PredictPricingState {
  /** @deprecated Prefer baseFee — legacy 4-16 spread name. */
  baseSpread: number;
  /** @deprecated Prefer minFee — legacy 4-16 spread name. */
  minSpread: number;
  utilizationMultiplier: number;
  minAskPrice: number;
  maxAskPrice: number;
  vaultBalance: number;
  vaultTotalMtm: number;
  vaultUtilization: number;
  /** 6-24 StrikeExposureConfig base trading fee (probability units). */
  baseFee?: number;
  /** 6-24 minimum trading fee floor. */
  minFee?: number;
  /** Congestion surcharge per unit; browse quotes default to 0 (EWMA disabled / not outlier). */
  ewmaPenaltyRate?: number;
  expiryFeeWindowMs?: number;
  expiryFeeMaxMultiplier?: number;
}

export interface LegIntent {
  id: string;
  instrumentType: LegInstrumentType;
  oracleId: string;
  expiryMs: number;
  strike?: number;
  lowerStrike?: number;
  higherStrike?: number;
  isUp?: boolean;
  quantity: number;
  description: string;
}

export interface LegQuote extends LegIntent {
  askPrice: number;
  askCost: number;
  redeemPreview: number;
  quoteTimestampMs: number;
  executable: boolean;
  error?: string;
}

export interface ScenarioOutcome {
  settlementPrice: number;
  label: string;
  finalUsdc: number;
  btcEquivalent?: number;
  coupon: number;
  apr?: number;
  realizedLegCount?: number;
  realizedLegIds: string[];
  expiredLegIds: string[];
}

export interface StructuredProductQuote {
  id: string;
  productType: ProductType;
  title: string;
  principal: number;
  principalAsset?: PrincipalAsset;
  quoteAsset?: 'dUSDC' | 'USDsui';
  oracle: OracleMarket;
  legs: LegQuote[];
  totalLegCost: number;
  reserve: number;
  coupon: number;
  targetPrice?: number;
  floorPrice?: number;
  apr: number;
  executable: boolean;
  warning?: string;
  /** Stable marker for warnings the UI localizes (the `warning` string stays English). */
  warningCode?: 'oracle-paused' | 'premium-floor';
  /** `premium-floor` warnings only: smallest principal (dUSDC) whose thinnest
      leg clears Predict's per-mint premium minimum. Absent when no finite
      principal helps (a leg prices at ~0 — the target is too deep). */
  minViablePrincipal?: number;
  scenarios: ScenarioOutcome[];
}

export interface DualInvestmentInput {
  principal: number;
  targetPrice: number;
  floorPrice: number;
  stepSize?: number;
  targetLegCount?: number;
}
