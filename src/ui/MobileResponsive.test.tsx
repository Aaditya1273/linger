import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MobileDisclosure } from './MobileDisclosure';

describe('MobileDisclosure', () => {
  it('lets a user reveal and hide secondary mobile content without removing its desktop surface', () => {
    render(
      <MobileDisclosure summary="Current reference" expandLabel="Show prices" collapseLabel="Hide prices">
        <p>Price ladder</p>
      </MobileDisclosure>,
    );

    const toggle = screen.getByRole('button', { name: /Current reference.*Show prices/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Price ladder').parentElement).toHaveAttribute('data-mobile-collapsed', 'true');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAccessibleName(/Current reference.*Hide prices/i);
    expect(screen.getByText('Price ladder').parentElement).toHaveAttribute('data-mobile-collapsed', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});
