'use client';

import { useCurrentAccount, useCurrentClient, useCurrentWallet, useDAppKit } from '@mysten/dapp-kit-react';
import { isEnokiWallet } from '@mysten/enoki';
import { useQueryClient } from '@tanstack/react-query';
import { WalletCards } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState, type ReactNode } from 'react';
import {
  createSubscribeQuoteEnvelope,
  prepareSubscribeDualInvestmentForSigning,
  refreshDualInvestmentQuoteForSigning,
  selectUnallocatedPredictManager,
} from '../application/subscribeDualInvestment';
import { createDefaultQuoteProvider } from '../deepbook/quoteProvider';
import { ORACLE_PAUSED_WARNING } from '../products/oracleHealth';
import { useAccountWrapperBalance } from '../hooks/useAccountWrapper';
import { useAnkerPortfolio } from '../hooks/useAnkerPortfolio';
import { usePredictManagers } from '../hooks/usePredictManagers';
import { copyForLocale, DEFAULT_LOCALE, localizedPath, type Locale } from '../i18n';
import type { DualInvestmentInput, StructuredProductQuote } from '../products/types';
import { buildCreateAccountWrapperTransaction } from '../sui/accountTransactions';
import { recordSubscriptionDigest } from '../sui/subscriptionDigestStore';
import { isSponsorshipEnabled } from '../sui/sponsoredExecution';
import { executeWalletTransaction } from '../sui/transactionExecution';
import { Button } from '../ui';

/** Functional connect CTA for the disconnected state — opens the wallet modal. */
const WalletConnectButton = dynamic(
  () => import('./WalletConnectButton').then((module) => module.WalletConnectButton),
  { ssr: false },
);

/**
 * Snapshot of a confirmed subscribe, reported upward so the success dialog can
 * render above this panel: live re-verify can unmount/remount the panel at any
 * moment (auto-floor drift, quote refresh), which would wipe dialog state kept
 * here — the dialog appeared and then vanished on the next panel refresh.
 */
export interface ConfirmedSubscription {
  quote: StructuredProductQuote;
  digest: string;
}

interface TargetBuyExecutionPanelViewProps {
  hasAccount: boolean;
  hasManager: boolean;
  isQuoteExecutable: boolean;
  /** Amount exceeds the connected balance — the Amount input shows the error. */
  insufficientFunds?: boolean;
  quoteWarning?: string;
  isLoadingManagers: boolean;
  isPending: boolean;
  managerId?: string;
  error?: string | null;
  digest?: string | null;
  /** True once the digest belongs to a wait-confirmed subscribe (vs. account creation). */
  subscribeConfirmed?: boolean;
  simulatedCostLabel?: string | null;
  /** Functional wallet-connect control for the disconnected state (falls back to a disabled button). */
  connectAction?: ReactNode;
  locale?: Locale;
  onCreateManager: () => void;
  onSubscribe: () => void;
}

function shortId(value: string) {
  return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

export type TargetBuyExecutionState =
  | 'connect-wallet'
  | 'checking-manager'
  | 'manager-required'
  | 'ready'
  | 'quote-expired'
  | 'awaiting-signature'
  | 'transaction-submitted'
  | 'subscribe-confirmed'
  | 'transaction-failed';

export function targetBuyExecutionViewModel({
  hasAccount,
  hasManager,
  isLoadingManagers,
  isPending,
  managerId,
  error,
  digest,
  subscribeConfirmed,
  locale = DEFAULT_LOCALE,
}: Pick<
  TargetBuyExecutionPanelViewProps,
  | 'hasAccount'
  | 'hasManager'
  | 'isLoadingManagers'
  | 'isPending'
  | 'managerId'
  | 'error'
  | 'digest'
  | 'subscribeConfirmed'
  | 'locale'
>) {
  const copy = copyForLocale(locale);
  if (!hasAccount) {
    return { state: 'connect-wallet' as const, status: copy.execution.status.connectWallet };
  }
  if (isPending) {
    return { state: 'awaiting-signature' as const, status: copy.execution.status.awaitingSignature };
  }
  if (error) {
    if (error.startsWith('Quote expired')) {
      return { state: 'quote-expired' as const, status: copy.execution.status.quoteExpired };
    }
    return { state: 'transaction-failed' as const, status: copy.execution.status.transactionFailed };
  }
  if (digest && subscribeConfirmed) {
    return { state: 'subscribe-confirmed' as const, status: copy.execution.status.subscribeConfirmed };
  }
  if (digest) {
    return { state: 'transaction-submitted' as const, status: copy.execution.status.submitted };
  }
  if (isLoadingManagers) {
    return { state: 'checking-manager' as const, status: copy.execution.status.checkingManager };
  }
  if (!hasManager) {
    return {
      state: 'manager-required' as const,
      status: copy.execution.status.managerRequired,
    };
  }
  return {
    state: 'ready' as const,
    status: copy.execution.status.ready(managerId ? shortId(managerId) : ''),
  };
}

export function TargetBuyExecutionPanelView({
  hasAccount,
  hasManager,
  isQuoteExecutable,
  insufficientFunds = false,
  quoteWarning,
  isLoadingManagers,
  isPending,
  managerId,
  error,
  digest,
  subscribeConfirmed,
  simulatedCostLabel,
  connectAction,
  locale = DEFAULT_LOCALE,
  onCreateManager,
  onSubscribe,
}: TargetBuyExecutionPanelViewProps) {
  const copy = copyForLocale(locale);
  const execution = targetBuyExecutionViewModel({
    hasAccount,
    hasManager,
    isLoadingManagers,
    isPending,
    managerId,
    error,
    digest,
    subscribeConfirmed,
    locale,
  });

  if (!hasAccount) {
    return (
      <div className="ticket-execution">
        {connectAction ? (
          <div className="ticket-connect">{connectAction}</div>
        ) : (
          <Button variant="primary" disabled>
            {copy.common.connectWallet}
          </Button>
        )}
      </div>
    );
  }

  // Single state-driven CTA: the one-time setup is a labelled first click
  // ("1 of 2"), not a standing checklist — progress lives in the button.
  const needsSetup = !hasManager;
  const buttonLabel = isPending
    ? copy.execution.waitingForWallet
    : isLoadingManagers
      ? copy.execution.checking
      : needsSetup
        ? copy.execution.setupStep
        : copy.execution.subscribeBuyLow;
  // Setup (create manager) never spends the amount, so it ignores the balance;
  // subscribing over-balance would only fail later at wallet preflight.
  const canAct = !isPending && !isLoadingManagers && (needsSetup || (isQuoteExecutable && !insufficientFunds));
  // Setup is a one-time wallet step — keep a short note so the "1 of 2" CTA is clear.
  const note =
    !isPending && needsSetup && !isLoadingManagers ? copy.execution.createContainerHelp : null;
  const showStatus =
    execution.state === 'awaiting-signature' ||
    execution.state === 'quote-expired' ||
    execution.state === 'transaction-failed' ||
    execution.state === 'transaction-submitted' ||
    execution.state === 'subscribe-confirmed';

  return (
    <div className="ticket-execution">
      <Button variant="primary" disabled={!canAct} onClick={needsSetup ? onCreateManager : onSubscribe}>
        {buttonLabel}
      </Button>
      {note ? <p className="ticket-execution-note">{note}</p> : null}
      {showStatus ? (
        <div className="execution-status">
          <WalletCards size={16} />
          <span>{execution.status}</span>
        </div>
      ) : null}
      {simulatedCostLabel ? <p className="execution-message">{simulatedCostLabel}</p> : null}
      {quoteWarning && !isQuoteExecutable ? <p className="execution-error">{quoteWarning}</p> : null}
      {digest ? (
        <p className={subscribeConfirmed ? 'execution-message execution-success' : 'execution-message'}>
          {subscribeConfirmed ? copy.execution.subscribeConfirmedPrefix : copy.execution.transactionSubmittedPrefix}{' '}
          {shortId(digest)}
          <a href={localizedPath(locale, '/app/portfolio')}>{copy.execution.viewPortfolio}</a>
        </p>
      ) : null}
      {error && execution.state !== 'quote-expired' ? <p className="execution-error">{error}</p> : null}
    </div>
  );
}

export function TargetBuyExecutionPanel({
  quote,
  productInput,
  insufficientFunds = false,
  onSubscribeSuccess,
  locale = DEFAULT_LOCALE,
}: {
  quote: StructuredProductQuote;
  productInput: DualInvestmentInput;
  /** Amount exceeds the connected balance — disables subscribe (input shows why). */
  insufficientFunds?: boolean;
  onSubscribeSuccess: (confirmation: ConfirmedSubscription) => void;
  locale?: Locale;
}) {
  const copy = copyForLocale(locale);
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const currentWallet = useCurrentWallet();
  const dAppKit = useDAppKit();
  const queryClient = useQueryClient();
  const managersQuery = usePredictManagers();
  const portfolioQuery = useAnkerPortfolio();
  const manager = selectUnallocatedPredictManager(managersQuery.data, portfolioQuery.data, account?.address);
  const balanceQuery = useAccountWrapperBalance(manager?.managerId);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [digest, setDigest] = useState<string | null>(null);
  const [subscribeConfirmed, setSubscribeConfirmed] = useState(false);
  const [simulatedCostLabel, setSimulatedCostLabel] = useState<string | null>(null);

  async function runTransaction(action: () => Promise<string>) {
    setIsPending(true);
    setError(null);
    setDigest(null);
    setSubscribeConfirmed(false);
    try {
      const nextDigest = await action();
      setDigest(nextDigest);
      await queryClient.invalidateQueries({ queryKey: ['account-wrapper', account?.address] });
      await queryClient.invalidateQueries({ queryKey: ['account-wrapper-balance'] });
      await queryClient.invalidateQueries({ queryKey: ['anker-portfolio', account?.address] });
    } catch (nextError) {
      const message =
        nextError instanceof Error ? nextError.message : copy.execution.errors.transactionFailed;
      // The quote refresh throws the products-layer English warning if the feed
      // pauses between click and simulation — localize that standing state.
      setError(message === ORACLE_PAUSED_WARNING ? copy.dualInvestment.oraclePaused : message);
    } finally {
      setIsPending(false);
    }
  }

  /** zkLogin accounts own no SUI, so Enoki sessions execute gas-sponsored. */
  async function shouldSponsor() {
    return Boolean(currentWallet && isEnokiWallet(currentWallet)) && (await isSponsorshipEnabled());
  }

  function handleCreateManager() {
    if (!account) return;
    void runTransaction(async () => {
      const plan = buildCreateAccountWrapperTransaction();
      const nextDigest = await executeWalletTransaction({
        wallet: dAppKit,
        client,
        transaction: plan.tx,
        sender: account.address,
        sponsored: await shouldSponsor(),
      });
      await client.waitForTransaction({ digest: nextDigest });
      await managersQuery.refetch();
      return nextDigest;
    });
  }

  function handleSubscribe() {
    if (!account || !manager) return;
    void runTransaction(async () => {
      setSimulatedCostLabel(null);
      const quoteEnvelope = createSubscribeQuoteEnvelope(quote);
      const refreshedQuote = await refreshDualInvestmentQuoteForSigning({
        productInput,
        quote,
        quoteEnvelope,
        // Must pass the market so SVI browse pricing is used — a market
        // without an SVI surface cannot produce a signable quote.
        quoteProvider: createDefaultQuoteProvider(quote.oracle),
      });
      // Simulate first (readable abort, no wallet). Rebuild mint caps from OrderMinted costs.
      const prepared = await prepareSubscribeDualInvestmentForSigning({
        accountAddress: account.address,
        managers: managersQuery.data,
        notes: portfolioQuery.data,
        productInput,
        quote: refreshedQuote,
        quoteEnvelope,
        wrapperBalanceBaseUnits: balanceQuery.data?.dusdcBalanceBaseUnits ?? 0n,
        client,
      });
      const simulatedUsdc = Number(prepared.simulatedTotalCostBaseUnits) / 1_000_000;
      setSimulatedCostLabel(`Simulated mint cost: ${simulatedUsdc.toFixed(2)} dUSDC`);
      const nextDigest = await executeWalletTransaction({
        wallet: dAppKit,
        client,
        transaction: prepared.transactionPlan.tx,
        sender: account.address,
        sponsored: await shouldSponsor(),
      });
      await client.waitForTransaction({ digest: nextDigest });
      recordSubscriptionDigest({
        owner: account.address,
        quoteHash: prepared.quoteEnvelope.productHash,
        digest: nextDigest,
      });
      setSubscribeConfirmed(true);
      onSubscribeSuccess({ quote, digest: nextDigest });
      return nextDigest;
    });
  }

  return (
    <TargetBuyExecutionPanelView
      hasAccount={Boolean(account)}
      hasManager={Boolean(manager)}
      isQuoteExecutable={quote.executable}
      insufficientFunds={insufficientFunds}
      quoteWarning={quote.warningCode === 'oracle-paused' ? copy.dualInvestment.oraclePaused : quote.warning}
      isLoadingManagers={(managersQuery.isPending || portfolioQuery.isPending) && Boolean(account)}
      isPending={isPending}
      managerId={manager?.managerId}
      error={error}
      digest={digest}
      subscribeConfirmed={subscribeConfirmed}
      simulatedCostLabel={simulatedCostLabel}
      connectAction={
        <WalletConnectButton locale={locale} variant="primary">
          {copy.common.connectWallet}
        </WalletConnectButton>
      }
      locale={locale}
      onCreateManager={handleCreateManager}
      onSubscribe={handleSubscribe}
    />
  );
}
