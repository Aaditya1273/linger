// Pure presentational primitive — universal (no 'use client').
// Reuses the existing `.di-field` + `.di-input-wrap` styling (Card pattern).
import type { InputHTMLAttributes, ReactNode } from 'react';

export interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Optional field label (wraps the input in a labelled `.di-field`). */
  label?: ReactNode;
  /** Optional trailing unit/hint shown inside the input frame (the `<i>`). */
  suffix?: ReactNode;
  /**
   * Optional formatted stand-in ("$65,500") shown over the raw value while
   * the field is not focused. CSS swaps the pair on :focus-within, so the
   * input keeps its role and value — editing always works on the raw number.
   */
  displayValue?: ReactNode;
}

/** A bordered numeric/text input with an optional label and trailing unit. */
export function InputField({ label, suffix, className, displayValue, ...inputProps }: InputFieldProps) {
  const control = (
    <div className="di-input-wrap">
      <input className={className} {...inputProps} />
      {displayValue != null ? (
        <span className="di-input-display" aria-hidden="true">
          {displayValue}
        </span>
      ) : null}
      {suffix != null ? <i>{suffix}</i> : null}
    </div>
  );

  if (label == null) return control;

  return (
    <label className="di-field">
      <span>{label}</span>
      {control}
    </label>
  );
}
