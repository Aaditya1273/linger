import type { AnkerProductNoteRecord } from '../sui/ankerPortfolio';

export function productNoteFixture(
  overrides: Partial<AnkerProductNoteRecord> = {},
): AnkerProductNoteRecord {
  return {
    noteId: `0x${'c'.repeat(64)}`,
    productType: 'dual-investment',
    productId: 'target-buy-5',
    owner: `0x${'a'.repeat(64)}`,
    wrapperId: `0x${'b'.repeat(64)}`,
    oracleId: `0x${'5'.repeat(64)}`,
    expiryMs: 1_000,
    principal: 5,
    principalBaseUnits: 5_000_000n,
    reserve: 4.936412,
    reserveBaseUnits: 4_936_412n,
    coupon: 0.007453,
    couponBaseUnits: 7_453n,
    targetPrice: 65_500,
    floorPrice: 64_667,
    lowerBound: 0,
    upperBound: 0,
    isBullish: false,
    usesMockCurrentDeposit: false,
    apr: 0.916,
    feeBps: 1_000,
    legs: [
      { strike: 64_667, quantity: 0.063588, quantityBaseUnits: 63_588n, cost: 0.056135, costBaseUnits: 56_135n },
    ],
    orderIds: [11n],
    status: 'open',
    redeemedPayout: 0,
    redeemedPayoutBaseUnits: 0n,
    redeemedFee: 0,
    redeemedFeeBaseUnits: 0n,
    ...overrides,
  };
}
