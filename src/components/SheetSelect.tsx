'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Dialog } from '../ui';
import { useIsMobile } from '../hooks/useIsMobile';

export interface SheetSelectOption {
  id: string;
  /** Bold lead of the option row — carries the check mark when selected. */
  primary: ReactNode;
  /** Muted trailing detail of the option row. */
  secondary?: ReactNode;
}

export interface SheetSelectGroup {
  key: string;
  label: string;
  options: SheetSelectOption[];
}

/**
 * The app's single-select shell, styled like the rest of the sticker UI —
 * replaces native selects, whose popup is unbrandable (transparent gray in
 * Chromium). Desktop anchors a listbox card under the trigger; phones reuse
 * the Dialog bottom sheet. The trigger is a plain button, so it escapes the
 * global ≥16px form-control font (iOS anti-zoom) and fits on one line.
 */
export function SheetSelect({
  value,
  groups,
  onSelect,
  label,
  closeLabel,
  triggerValue,
  sheetNote,
  disabled = false,
  className,
}: {
  value: string;
  groups: SheetSelectGroup[];
  onSelect: (id: string) => void;
  /** Accessible name for the trigger and listbox, and the sheet's title. */
  label: string;
  /** Localised label for the sheet's ✕ button. */
  closeLabel: string;
  /** Compact summary of the selection shown inside the trigger. */
  triggerValue: ReactNode;
  /** Optional note beside the sheet title (e.g. a timezone disclosure). */
  sheetNote?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();

  // Desktop popover dismissal — outside pointerdown or Escape (sheet mode
  // delegates both to Dialog).
  useEffect(() => {
    if (!open || isMobile) return;
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !anchorRef.current?.contains(event.target)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, isMobile]);

  const pick = (id: string) => {
    onSelect(id);
    setOpen(false);
    if (!isMobile) triggerRef.current?.focus();
  };

  const optionList = (
    <div className="expiry-listbox" id={listboxId} role="listbox" aria-label={label}>
      {groups.map((group) =>
        group.options.length > 0 ? (
          <div className="expiry-group" key={group.key} role="group" aria-label={group.label}>
            <span className="expiry-group-label" aria-hidden="true">
              {group.label}
            </span>
            {group.options.map((option) => {
              const isSelected = option.id === value;
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={isSelected ? 'expiry-option selected' : 'expiry-option'}
                  key={option.id}
                  onClick={() => pick(option.id)}
                >
                  <strong>
                    {isSelected ? <Check aria-hidden="true" size={15} strokeWidth={3} /> : null}
                    {option.primary}
                  </strong>
                  {option.secondary !== undefined ? <span>{option.secondary}</span> : null}
                </button>
              );
            })}
          </div>
        ) : null,
      )}
    </div>
  );

  return (
    <div className={['sheet-select', className].filter(Boolean).join(' ')} ref={anchorRef}>
      <button
        type="button"
        className="expiry-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open && !isMobile ? listboxId : undefined}
        disabled={disabled}
        ref={triggerRef}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="expiry-trigger-value">{triggerValue}</span>
        <ChevronDown aria-hidden="true" size={18} strokeWidth={2.75} />
      </button>

      {open && isMobile ? (
        <Dialog open ariaLabel={label} closeLabel={closeLabel} className="expiry-sheet" onClose={() => setOpen(false)}>
          <header className="expiry-sheet-head">
            <h2>{label}</h2>
            {sheetNote ? <span>{sheetNote}</span> : null}
          </header>
          {optionList}
        </Dialog>
      ) : null}

      {open && !isMobile ? <div className="expiry-panel">{optionList}</div> : null}
    </div>
  );
}
