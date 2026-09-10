'use client';

import { ChevronDown } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

export interface MobileDisclosureProps {
  summary: ReactNode;
  children: ReactNode;
  expandLabel: string;
  collapseLabel: string;
  className?: string;
  contentClassName?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * A disclosure only on phone widths. CSS keeps its content permanently visible
 * from 768px upward, while the same DOM becomes a compact, accessible reveal on
 * mobile. Controlled mode lets a parent close it after a selection.
 */
export function MobileDisclosure({
  summary,
  children,
  expandLabel,
  collapseLabel,
  className,
  contentClassName,
  defaultOpen = false,
  open,
  onOpenChange,
}: MobileDisclosureProps) {
  const contentId = useId();
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const expanded = open ?? internalOpen;

  function setExpanded(nextOpen: boolean) {
    if (open === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  return (
    <div className={['mobile-disclosure', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className="mobile-disclosure__toggle"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="mobile-disclosure__summary">{summary}</span>
        <span className="mobile-disclosure__action">{expanded ? collapseLabel : expandLabel}</span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      <div
        id={contentId}
        className={['mobile-disclosure__content', contentClassName].filter(Boolean).join(' ')}
        data-mobile-collapsed={expanded ? 'false' : 'true'}
      >
        {children}
      </div>
    </div>
  );
}
