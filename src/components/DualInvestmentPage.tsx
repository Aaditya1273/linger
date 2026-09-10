'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildIndicativeDualInvestmentQuote,
  buildVerifiedDualInvestmentQuote,
  useDualInvestmentScan,
} from '../hooks/useDualInvestmentScan';
import { useBinanceDualInvestment } from '../hooks/useBinanceDualInvestment';
import { useMarketData } from '../hooks/useMarketData';
import { useSubscriptionFunds } from '../hooks/useSubscriptionFunds';
import { useIsMobile } from '../hooks/useIsMobile';
import { copyForLocale, DEFAULT_LOCALE, formattersForLocale, type Locale } from '../i18n';
import { minViableDualInvestmentPrincipal, suggestedMinPrincipal } from '../products/dualInvestment';
import {
  buildAutoFloorDualInvestmentInput,
  buildDualInvestmentScanInputs,
  isSubDayTenor,
} from '../products/dualInvestmentScan';
import { minQuotableTargetPrice } from '../products/dualInvestmentValidation';
import { DEFAULT_QUOTE_ENVELOPE_TTL_MS } from '../products/quoteEnvelope';
import type { DualInvestmentInput, OracleMarket, StructuredProductQuote } from '../products/types';
import { AppFooter } from './AppFooter';
import { AppHeader } from './AppHeader';
import {
  BuyLowControls,
  DEFAULT_PRINCIPAL,
  DirectionPairBar,
  ReferenceTable,
  type DualInvestmentMode,
} from './DualInvestmentQuoteSections';
import {
  DualInvestmentAdvanced,
  DualInvestmentAdvancedSheet,
  DualInvestmentConfirm,
  ReturnOverview,
} from './DualInvestmentQuoteDetail';
import { DualInvestmentMobileCommit } from './DualInvestmentMobileCommit';
import { SubscribeSuccessDialog } from './SubscribeSuccessDialog';
import type { ConfirmedSubscription } from './TargetBuyExecutionPanel';
import { Card, Dialog } from '../ui';

export { QuoteRiskSummary } from './DualInvestmentQuoteSections';

const DEFAULT_LEG_COUNT = 6;

export function DualInvestmentPage({
  initialMode = 'buy-low',
  locale = DEFAULT_LOCALE,
}: {
  initialMode?: DualInvestmentMode;
  locale?: Locale;
}) {
  const mode = initialMode;
  const copy = copyForLocale(locale);
  const format = formattersForLocale(locale);
  const [selectedOracleId, setSelectedOracleId] = useState<string | undefined>();
  const marketQuery = useMarketData(selectedOracleId);
  const market = marketQuery.data?.market;
  const productOracles = marketQuery.data?.productOracles ?? [];
  const scanEnabled = Boolean(market);
  const scanQuery = useDualInvestmentScan({
    market,
    principal: DEFAULT_PRINCIPAL,
    enabled: scanEnabled,
  });
  const liveBinanceQuery = useBinanceDualInvestment({ market, enabled: scanEnabled });
  const binanceProducts = liveBinanceQuery.data ?? [];
  const binanceStatus =
    liveBinanceQuery.isPending && !liveBinanceQuery.data
      ? 'loading'
      : liveBinanceQuery.isError
        ? 'error'
        : 'ready';

  const [principal, setPrincipal] = useState(DEFAULT_PRINCIPAL);
  const [targetPrice, setTargetPrice] = useState(0);
  const [legCount, setLegCount] = useState(DEFAULT_LEG_COUNT);
  // Amount a selection event (ladder click, tenor switch) auto-raised to — the
  // one-line notice under the Amount input. Any manual edit clears it.
  const [autoRaisedTo, setAutoRaisedTo] = useState<number | null>(null);
  // Phone: the reference ladder lives in a bottom sheet behind the ticket's
  // compare button; desktop keeps it inline above the controls.
  const [mobileLadderOpen, setMobileLadderOpen] = useState(false);
  const isMobile = useIsMobile();
  const funds = useSubscriptionFunds();

  const [verifiedQuote, setVerifiedQuote] = useState<StructuredProductQuote | null>(null);
  const [verifiedKey, setVerifiedKey] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  // Subscribe success dialog state lives at page level: the execution panel
  // unmounts and remounts with live quote churn (auto-floor drift, re-verify),
  // and any dialog state kept inside it dies on the first panel refresh.
  const [confirmedSubscription, setConfirmedSubscription] = useState<ConfirmedSubscription | null>(null);
  const verifyIdRef = useRef(0);
  const seededOracleRef = useRef<string | undefined>();

  // Seed the default Buy Low target once per oracle (nearest grid step below spot).
  const defaultTarget = useMemo(() => {
    if (!market) return 0;
    return (
      buildDualInvestmentScanInputs({ market, principal: DEFAULT_PRINCIPAL })[0]?.targetPrice ?? 0
    );
  }, [market]);

  // Selection events (ladder click, tenor switch) may land on a rung whose
  // premium floor sits above the current amount — hourly tenors routinely need
  // a few thousand dUSDC. Raise (never lower) to the floor rounded up to
  // hundreds, and leave a notice. Typed amounts and slider drags are never
  // rewritten mid-edit — the inline hint under Amount covers those instead.
  const maybeRaisePrincipal = useCallback(
    (oracle: OracleMarket, nextTargetPrice: number) => {
      try {
        const probeInput = buildAutoFloorDualInvestmentInput({
          market: oracle,
          principal: DEFAULT_PRINCIPAL,
          targetPrice: nextTargetPrice,
          targetLegCount: legCount,
        });
        const min = minViableDualInvestmentPrincipal(probeInput, oracle);
        if (min !== null && principal < min) {
          // Exactly the rounded minimum — the notice names this number as "the
          // minimum", so clamping it higher would make the notice lie.
          const raised = suggestedMinPrincipal(min);
          setPrincipal(raised);
          setAutoRaisedTo(raised);
          return;
        }
      } catch {
        // Unpriceable presets leave the amount untouched.
      }
      setAutoRaisedTo(null);
    },
    [legCount, principal],
  );

  useEffect(() => {
    const oracleId = market?.oracleId;
    if (defaultTarget > 0 && market && oracleId && seededOracleRef.current !== oracleId) {
      seededOracleRef.current = oracleId;
      setTargetPrice(defaultTarget);
      maybeRaisePrincipal(market, defaultTarget);
    }
  }, [defaultTarget, market, maybeRaisePrincipal]);

  // Lowest fillable Buy Low price — legs below it exceed Predict ask limits.
  const minTargetPrice = useMemo(
    () => (market ? minQuotableTargetPrice(market) : null),
    [market],
  );

  // Full product input (with auto floor) — null until the inputs make a valid Buy Low.
  const effectiveInput = useMemo<DualInvestmentInput | null>(() => {
    if (!market || !(principal > 0) || !(targetPrice > 0) || targetPrice >= market.spot) return null;
    if (minTargetPrice !== null && targetPrice < minTargetPrice) return null;
    return buildAutoFloorDualInvestmentInput({ market, principal, targetPrice, targetLegCount: legCount });
  }, [market, principal, targetPrice, legCount, minTargetPrice]);

  // Instant local estimate — drives the chart and headline numbers with no network round-trip.
  const estimateQuote = useMemo<StructuredProductQuote | null>(() => {
    if (!market || !effectiveInput) return null;
    try {
      return buildIndicativeDualInvestmentQuote({ market, productInput: effectiveInput });
    } catch {
      return null;
    }
  }, [market, effectiveInput]);

  // Product identity only — do NOT include live oracle feed timestamps.
  // Including spot/svi timestamps unmounted TargetBuyExecutionPanel (and its
  // success-dialog state) every market poll (~15s), including mid-wallet-sign.
  const productKey = useMemo(() => {
    if (!market || !effectiveInput) return null;
    return [
      market.oracleId,
      effectiveInput.principal,
      effectiveInput.targetPrice,
      effectiveInput.floorPrice,
      effectiveInput.targetLegCount,
    ].join(':');
  }, [market, effectiveInput]);

  // Feed version used only to schedule background re-verify; never gates mount.
  const marketTickKey = useMemo(() => {
    if (!market) return null;
    return `${market.spotTimestampMs}:${market.sviTimestampMs}`;
  }, [market]);

  const runVerify = useCallback(async (productInput: DualInvestmentInput, key: string, oracle: OracleMarket) => {
    const id = verifyIdRef.current + 1;
    verifyIdRef.current = id;
    setIsVerifying(true);
    setVerifyError(null);
    try {
      const quote = await buildVerifiedDualInvestmentQuote({ oracle, productInput });
      if (verifyIdRef.current !== id) return;
      setVerifiedQuote(quote);
      setVerifiedKey(key);
    } catch (error) {
      if (verifyIdRef.current !== id) return;
      setVerifyError(error instanceof Error ? error.message : 'Live quote failed.');
    } finally {
      if (verifyIdRef.current === id) setIsVerifying(false);
    }
  }, []);

  // Debounced verification whenever the product inputs settle on a new combination.
  useEffect(() => {
    if (!market || !effectiveInput || !productKey || verifiedKey === productKey) return undefined;
    const handle = window.setTimeout(() => {
      void runVerify(effectiveInput, productKey, market);
    }, 450);
    return () => window.clearTimeout(handle);
  }, [market, effectiveInput, productKey, verifiedKey, runVerify]);

  // Background refresh when the oracle feed moves — keeps the previous matched
  // quote mounted so the subscribe panel / success dialog is not torn down.
  useEffect(() => {
    if (!market || !effectiveInput || !productKey || !marketTickKey) return undefined;
    if (verifiedKey !== productKey) return undefined;
    const handle = window.setTimeout(() => {
      void runVerify(effectiveInput, productKey, market);
    }, 450);
    return () => window.clearTimeout(handle);
  }, [marketTickKey, market, effectiveInput, productKey, verifiedKey, runVerify]);

  // Keep the matched live quote fresh on the envelope TTL.
  useEffect(() => {
    if (!market || !effectiveInput || !productKey || verifiedKey !== productKey) return undefined;
    const handle = window.setTimeout(() => {
      void runVerify(effectiveInput, productKey, market);
    }, DEFAULT_QUOTE_ENVELOPE_TTL_MS);
    return () => window.clearTimeout(handle);
  }, [market, effectiveInput, productKey, verifiedKey, verifiedQuote, runVerify]);

  const matchedVerified = verifiedQuote && verifiedKey === productKey ? verifiedQuote : null;
  const displayQuote = matchedVerified ?? estimateQuote;
  const subscribeQuote = matchedVerified && matchedVerified.executable ? matchedVerified : null;
  const isEstimate = !matchedVerified;
  // Amount over the connected balance blocks subscribe at the input, not at
  // wallet preflight — the inline error under Amount explains the disabled CTA.
  const insufficientFunds = funds.balance !== null && principal > funds.balance;
  // Premium-floor minimum for the current ladder — computed from the input, not
  // the estimate quote: tiny amounts can floor a leg quantity to zero and kill
  // the quote entirely, and the hint must survive exactly that case.
  const minViablePrincipal = useMemo(() => {
    if (!market || !effectiveInput) return null;
    return minViableDualInvestmentPrincipal(effectiveInput, market);
  }, [market, effectiveInput]);

  // Manual edits are the user's own numbers — they retire the auto-raise notice.
  const handlePrincipalChange = useCallback((value: number) => {
    setAutoRaisedTo(null);
    setPrincipal(value);
  }, []);

  const handleTargetChange = useCallback((value: number) => {
    setAutoRaisedTo(null);
    setTargetPrice(value);
  }, []);

  // Picking a ladder row also dismisses the phone sheet — select-and-return.
  const handleSelectPreset = useCallback(
    (input: DualInvestmentInput) => {
      setTargetPrice(input.targetPrice);
      if (market) maybeRaisePrincipal(market, input.targetPrice);
      setMobileLadderOpen(false);
    },
    [market, maybeRaisePrincipal],
  );

  const handleLadderOpen = useCallback(() => {
    setMobileLadderOpen(true);
  }, []);

  // One ladder, two containers: desktop mounts it inline at the ticket's head;
  // phones present the same element inside the compare bottom sheet.
  const referenceLadder = (
    <ReferenceTable
      market={market}
      rows={scanQuery.data ?? []}
      binanceProducts={binanceProducts}
      binanceStatus={binanceStatus}
      activeTargetPrice={targetPrice}
      isFetching={marketQuery.isFetching}
      updatedAtMs={marketQuery.dataUpdatedAt || undefined}
      onSelect={handleSelectPreset}
      onRefresh={() => {
        // The ladder is derived locally from the market feed — refreshing
        // means re-pulling the feed (and its Binance benchmark), not
        // recomputing identical numbers from the same inputs.
        void marketQuery.refetch();
        void liveBinanceQuery.refetch();
      }}
      locale={locale}
    />
  );

  return (
    <main className="dual-page" id="dual-investment">
      <AppHeader activeProduct="dual-investment" locale={locale} />

      <section className="dual-hero calculation-hero di-product-hero">
        <div>
          <h1>{copy.dualInvestment.title}</h1>
          <p>{copy.dualInvestment.subtitle}</p>
        </div>
        <div className="di-hero-ticker">
          <span className="di-hero-label">
            {copy.dualInvestment.btcPrice}
            <span className="di-live-flag">
              <span className="di-live-dot" aria-hidden="true" />
              {copy.common.live}
            </span>
          </span>
          <strong>{market ? format.usd(market.spot) : '--'}</strong>
        </div>
      </section>

      <DirectionPairBar
        mode={mode}
        market={market}
        productOracles={productOracles}
        onSelectOracle={setSelectedOracleId}
        locale={locale}
      />

      <div className="di-terminal">
        {/* Phones present the payoff overview inside the confirm sheet instead.
            Skipping the inline mount (not just hiding it) matters: two mounted
            ReturnOverviews duplicate SVG gradient ids, and url(#…) resolves to
            the display:none copy — the sheet's chart would lose its stroke. */}
        {!isMobile ? (
          <div className="di-terminal-chart">
            {displayQuote && effectiveInput ? (
              <ReturnOverview quote={displayQuote} productInput={effectiveInput} estimated={isEstimate} locale={locale} />
            ) : (
              <Card as="article" className="return-overview-panel is-empty">
                <div className="return-overview-heading">
                  <h3>
                    {market
                      ? copy.dualInvestment.returnOverviewTitle(format.shortDateTime(market.expiryMs))
                      : copy.dualInvestment.returnOverviewTitleFallback}
                  </h3>
                </div>
                <p className="di-overview-empty">{copy.dualInvestment.emptyOverview}</p>
              </Card>
            )}
          </div>
        ) : null}

        {/* Order ticket: reference ladder → inputs → settle + subscribe CTA.
            Look up price first, then size the order, then commit. Phones move
            the ladder into a bottom sheet opened from the ticket's compare
            button — same component, different container. */}
        <div className="di-terminal-side">
          {isMobile ? (
            <Dialog
              open={mobileLadderOpen}
              onClose={() => setMobileLadderOpen(false)}
              ariaLabel={
                market && isSubDayTenor(market.expiryMs)
                  ? copy.dualInvestment.priceYieldReference
                  : copy.dualInvestment.priceAprReference
              }
              closeLabel={copy.common.close}
              className="di-ladder-sheet"
            >
              {referenceLadder}
            </Dialog>
          ) : (
            referenceLadder
          )}
          <BuyLowControls
            market={market}
            principal={principal}
            targetPrice={targetPrice}
            minTargetPrice={minTargetPrice}
            maxTargetPrice={defaultTarget > 0 ? defaultTarget : null}
            availableBalance={funds.balance}
            minViablePrincipal={minViablePrincipal}
            autoRaisedAmount={autoRaisedTo}
            ladderRows={scanQuery.data ?? []}
            onLadderOpen={handleLadderOpen}
            onPrincipalChange={handlePrincipalChange}
            onTargetChange={handleTargetChange}
            locale={locale}
          />
          {/* One execution panel at a time: desktop confirms inline at the
              ticket's foot; phones commit through the floating summary dock
              and its confirm sheet instead. */}
          {displayQuote && effectiveInput ? (
            isMobile ? (
              <DualInvestmentMobileCommit
                quote={displayQuote}
                productInput={effectiveInput}
                subscribeQuote={subscribeQuote}
                isVerifying={isVerifying}
                insufficientFunds={insufficientFunds}
                availableBalance={funds.balance}
                onPrincipalChange={handlePrincipalChange}
                onSubscribeSuccess={setConfirmedSubscription}
                error={verifyError}
                estimated={isEstimate}
                locale={locale}
              />
            ) : (
              <DualInvestmentConfirm
                quote={displayQuote}
                productInput={effectiveInput}
                subscribeQuote={subscribeQuote}
                isVerifying={isVerifying}
                insufficientFunds={insufficientFunds}
                onSubscribeSuccess={setConfirmedSubscription}
                error={verifyError}
                locale={locale}
              />
            )
          ) : null}
        </div>
      </div>

      {/* Advanced details: same content, two containers — desktop discloses
          inline, phones open a bottom sheet from a list-row trigger. */}
      {displayQuote && effectiveInput ? (
        isMobile ? (
          <DualInvestmentAdvancedSheet
            quote={displayQuote}
            legCount={legCount}
            onLegCountChange={setLegCount}
            locale={locale}
          />
        ) : (
          <DualInvestmentAdvanced
            quote={displayQuote}
            legCount={legCount}
            onLegCountChange={setLegCount}
            locale={locale}
          />
        )
      ) : null}

      {confirmedSubscription ? (
        <SubscribeSuccessDialog
          quote={confirmedSubscription.quote}
          digest={confirmedSubscription.digest}
          locale={locale}
          onClose={() => setConfirmedSubscription(null)}
        />
      ) : null}

      <AppFooter locale={locale} />
    </main>
  );
}
