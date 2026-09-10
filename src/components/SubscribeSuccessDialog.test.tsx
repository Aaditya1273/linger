import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StructuredProductQuote } from '../products/types';
import { SubscribeSuccessDialog } from './SubscribeSuccessDialog';

const DIGEST = 'A1b2C3d4E5f6G7h8I9j0A1b2C3d4E5f6G7h8I9j0ABCD';

function quoteFixture(): StructuredProductQuote {
  return {
    id: 'quote-1',
    productType: 'dual-investment',
    title: 'BTC Dual Investment · Buy Low',
    principal: 1_000,
    quoteAsset: 'dUSDC',
    oracle: {
      predictId: `0x${'1'.repeat(64)}`,
      oracleId: `0x${'2'.repeat(64)}`,
      underlyingAsset: 'BTC',
      expiryMs: Date.UTC(2026, 6, 21, 8, 0, 0),
      minStrike: 50_000,
      tickSize: 0.01,
      status: 'active',
      spot: 66_172,
      forward: 66_167,
      spotTimestampMs: 1,
      sviTimestampMs: 1,
      serverLagSeconds: 1,
    },
    legs: [],
    totalLegCost: 2.1,
    reserve: 995,
    coupon: 7.4531,
    targetPrice: 66_000,
    floorPrice: 61_000,
    apr: 0.0916,
    executable: true,
    scenarios: [],
  };
}

describe('SubscribeSuccessDialog', () => {
  it('renders nothing until a confirmed digest arrives', () => {
    render(<SubscribeSuccessDialog quote={quoteFixture()} digest={null} onClose={() => undefined} />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the confirmed terms, transaction link, and portfolio CTA', () => {
    render(<SubscribeSuccessDialog quote={quoteFixture()} digest={DIGEST} onClose={() => undefined} />);

    const dialog = screen.getByRole('dialog', { name: 'Subscription confirmed' });
    expect(dialog).toBeVisible();
    expect(screen.getByText('BTC Dual Investment · Buy Low')).toBeVisible();
    expect(screen.getByText('1,000.00 dUSDC')).toBeVisible();
    expect(screen.getByText('$66,000')).toBeVisible();
    expect(screen.getByText('7.45 dUSDC')).toBeVisible();
    expect(screen.getByText('9.16%')).toBeVisible();
    expect(screen.getByRole('link', { name: /View transaction/ })).toHaveAttribute(
      'href',
      `https://testnet.suivision.xyz/txblock/${DIGEST}`,
    );
    expect(screen.getByRole('link', { name: 'View Portfolio' })).toHaveAttribute('href', '/en/app/portfolio');
  });

  it('renders the card in Chinese', () => {
    render(
      <SubscribeSuccessDialog quote={quoteFixture()} digest={DIGEST} locale="zh-CN" onClose={() => undefined} />,
    );

    expect(screen.getByRole('dialog', { name: '订阅成功' })).toBeVisible();
    expect(screen.getByText('本金')).toBeVisible();
    expect(screen.getByRole('link', { name: '查看持仓' })).toHaveAttribute('href', '/zh-CN/app/portfolio');
    expect(screen.getByRole('button', { name: '关闭' })).toBeVisible();
  });

  it('closes via the ✕ button, Escape, and a backdrop click — but not clicks inside the card', () => {
    const onClose = vi.fn();
    render(<SubscribeSuccessDialog quote={quoteFixture()} digest={DIGEST} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByText('BTC Dual Investment · Buy Low'));
    expect(onClose).toHaveBeenCalledTimes(2);

    const backdrop = document.querySelector('.anker-dialog-backdrop');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
