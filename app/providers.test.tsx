import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Providers } from './providers';

vi.mock('@mysten/dapp-kit-react', () => ({
  DAppKitProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dapp-kit-provider">{children}</div>
  ),
}));

vi.mock('../src/sui/dappKit', () => ({
  dAppKit: {},
}));

describe('Providers', () => {
  it('wraps app content in the DAppKit provider so wallet hooks work outside the connect button', () => {
    render(
      <Providers>
        <span>app child</span>
      </Providers>,
    );

    expect(screen.getByTestId('dapp-kit-provider')).toContainElement(screen.getByText('app child'));
  });
});
