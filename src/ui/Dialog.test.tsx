import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Dialog } from './Dialog';

function Harness({ open }: { open: boolean }) {
  return (
    <>
      <button type="button">outside</button>
      <Dialog open={open} onClose={() => {}} ariaLabel="Test dialog" closeLabel="Close">
        <button type="button">first</button>
        <button type="button">last</button>
      </Dialog>
    </>
  );
}

describe('Dialog focus management', () => {
  it('moves focus onto the card while open and hands it back on close', () => {
    const { rerender } = render(<Harness open={false} />);
    const outside = screen.getByRole('button', { name: 'outside' });
    outside.focus();

    rerender(<Harness open />);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));

    rerender(<Harness open={false} />);
    expect(document.activeElement).toBe(outside);
  });

  it('wraps Tab from the last control back to the first (and Shift+Tab the reverse)', () => {
    render(<Harness open />);
    const dialog = screen.getByRole('dialog');
    const close = screen.getByRole('button', { name: 'Close' });
    const last = screen.getByRole('button', { name: 'last' });

    last.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    close.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
