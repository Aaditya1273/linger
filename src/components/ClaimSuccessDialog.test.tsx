import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClaimSuccessDialog, type ClaimSuccessSummary } from './ClaimSuccessDialog';

const DIGEST = 'F1b2C3d4E5f6G7h8I9j0A1b2C3d4E5f6G7h8I9j0WXYZ';
const NOTE = { principal: 5, targetPrice: 65_500, coupon: 0.007453 };

function returnedSuccess(): ClaimSuccessSummary {
  return {
    digest: DIGEST,
    grossPayout: 5.006708,
    feeAmount: 0.000745,
    netPayout: 5.005963,
    settlementPrice: 65_600,
  };
}

function convertedSuccess(): ClaimSuccessSummary {
  return {
    digest: DIGEST,
    grossPayout: 4.943865,
    feeAmount: 0.000745,
    netPayout: 4.94312,
    settlementPrice: 64_200,
  };
}

describe('ClaimSuccessDialog', () => {
  it('renders nothing until a claim succeeds', () => {
    render(<ClaimSuccessDialog note={NOTE} success={null} onClose={() => undefined} />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the net payout hero, breakdown, and returned-principal outcome', () => {
    render(<ClaimSuccessDialog note={NOTE} success={returnedSuccess()} onClose={() => undefined} />);

    expect(screen.getByRole('dialog', { name: 'Claim confirmed' })).toBeVisible();
    // Cash renders at two decimals, so the net hero and gross row coincide here.
    expect(screen.getAllByText('5.01 dUSDC')).toHaveLength(2);
    expect(screen.getByText('−<0.01 dUSDC')).toBeVisible();
    expect(
      screen.getByText('Settled at $65,600 — your principal was returned in dUSDC, coupon included.'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: /View transaction/ })).toHaveAttribute(
      'href',
      `https://testnet.suivision.xyz/txblock/${DIGEST}`,
    );
  });

  it('explains the conversion at the target price when the payout lands below principal', () => {
    render(<ClaimSuccessDialog note={NOTE} success={convertedSuccess()} onClose={() => undefined} />);

    expect(
      screen.getByText(
        'Settled at $64,200 — your deposit converted at the $65,500 target (≈ 0.000076 BTC) plus your 0.01 dUSDC reward, cash-settled in dUSDC on testnet.',
      ),
    ).toBeVisible();
  });

  it('classifies by the settlement price even when the payout beats the principal', () => {
    // Settled just below the target: the ladder still paid in full, so the net
    // payout exceeds the principal — the outcome is a conversion regardless.
    render(
      <ClaimSuccessDialog
        note={NOTE}
        success={{ ...returnedSuccess(), settlementPrice: 65_400 }}
        onClose={() => undefined}
      />,
    );

    expect(screen.getByText(/Settled at \$65,400 — your deposit converted at the \$65,500 target/)).toBeVisible();
  });

  it('renders the card in Chinese and closes via the Done button', () => {
    const onClose = vi.fn();
    render(<ClaimSuccessDialog note={NOTE} success={returnedSuccess()} locale="zh-CN" onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: '领取成功' })).toBeVisible();
    expect(screen.getByText('你已收到')).toBeVisible();
    expect(screen.getByText('结算价 $65,600：本金以 dUSDC 返还，票息照付。')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '完成' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
