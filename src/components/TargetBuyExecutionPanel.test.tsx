import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TargetBuyExecutionPanelView } from './TargetBuyExecutionPanel';

vi.mock('lucide-react', () => ({
  WalletCards: () => <span data-testid="wallet-icon" />,
}));

vi.mock('next/dynamic', () => ({
  default: () => () => <button className="wallet-loading">Connect Wallet</button>,
}));

describe('TargetBuyExecutionPanelView', () => {
  it('asks for wallet connection before subscription actions', () => {
    render(
      <TargetBuyExecutionPanelView
        hasAccount={false}
        hasManager={false}
        isQuoteExecutable={true}
        isLoadingManagers={false}
        isPending={false}
        onCreateManager={() => undefined}
        onSubscribe={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'Connect Wallet' })).toBeVisible();
    expect(screen.queryByText('Connect wallet to subscribe')).not.toBeInTheDocument();
    // No subscribe or setup actions leak into the disconnected state.
    expect(screen.queryByRole('button', { name: 'Subscribe Buy Low' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Set up wallet/ })).not.toBeInTheDocument();
  });

  it('renders the provided connect action instead of the fallback button', () => {
    render(
      <TargetBuyExecutionPanelView
        hasAccount={false}
        hasManager={false}
        isQuoteExecutable={true}
        isLoadingManagers={false}
        isPending={false}
        connectAction={<button type="button">wallet-modal-trigger</button>}
        onCreateManager={() => undefined}
        onSubscribe={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'wallet-modal-trigger' })).toBeEnabled();
  });

  it('labels the CTA as a one-time setup step when no manager is available', () => {
    const onCreateManager = vi.fn();
    render(
      <TargetBuyExecutionPanelView
        hasAccount
        hasManager={false}
        isQuoteExecutable={true}
        isLoadingManagers={false}
        isPending={false}
        onCreateManager={onCreateManager}
        onSubscribe={() => undefined}
      />,
    );

    const setup = screen.getByRole('button', { name: 'Set up wallet · 1 of 2' });
    expect(setup).toBeEnabled();
    expect(
      screen.getByText('A single on-chain setup for your wallet — done once, then every subscription is one confirm.'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Subscribe Buy Low' })).not.toBeInTheDocument();

    setup.click();
    expect(onCreateManager).toHaveBeenCalledTimes(1);
  });

  it('enables subscribe when wallet, manager, and executable quote are ready', () => {
    render(
      <TargetBuyExecutionPanelView
        hasAccount
        hasManager
        isQuoteExecutable={true}
        isLoadingManagers={false}
        isPending={false}
        managerId="0xabc"
        onCreateManager={() => undefined}
        onSubscribe={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'Subscribe Buy Low' })).toBeEnabled();
    // Ready-to-subscribe is a bare CTA — no extra help line under the button.
    expect(screen.queryByText('Confirm in your wallet to lock in your reward.')).not.toBeInTheDocument();
  });

  it('shows the quote warning when the wallet is ready but the quote is not executable', () => {
    render(
      <TargetBuyExecutionPanelView
        hasAccount
        hasManager
        isQuoteExecutable={false}
        quoteWarning="Ask price 1.0010 is outside Predict mint bounds 0.01-0.99."
        isLoadingManagers={false}
        isPending={false}
        managerId="0xabc"
        onCreateManager={() => undefined}
        onSubscribe={() => undefined}
      />,
    );

    expect(screen.getByText('Ask price 1.0010 is outside Predict mint bounds 0.01-0.99.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Subscribe Buy Low' })).toBeDisabled();
  });

  it('disables subscribe while the amount exceeds the connected balance', () => {
    render(
      <TargetBuyExecutionPanelView
        hasAccount
        hasManager
        isQuoteExecutable={true}
        insufficientFunds
        isLoadingManagers={false}
        isPending={false}
        managerId="0xabc"
        onCreateManager={() => undefined}
        onSubscribe={() => undefined}
      />,
    );

    // The Amount input owns the error message; the CTA just refuses to fire.
    expect(screen.getByRole('button', { name: 'Subscribe Buy Low' })).toBeDisabled();
    expect(screen.queryByText('Confirm in your wallet to lock in your reward.')).not.toBeInTheDocument();
  });

  it('links to the portfolio after a subscribe transaction is submitted', () => {
    render(
      <TargetBuyExecutionPanelView
        hasAccount
        hasManager
        isQuoteExecutable={true}
        isLoadingManagers={false}
        isPending={false}
        managerId="0xabc"
        digest="0xdigest"
        onCreateManager={() => undefined}
        onSubscribe={() => undefined}
      />,
    );

    expect(screen.getByText('Transaction submitted: 0xdigest')).toBeVisible();
    expect(screen.getByRole('link', { name: 'View Portfolio' })).toHaveAttribute('href', '/en/app/portfolio');
  });

  it('renders execution copy and links in Chinese', () => {
    render(
      <TargetBuyExecutionPanelView
        hasAccount
        hasManager
        isQuoteExecutable={true}
        isLoadingManagers={false}
        isPending={false}
        managerId="0xabc"
        digest="0xdigest"
        locale="zh-CN"
        onCreateManager={() => undefined}
        onSubscribe={() => undefined}
      />,
    );

    expect(screen.getByText('交易已提交。你可以在持仓中跟踪。')).toBeVisible();
    expect(screen.getByRole('link', { name: '查看持仓' })).toHaveAttribute('href', '/zh-CN/app/portfolio');
  });

  it('surfaces the awaiting-signature execution state while a wallet transaction is pending', () => {
    render(
      <TargetBuyExecutionPanelView
        hasAccount
        hasManager
        isQuoteExecutable={true}
        isLoadingManagers={false}
        isPending
        managerId="0xabc"
        onCreateManager={() => undefined}
        onSubscribe={() => undefined}
      />,
    );

    expect(screen.getByText('Awaiting wallet signature.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Waiting for wallet...' })).toBeDisabled();
  });

  it('surfaces the transaction-failed execution state when execution returns an error', () => {
    render(
      <TargetBuyExecutionPanelView
        hasAccount
        hasManager
        isQuoteExecutable={true}
        isLoadingManagers={false}
        isPending={false}
        managerId="0xabc"
        error="Preflight failed: MoveAbort in predict::mint"
        onCreateManager={() => undefined}
        onSubscribe={() => undefined}
      />,
    );

    expect(screen.getByText('Transaction failed. Review the error and retry.')).toBeVisible();
    expect(screen.getByText('Preflight failed: MoveAbort in predict::mint')).toBeVisible();
  });

  it('surfaces the quote-expired execution state separately from transaction failures', () => {
    const { container } = render(
      <TargetBuyExecutionPanelView
        hasAccount
        hasManager
        isQuoteExecutable={true}
        isLoadingManagers={false}
        isPending={false}
        managerId="0xabc"
        error="Quote expired. Refresh pricing before signing."
        onCreateManager={() => undefined}
        onSubscribe={() => undefined}
      />,
    );

    const status = container.querySelector('.execution-status');
    expect(status).not.toBeNull();
    expect(within(status as HTMLElement).getByText('Quote expired. Refresh pricing before signing.')).toBeVisible();
    expect(screen.queryByText('Transaction failed. Review the error and retry.')).toBeNull();
  });
});
