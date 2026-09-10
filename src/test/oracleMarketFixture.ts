import { fromChainPrice } from '../products/units';
import type { OracleMarket } from '../products/types';
import oracleFixture from './fixtures/oracleState.json';

/** Builds an OracleMarket from the checked-in SVI fixture for pricing unit tests. */
export function oracleMarketFromFixture(
  fixture: typeof oracleFixture = oracleFixture,
  serverLagSeconds = 1,
): OracleMarket {
  const svi = fixture.latest_svi;
  return {
    predictId: fixture.oracle.predict_id,
    oracleId: fixture.oracle.oracle_id,
    underlyingAsset: 'BTC',
    expiryMs: fixture.oracle.expiry,
    minStrike: fromChainPrice(fixture.oracle.min_strike),
    tickSize: fromChainPrice(fixture.oracle.tick_size),
    status: fixture.oracle.status,
    spot: fromChainPrice(fixture.latest_price.spot),
    forward: fromChainPrice(fixture.latest_price.forward),
    spotTimestampMs: fixture.latest_price.onchain_timestamp,
    sviTimestampMs: svi.onchain_timestamp,
    serverLagSeconds,
    svi: {
      a: fromChainPrice(svi.a),
      b: fromChainPrice(svi.b),
      rho: fromChainPrice(svi.rho) * (svi.rho_negative ? -1 : 1),
      m: fromChainPrice(svi.m) * (svi.m_negative ? -1 : 1),
      sigma: fromChainPrice(svi.sigma),
    },
  };
}
