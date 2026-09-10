import type { ScenarioOutcome, StructuredProductQuote } from './types';

function defaultSettlementPrices(quote: StructuredProductQuote): number[] {
  const spot = quote.oracle.spot;
  const spotScenarios = [
    Math.round(spot * 0.8),
    Math.round(spot * 0.9),
    Math.round(spot),
    Math.round(spot * 1.1),
    Math.round(spot * 1.2),
  ];
  const boundaryScenarios = quote.legs.flatMap((leg) => {
    const boundaries =
      leg.instrumentType === 'range'
        ? [leg.lowerStrike, leg.higherStrike]
        : [leg.strike];
    return boundaries.flatMap((boundary) =>
      boundary === undefined ? [] : [Math.round(boundary - 1), Math.round(boundary), Math.round(boundary + 1)],
    );
  });
  const productBoundaries = [quote.floorPrice, quote.targetPrice]
    .filter((price): price is number => price !== undefined)
    .map((price) => Math.round(price));

  return [...new Set([...spotScenarios, ...boundaryScenarios, ...productBoundaries].filter((price) => price > 0))].sort(
    (left, right) => left - right,
  );
}

export function simulatePayoff(
  quote: StructuredProductQuote,
  settlementPrices = defaultSettlementPrices(quote),
): ScenarioOutcome[] {
  return settlementPrices.map((settlementPrice) => {
    const realized = quote.legs.filter((leg) => {
      if (leg.instrumentType === 'binary-up') {
        return leg.strike !== undefined && settlementPrice > leg.strike;
      }
      if (leg.instrumentType === 'binary-down') {
        return leg.strike !== undefined && settlementPrice <= leg.strike;
      }
      if (leg.instrumentType === 'range') {
        return (
          leg.lowerStrike !== undefined &&
          leg.higherStrike !== undefined &&
          settlementPrice > leg.lowerStrike &&
          settlementPrice <= leg.higherStrike
        );
      }
      return false;
    });

    const payout = realized.reduce((sum, leg) => sum + leg.quantity, 0);
    const finalUsdc =
      quote.productType === 'dual-investment'
        ? quote.reserve + quote.coupon + payout
        : quote.reserve + Math.max(0, quote.coupon) + payout;

    return {
      settlementPrice,
      label: `${settlementPrice.toLocaleString('en-US')} BTC`,
      finalUsdc,
      btcEquivalent: quote.productType === 'dual-investment' ? finalUsdc / settlementPrice : undefined,
      coupon: quote.coupon,
      realizedLegIds: realized.map((leg) => leg.id),
      expiredLegIds: quote.legs.filter((leg) => !realized.includes(leg)).map((leg) => leg.id),
    };
  });
}
